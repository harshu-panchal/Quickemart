import dotenv from "dotenv";
import Order from "../models/order.js";
import Delivery from "../models/delivery.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import logger from "../services/logger.js";

dotenv.config();

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

const DEFAULT_CITY_SPEED_KMPH = 24;

export const processOrderArrivalUpdates = async () => {
  try {
    const now = new Date();

    // Find active orders currently out for delivery
    const activeOrders = await Order.find({
      status: "out_for_delivery",
      deliveryBoy: { $exists: true, $ne: null }
    });

    for (const order of activeOrders) {
      try {
        const outTime = order.outForDeliveryAt || order.pickupConfirmedAt || order.updatedAt;
        if (!outTime) continue;

        const elapsedMs = now.getTime() - new Date(outTime).getTime();
        const lastSentTime = order.lastArrivingNotificationSentAt;
        const notificationCount = order.arrivingNotificationCount || 0;

        let shouldSend = false;

        if (notificationCount === 0) {
          // First update: 1 minute (60,000 ms) after outForDelivery
          if (elapsedMs >= 60000) {
            shouldSend = true;
          }
        } else {
          // Subsequent updates: every 3 minutes (180,000 ms) after last sent
          if (lastSentTime) {
            const msSinceLastSent = now.getTime() - new Date(lastSentTime).getTime();
            if (msSinceLastSent >= 180000) {
              shouldSend = true;
            }
          }
        }

        if (shouldSend) {
          // Fetch rider's location
          const rider = await Delivery.findById(order.deliveryBoy).select("location").lean();
          let etaMinutes = null;

          if (rider && rider.location && rider.location.coordinates) {
            const riderLng = rider.location.coordinates[0];
            const riderLat = rider.location.coordinates[1];
            const destLat = order.address?.location?.lat;
            const destLng = order.address?.location?.lng;

            if (
              Number.isFinite(riderLat) &&
              Number.isFinite(riderLng) &&
              Number.isFinite(destLat) &&
              Number.isFinite(destLng)
            ) {
              const distance = calculateDistance(riderLat, riderLng, destLat, destLng);
              etaMinutes = Math.max(1, Math.round((distance * 1.3 * 60) / (DEFAULT_CITY_SPEED_KMPH * 1000)));
            }
          }

          // Emit order arriving notification
          const etaText = etaMinutes ? `${etaMinutes} mins` : "a few minutes";
          emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_ARRIVING, {
            orderId: order.orderId,
            customerId: order.customer,
            userId: order.customer,
            etaText
          });

          // Update order fields
          await Order.updateOne(
            { _id: order._id },
            {
              $set: {
                lastArrivingNotificationSentAt: now,
                arrivingNotificationCount: notificationCount + 1
              }
            }
          );

          logger.info("Order arriving notification sent", {
            orderId: order.orderId,
            etaText,
            notificationCount: notificationCount + 1
          });
        }
      } catch (err) {
        logger.error("Failed to process order arrival update", {
          orderId: order.orderId,
          error: err.message
        });
      }
    }
  } catch (error) {
    logger.error("Failed to execute processOrderArrivalUpdates job", {
      error: error.message
    });
  }
};

export const getOrderArrivalUpdatesJobInterval = () => 30000; // run every 30 seconds
export const getOrderArrivalUpdatesJobHandler = () => processOrderArrivalUpdates;

/**
 * Socket.IO — order rooms, role rooms, JWT auth.
 */
import { verifySocketToken } from "./socketAuth.js";
import mongoose from "mongoose";
import Ticket from "../models/ticket.js";
import Order from "../models/order.js";


let _io = null;

const deliverySockets = new Map();

export const initSocket = (io) => {
  _io = io;

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      null;
    if (!token) {
      socket.user = null;
      return next();
    }
    const user = verifySocketToken(token);
    if (!user) {
      return next(new Error("Unauthorized"));
    }
    socket.user = user;
    next();
  });

  io.on("connection", (socket) => {
    const { id: userId, role } = socket.user || {};
    if (!userId) {
      return;
    }

    if (role === "delivery") {
      const dId = userId.toString();
      deliverySockets.set(dId, socket.id);
      socket.join("delivery:online");
      socket.join(`delivery:${dId}`);
    }
    if (role === "seller") {
      socket.join(`seller:${userId}`);
    }
    if (role === "customer" || role === "user") {
      socket.join(`customer:${userId}`);
    }
    if (role === "admin") {
      socket.join("admin:orders");
      socket.join("admin:support");
      // Per-admin room — used by the notification service to push
      // `notification:new` deltas to the specific admin who owns the
      // Notification row, so the topbar can refresh without polling.
      socket.join(`admin:${userId}`);
    }

    socket.on("join_order", async (orderId) => {
      if (!orderId || typeof orderId !== "string") return;
      const raw = orderId.trim();
      if (!raw) return;

      // Always join the room keyed by whatever the client sent first (instant, no DB hit).
      // This covers the common case where the URL already contains the canonical orderId.
      socket.join(`order:${raw}`);

      // Then resolve the canonical orderId from the DB so that events emitted to
      // `order:<canonicalId>` are received even when the client joined by Mongo ObjectId
      // or checkoutGroupId. This is the root-cause fix for real-time status updates
      // not reaching customers who navigated from a non-canonical URL.
      try {
        const isObjectId =
          raw.length === 24 &&
          mongoose.Types.ObjectId.isValid(raw) &&
          new mongoose.Types.ObjectId(raw).toString() === raw;

        if (isObjectId) {
          const doc = await Order.findById(raw).select("orderId").lean();
          if (doc?.orderId && doc.orderId !== raw) {
            socket.join(`order:${doc.orderId}`);
          }
        } else {
          // Could be a checkoutGroupId — resolve by checkoutGroupId match
          const doc = await Order.findOne({ checkoutGroupId: raw }).select("orderId").lean();
          if (doc?.orderId && doc.orderId !== raw) {
            socket.join(`order:${doc.orderId}`);
          }
        }
      } catch {
        // Non-critical: if DB lookup fails, client stays in the raw room joined above
      }
    });

    socket.on("leave_order", (orderId) => {
      if (!orderId) return;
      socket.leave(`order:${orderId}`);
    });

    socket.on("join_ticket", async (ticketId) => {
      const raw = typeof ticketId === "string" ? ticketId.trim() : "";
      if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return;

      if (socket.user?.role === "admin") {
        socket.join(`ticket:${raw}`);
        return;
      }

      try {
        const ticket = await Ticket.findById(raw).select("userId").lean();
        if (!ticket?.userId) return;
        if (ticket.userId.toString() !== userId.toString()) return;
        socket.join(`ticket:${raw}`);
      } catch {
        /* ignore */
      }
    });

    socket.on("leave_ticket", (ticketId) => {
      if (!ticketId) return;
      socket.leave(`ticket:${String(ticketId).trim()}`);
    });

    socket.on("register_delivery", (deliveryId) => {
      if (deliveryId && socket.user?.role === "delivery") {
        deliverySockets.set(deliveryId.toString(), socket.id);
      }
    });

    socket.on("disconnect", () => {
      for (const [id, sid] of deliverySockets.entries()) {
        if (sid === socket.id) {
          deliverySockets.delete(id);
          break;
        }
      }
    });
  });
};

export const getIO = () => {
  if (!_io) throw new Error("Socket.IO not initialized");
  return _io;
};

export const notifyDeliveryPartners = (orderData) => {
  if (!_io) return;
  _io.to("delivery:online").emit("new_order_packed", orderData);
};

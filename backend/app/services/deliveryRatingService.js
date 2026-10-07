import mongoose from "mongoose";
import DeliveryRating from "../models/deliveryRating.js";
import Order from "../models/order.js";
import Delivery from "../models/delivery.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";

const ALLOWED_TAGS = [
  "ON_TIME",
  "POLITE",
  "PROFESSIONAL",
  "GOOD_COMMUNICATION",
  "CAREFUL_HANDLING",
];

function toObjectId(id) {
  if (!id) return null;
  const str = String(id);
  if (mongoose.Types.ObjectId.isValid(str)) {
    return new mongoose.Types.ObjectId(str);
  }
  return str;
}

export async function recalculateDeliveryPartnerRating(deliveryPartnerId) {
  const partnerId = toObjectId(deliveryPartnerId);

  const stats = await DeliveryRating.aggregate([
    {
      $match: {
        deliveryPartnerId: partnerId,
        status: "ACTIVE",
      },
    },
    {
      $group: {
        _id: "$deliveryPartnerId",
        totalRatings: { $sum: 1 },
        averageRating: { $avg: "$rating" },
      },
    },
  ]);

  const ratingCount = stats[0]?.totalRatings || 0;
  const rawAvg = stats[0]?.averageRating || 0;
  const averageRating = Number(rawAvg.toFixed(2));

  await Delivery.findByIdAndUpdate(deliveryPartnerId, {
    averageRating,
    ratingCount,
  });

  return { averageRating, ratingCount };
}

export async function submitDeliveryRating(customerId, { orderId, rating, review = "", tags = [] }) {
  if (!orderId) {
    const err = new Error("Order ID is required");
    err.statusCode = 400;
    throw err;
  }

  const numRating = Number(rating);
  if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
    const err = new Error("Rating must be an integer between 1 and 5");
    err.statusCode = 400;
    throw err;
  }

  const sanitizedTags = Array.isArray(tags)
    ? tags.filter((tag) => ALLOWED_TAGS.includes(String(tag).toUpperCase())).map((t) => String(t).toUpperCase())
    : [];

  const order = await Order.findById(orderId).lean();
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  // Verify ownership
  if (String(order.customer) !== String(customerId)) {
    const err = new Error("Unauthorized to rate this order");
    err.statusCode = 403;
    throw err;
  }

  // Verify status is DELIVERED
  const currentStatus = String(order.orderStatus || "").toLowerCase();
  const isDelivered = currentStatus === "delivered" || currentStatus === WORKFLOW_STATUS.DELIVERED.toLowerCase();
  if (!isDelivered) {
    const err = new Error("Delivery ratings can only be submitted for delivered orders");
    err.statusCode = 400;
    throw err;
  }

  // Determine final delivery partner who completed delivery
  const finalDeliveryPartnerId = order.deliveryBoy || order.deliveryPartner;
  if (!finalDeliveryPartnerId) {
    const err = new Error("No delivery partner assigned to this order");
    err.statusCode = 400;
    throw err;
  }

  // Check duplicate submission
  const existing = await DeliveryRating.findOne({
    orderId: order._id,
    customerId,
  });
  if (existing) {
    const err = new Error("You have already submitted a delivery rating for this order");
    err.statusCode = 400;
    throw err;
  }

  try {
    const created = await DeliveryRating.create({
      orderId: order._id,
      customerId,
      deliveryPartnerId: finalDeliveryPartnerId,
      rating: numRating,
      review: String(review || "").trim(),
      tags: sanitizedTags,
      status: "ACTIVE",
    });

    const aggregates = await recalculateDeliveryPartnerRating(finalDeliveryPartnerId);

    return {
      rating: created,
      partnerAggregates: aggregates,
    };
  } catch (error) {
    if (error.code === 11000) {
      const err = new Error("You have already submitted a delivery rating for this order");
      err.statusCode = 400;
      throw err;
    }
    throw error;
  }
}

export async function getDeliveryRatingForOrder(customerId, orderId) {
  const order = await Order.findById(orderId).lean();
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (String(order.customer) !== String(customerId)) {
    const err = new Error("Unauthorized access to order rating details");
    err.statusCode = 403;
    throw err;
  }

  const currentStatus = String(order.orderStatus || "").toLowerCase();
  const isDelivered = currentStatus === "delivered" || currentStatus === WORKFLOW_STATUS.DELIVERED.toLowerCase();
  const finalDeliveryPartnerId = order.deliveryBoy || order.deliveryPartner;

  let deliveryPartner = null;
  if (finalDeliveryPartnerId) {
    deliveryPartner = await Delivery.findById(finalDeliveryPartnerId)
      .select("_id name phone vehicleType profileImage averageRating ratingCount")
      .lean();
  }

  const existingRating = await DeliveryRating.findOne({
    orderId: order._id,
    customerId,
    status: "ACTIVE",
  }).lean();

  return {
    eligible: isDelivered && Boolean(finalDeliveryPartnerId) && !existingRating,
    rated: Boolean(existingRating),
    deliveryPartner: deliveryPartner
      ? {
          id: deliveryPartner._id,
          name: deliveryPartner.name,
          vehicleType: deliveryPartner.vehicleType,
          profileImage: deliveryPartner.profileImage || null,
          averageRating: deliveryPartner.averageRating || 0,
          ratingCount: deliveryPartner.ratingCount || 0,
        }
      : null,
    rating: existingRating || null,
  };
}

export async function getDeliveryPartnerRatingSummary(deliveryPartnerId) {
  const partnerId = toObjectId(deliveryPartnerId);
  const partner = await Delivery.findById(deliveryPartnerId)
    .select("_id name vehicleType profileImage averageRating ratingCount")
    .lean();

  if (!partner) {
    const err = new Error("Delivery partner not found");
    err.statusCode = 404;
    throw err;
  }

  const distStats = await DeliveryRating.aggregate([
    {
      $match: {
        deliveryPartnerId: partnerId,
        status: "ACTIVE",
      },
    },
    {
      $group: {
        _id: "$rating",
        count: { $sum: 1 },
      },
    },
  ]);

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRatings = 0;
  let sumScore = 0;

  for (const item of distStats) {
    const score = Number(item._id);
    const count = Number(item.count || 0);
    if (score >= 1 && score <= 5) {
      distribution[score] = count;
      totalRatings += count;
      sumScore += score * count;
    }
  }

  const averageRating = totalRatings > 0 ? Number((sumScore / totalRatings).toFixed(2)) : 0;

  return {
    deliveryPartner: {
      id: partner._id,
      name: partner.name,
      vehicleType: partner.vehicleType,
      profileImage: partner.profileImage || null,
    },
    averageRating,
    totalRatings,
    distribution,
  };
}

export async function getDeliveryPartnerReviews(deliveryPartnerId, { page = 1, limit = 10 }) {
  const pageNum = Math.max(1, Number(page || 1));
  const limitNum = Math.min(50, Math.max(1, Number(limit || 10)));
  const skip = (pageNum - 1) * limitNum;

  const partnerId = toObjectId(deliveryPartnerId);

  const [ratings, total] = await Promise.all([
    DeliveryRating.find({ deliveryPartnerId: partnerId, status: "ACTIVE" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate("customerId", "name avatar profileImage")
      .lean(),
    DeliveryRating.countDocuments({ deliveryPartnerId: partnerId, status: "ACTIVE" }),
  ]);

  const sanitizedRatings = ratings.map((r) => ({
    id: r._id,
    orderId: r.orderId,
    rating: r.rating,
    review: r.review,
    tags: r.tags || [],
    createdAt: r.createdAt,
    customerName: r.customerId?.name ? r.customerId.name.split(" ")[0] : "Customer",
  }));

  const summary = await getDeliveryPartnerRatingSummary(deliveryPartnerId);

  return {
    ratings: sanitizedRatings,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
    summary,
  };
}

export async function getAdminDeliveryRatings({ page = 1, limit = 20, deliveryPartnerId = null }) {
  const pageNum = Math.max(1, Number(page || 1));
  const limitNum = Math.min(100, Math.max(1, Number(limit || 20)));
  const skip = (pageNum - 1) * limitNum;

  const match = { status: "ACTIVE" };
  if (deliveryPartnerId) {
    match.deliveryPartnerId = toObjectId(deliveryPartnerId);
  }

  const [ratings, total] = await Promise.all([
    DeliveryRating.find(match)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate("customerId", "name email phone")
      .populate("deliveryPartnerId", "name phone vehicleType")
      .populate("orderId", "orderId orderStatus createdAt")
      .lean(),
    DeliveryRating.countDocuments(match),
  ]);

  return {
    ratings,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

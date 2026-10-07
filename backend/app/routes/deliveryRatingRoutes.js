import express from "express";
import {
  createDeliveryRating,
  getOrderDeliveryRating,
  getDeliveryPartnerSummary,
  getSelfDeliveryPartnerSummary,
  getDeliveryPartnerReviews,
  getAdminDeliveryRatings,
} from "../controller/deliveryRatingController.js";
import { verifyToken, allowRoles, optionalVerifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Customer endpoints
router.post("/", verifyToken, createDeliveryRating);
router.get("/order/:orderId", verifyToken, getOrderDeliveryRating);

// Self delivery partner summary (for Rider Dashboard & Profile)
router.get("/me/summary", verifyToken, allowRoles("delivery"), getSelfDeliveryPartnerSummary);

// Partner public / auth endpoints
router.get("/partner/:id/summary", optionalVerifyToken, getDeliveryPartnerSummary);
router.get("/partner/:id/reviews", optionalVerifyToken, getDeliveryPartnerReviews);

// Admin monitoring endpoint
router.get("/admin/all", verifyToken, allowRoles("admin"), getAdminDeliveryRatings);

export default router;

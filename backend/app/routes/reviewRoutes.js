import express from "express";
import {
    submitReview,
    getProductReviews,
    checkEligibility,
    deleteUserReview,
    getAdminReviews,
    updateReviewStatus,
} from "../controller/reviewController.js";
import { verifyToken, allowRoles, optionalVerifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public / Optional auth routes
router.get("/product/:productId", optionalVerifyToken, getProductReviews);

// Authenticated customer routes
router.get("/check-eligibility", verifyToken, checkEligibility);
router.post("/submit", verifyToken, submitReview);
router.delete("/:reviewId", verifyToken, deleteUserReview);

// Admin only routes
router.get("/admin/all", verifyToken, allowRoles("admin"), getAdminReviews);
router.get("/admin/pending", verifyToken, allowRoles("admin"), getAdminReviews);
router.patch("/admin/status/:id", verifyToken, allowRoles("admin"), updateReviewStatus);

export default router;

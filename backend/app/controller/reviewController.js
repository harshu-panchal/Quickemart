import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";
import Review from "../models/review.js";
import {
    resolveCanonicalProduct,
    verifyPurchaseEligibility,
    createOrUpdateReview,
    deleteReview as deleteReviewService,
    moderateReview as moderateReviewService,
} from "../services/reviewService.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";

/**
 * Check if current user is eligible to review a product.
 * Returns eligibility info and existing review if any.
 */
export const checkEligibility = async (req, res) => {
    try {
        const { productId } = req.query;
        if (!productId) {
            return handleResponse(res, 400, "productId query parameter is required");
        }

        const userId = req.user.id || req.user._id;
        const eligibility = await verifyPurchaseEligibility(userId, productId);

        const existingReview = await Review.findOne({
            userId,
            canonicalProductId: eligibility.canonical.canonicalProductId,
        }).lean();

        return handleResponse(res, 200, "Eligibility checked successfully", {
            isEligible: eligibility.isEligible,
            reason: eligibility.reason || null,
            existingReview: existingReview || null,
            canonicalProductId: eligibility.canonical.canonicalProductId,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/**
 * Submit or edit a review for a product.
 */
export const submitReview = async (req, res) => {
    try {
        const { productId, rating, comment, photos: inputPhotos } = req.body;
        const userId = req.user.id || req.user._id;

        if (!productId) {
            return handleResponse(res, 400, "productId is required");
        }
        if (!rating) {
            return handleResponse(res, 400, "rating is required");
        }

        let photos = [];
        if (Array.isArray(inputPhotos)) {
            photos = inputPhotos.filter((p) => typeof p === "string" && p.trim().length > 0);
        }

        // Handle uploaded file buffers if sent via multipart form (e.g. req.files)
        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
            for (const file of req.files) {
                if (file.buffer) {
                    const uploadedUrl = await uploadToCloudinary(file.buffer, "reviews", {
                        mimeType: file.mimetype,
                    });
                    photos.push(uploadedUrl);
                }
            }
        }

        const review = await createOrUpdateReview(userId, {
            productId,
            rating,
            comment,
            photos,
        });

        return handleResponse(res, 200, "Review submitted successfully", review);
    } catch (error) {
        const statusCode = error.message.includes("delivered") || error.message.includes("Rating must be") ? 400 : 500;
        return handleResponse(res, statusCode, error.message);
    }
};

/**
 * Get published reviews for a canonical product with pagination, filtering, and summary.
 */
export const getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        const { rating, hasPhotos, sort = "newest" } = req.query;
        const { page, limit, skip } = getPagination(req, { defaultLimit: 10, maxLimit: 50 });

        const canonical = await resolveCanonicalProduct(productId);
        const query = {
            $or: [
                { canonicalProductId: canonical.canonicalProductId },
                { productId: canonical.product._id },
            ],
            status: { $in: ["published", "approved"] },
        };

        if (rating) {
            const parsedRating = Number(rating);
            if (parsedRating >= 1 && parsedRating <= 5) {
                query.rating = parsedRating;
            }
        }

        if (hasPhotos === "true") {
            query["photos.0"] = { $exists: true };
        }

        let sortOption = { createdAt: -1 };
        if (sort === "rating_desc") {
            sortOption = { rating: -1, createdAt: -1 };
        } else if (sort === "rating_asc") {
            sortOption = { rating: 1, createdAt: -1 };
        }

        const [reviews, total] = await Promise.all([
            Review.find(query)
                .populate("userId", "name image avatar profileImage")
                .sort(sortOption)
                .skip(skip)
                .limit(limit)
                .lean(),
            Review.countDocuments(query),
        ]);

        // Standardize user format for frontend output
        const formattedReviews = reviews.map((r) => ({
            ...r,
            user: {
                _id: r.userId?._id || r.userId,
                name: r.userId?.name || "Verified Customer",
                image: r.userId?.image || r.userId?.avatar || r.userId?.profileImage || null,
            },
        }));

        return handleResponse(res, 200, "Reviews retrieved successfully", {
            reviews: formattedReviews,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
            canonicalProductId: canonical.canonicalProductId,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/**
 * Delete a user's own review or admin deletion.
 */
export const deleteUserReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const user = req.user;

        const result = await deleteReviewService(reviewId, user);
        return handleResponse(res, 200, "Review deleted successfully", result);
    } catch (error) {
        const statusCode = error.message.includes("Unauthorized") ? 403 : error.message.includes("not found") ? 404 : 500;
        return handleResponse(res, statusCode, error.message);
    }
};

/**
 * Admin: Get paginated reviews for moderation.
 */
export const getAdminReviews = async (req, res) => {
    try {
        const { status, page: reqPage, limit: reqLimit } = req.query;
        const { page, limit, skip } = getPagination(req, { defaultLimit: 20, maxLimit: 100 });

        const query = {};
        if (status && ["published", "hidden"].includes(status)) {
            query.status = status;
        }

        const [reviews, total] = await Promise.all([
            Review.find(query)
                .populate("userId", "name email")
                .populate("productId", "name mainImage")
                .populate("sellerId", "name storeName")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Review.countDocuments(query),
        ]);

        return handleResponse(res, 200, "Admin reviews fetched successfully", {
            reviews,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/**
 * Admin: Update review moderation status.
 */
export const updateReviewStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, moderationReason } = req.body;
        const adminId = req.user.id || req.user._id;

        const updatedReview = await moderateReviewService(id, adminId, status, moderationReason);
        return handleResponse(res, 200, `Review status updated to ${status}`, updatedReview);
    } catch (error) {
        const statusCode = error.message.includes("not found") ? 404 : 400;
        return handleResponse(res, statusCode, error.message);
    }
};

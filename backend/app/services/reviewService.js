import mongoose from "mongoose";
import Review from "../models/review.js";
import Product from "../models/product.js";
import MasterProduct from "../models/masterProduct.js";
import Order from "../models/order.js";

/**
 * Resolve canonical product for a given Product ID.
 */
export const resolveCanonicalProduct = async (productId) => {
    const product = await Product.findById(productId);
    if (!product) {
        throw new Error("Product not found");
    }

    if (product.masterProductId) {
        return {
            canonicalProductId: product.masterProductId,
            canonicalModel: "MasterProduct",
            product,
        };
    }

    return {
        canonicalProductId: product._id,
        canonicalModel: "Product",
        product,
    };
};

/**
 * Verify purchase eligibility for a user and product.
 * Returns qualifying order and canonical product details.
 */
export const verifyPurchaseEligibility = async (userId, productId) => {
    const canonical = await resolveCanonicalProduct(productId);
    
    let matchingProductIds = [canonical.product._id];
    if (canonical.canonicalModel === "MasterProduct") {
        const relatedProducts = await Product.find({
            masterProductId: canonical.canonicalProductId,
        }).select("_id");
        matchingProductIds = relatedProducts.map((p) => p._id);
    }

    // Find delivered order containing one of matching products
    const qualifyingOrder = await Order.findOne({
        customer: userId,
        status: "delivered",
        "items.product": { $in: matchingProductIds },
    }).sort({ createdAt: -1 });

    if (!qualifyingOrder) {
        return {
            isEligible: false,
            reason: "You can only review products that have been delivered to you.",
            canonical,
        };
    }

    const matchedItem = qualifyingOrder.items.find((item) =>
        matchingProductIds.some((id) => id.toString() === item.product.toString())
    );

    return {
        isEligible: true,
        order: qualifyingOrder,
        orderItem: matchedItem,
        canonical,
    };
};

/**
 * Recomputes aggregate rating statistics for a canonical product
 * and updates MasterProduct / Product models atomically.
 */
export const recomputeProductRatingAggregates = async (canonicalProductId, canonicalModel) => {
    const canonicalIdObj = new mongoose.Types.ObjectId(canonicalProductId);
    const stats = await Review.aggregate([
        {
            $match: {
                $or: [
                    { canonicalProductId: canonicalIdObj },
                    { productId: canonicalIdObj },
                ],
                status: { $in: ["published", "approved"] },
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
    let totalCount = 0;
    let totalScore = 0;

    stats.forEach((item) => {
        const ratingVal = Number(item._id);
        if (ratingVal >= 1 && ratingVal <= 5) {
            distribution[ratingVal] = item.count;
            totalCount += item.count;
            totalScore += ratingVal * item.count;
        }
    });

    const averageRating = totalCount > 0 ? Number((totalScore / totalCount).toFixed(1)) : 0;

    const ratingData = {
        averageRating,
        reviewCount: totalCount,
        ratingDistribution: distribution,
    };

    if (canonicalModel === "MasterProduct") {
        await MasterProduct.findByIdAndUpdate(canonicalProductId, ratingData);
        // Also update all seller listing products referencing this MasterProduct
        await Product.updateMany({ masterProductId: canonicalProductId }, ratingData);
    } else {
        await Product.findByIdAndUpdate(canonicalProductId, ratingData);
    }

    return ratingData;
};

/**
 * Create or edit a review for the authenticated user.
 */
export const createOrUpdateReview = async (userId, { productId, rating, comment = "", photos = [] }) => {
    const parsedRating = Number(rating);
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        throw new Error("Rating must be an integer between 1 and 5");
    }

    const eligibility = await verifyPurchaseEligibility(userId, productId);
    if (!eligibility.isEligible) {
        throw new Error(eligibility.reason);
    }

    const { canonical, order, orderItem } = eligibility;

    // Check if review already exists for this buyer and canonical product
    let review = await Review.findOne({
        userId,
        canonicalProductId: canonical.canonicalProductId,
    });

    if (review) {
        review.rating = parsedRating;
        review.comment = comment;
        review.photos = photos;
        review.status = "published";
        review.isVerifiedPurchase = true;
        await review.save();
    } else {
        review = await Review.create({
            canonicalProductId: canonical.canonicalProductId,
            canonicalModel: canonical.canonicalModel,
            productId: canonical.product._id,
            sellerId: canonical.product.sellerId,
            userId,
            orderId: order._id,
            orderItemId: orderItem ? orderItem._id : null,
            rating: parsedRating,
            comment,
            photos,
            status: "published",
            isVerifiedPurchase: true,
        });
    }

    await recomputeProductRatingAggregates(canonical.canonicalProductId, canonical.canonicalModel);
    return review;
};

/**
 * Remove a review.
 */
export const deleteReview = async (reviewId, user) => {
    const review = await Review.findById(reviewId);
    if (!review) {
        throw new Error("Review not found");
    }

    const isOwner = review.userId.toString() === user._id.toString();
    const isAdmin = user.role === "admin";

    if (!isOwner && !isAdmin) {
        throw new Error("Unauthorized to delete this review");
    }

    const { canonicalProductId, canonicalModel } = review;
    await Review.findByIdAndDelete(reviewId);

    await recomputeProductRatingAggregates(canonicalProductId, canonicalModel);
    return { success: true };
};

/**
 * Moderate review status (admin only).
 */
export const moderateReview = async (reviewId, adminId, status, moderationReason = "") => {
    if (!["published", "hidden"].includes(status)) {
        throw new Error("Invalid moderation status");
    }

    const review = await Review.findById(reviewId);
    if (!review) {
        throw new Error("Review not found");
    }

    review.status = status;
    review.moderatedBy = adminId;
    review.moderatedAt = new Date();
    review.moderationReason = moderationReason;
    await review.save();

    await recomputeProductRatingAggregates(review.canonicalProductId, review.canonicalModel);
    return review;
};

import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
    {
        canonicalProductId: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "canonicalModel",
            index: true,
        },
        canonicalModel: {
            type: String,
            enum: ["MasterProduct", "Product"],
            default: "Product",
        },
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
            index: true,
        },
        sellerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Seller",
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
        },
        orderItemId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
            validate: {
                validator: Number.isInteger,
                message: "Rating must be an integer between 1 and 5",
            },
        },
        comment: {
            type: String,
            default: "",
            trim: true,
            maxlength: 2000,
        },
        photos: [
            {
                type: String,
                trim: true,
            },
        ],
        status: {
            type: String,
            enum: ["published", "hidden", "pending", "approved", "rejected"],
            default: "published",
            index: true,
        },
        isVerifiedPurchase: {
            type: Boolean,
            default: true,
        },
        moderatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
        },
        moderatedAt: {
            type: Date,
            default: null,
        },
        moderationReason: {
            type: String,
            default: "",
            trim: true,
        },
    },
    { timestamps: true }
);

// Compound index for buyer and canonical product
reviewSchema.index({ userId: 1, canonicalProductId: 1 }, { unique: true, sparse: true });
reviewSchema.index({ canonicalProductId: 1, status: 1, createdAt: -1 });
reviewSchema.index({ productId: 1, status: 1, createdAt: -1 });

export default mongoose.models.Review || mongoose.model("Review", reviewSchema);

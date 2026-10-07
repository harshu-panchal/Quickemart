import mongoose from "mongoose";

const deliveryRatingSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      required: true,
      index: true,
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
    review: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    tags: [
      {
        type: String,
        enum: [
          "ON_TIME",
          "POLITE",
          "PROFESSIONAL",
          "GOOD_COMMUNICATION",
          "CAREFUL_HANDLING",
        ],
      },
    ],
    status: {
      type: String,
      enum: ["ACTIVE", "HIDDEN", "DELETED"],
      default: "ACTIVE",
      index: true,
    },
  },
  { timestamps: true }
);

// Database-level uniqueness: One customer rating per order
deliveryRatingSchema.index({ orderId: 1, customerId: 1 }, { unique: true });
deliveryRatingSchema.index({ deliveryPartnerId: 1, status: 1, createdAt: -1 });

export default mongoose.models.DeliveryRating || mongoose.model("DeliveryRating", deliveryRatingSchema);

import mongoose from "mongoose";

const productRequestSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
    },
    suggestedName: {
      type: String,
      required: true,
      trim: true,
    },
    suggestedBrand: {
      type: String,
      trim: true,
    },
    suggestedCategory: {
      type: String,
      trim: true,
    },
    additionalDetails: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminNote: {
      type: String,
      trim: true,
    },
    reviewedAt: {
      type: Date,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    resultMasterProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MasterProduct",
    }
  },
  { timestamps: true }
);

productRequestSchema.index({ sellerId: 1, status: 1 });
productRequestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("ProductRequest", productRequestSchema);

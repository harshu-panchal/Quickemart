import mongoose from "mongoose";

const userActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "userModel",
      required: false,
    },
    userModel: {
      type: String,
      enum: ["Customer", "Seller", "Delivery", "Admin", "User"],
      default: "User",
    },
    userCustomId: {
      type: String,
      default: "",
      index: true,
    },
    userName: {
      type: String,
      default: "Guest/System",
    },
    role: {
      type: String,
      enum: ["customer", "seller", "delivery", "admin", "system"],
      default: "system",
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ["AUTH", "ORDER", "INVENTORY", "PAYOUT", "PROFILE", "SYSTEM", "SECURITY"],
      default: "SYSTEM",
      index: true,
    },
    severity: {
      type: String,
      enum: ["INFO", "WARNING", "CRITICAL"],
      default: "INFO",
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: "0.0.0.0",
    },
    userAgent: {
      type: String,
      default: "",
    },
    deviceInfo: {
      browser: { type: String, default: "Unknown" },
      os: { type: String, default: "Unknown" },
      device: { type: String, default: "Desktop/Mobile" },
    },
  },
  {
    timestamps: true,
  }
);

userActivitySchema.index({ createdAt: -1 });
userActivitySchema.index({ role: 1, createdAt: -1 });
userActivitySchema.index({ category: 1, createdAt: -1 });

export default mongoose.model("UserActivity", userActivitySchema);

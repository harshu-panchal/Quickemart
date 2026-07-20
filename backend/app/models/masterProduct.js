import mongoose from "mongoose";

const masterProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    brand: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    keyFeatures: [
      {
        type: String,
        trim: true,
      },
    ],
    specifications: [
      {
        key: { type: String, trim: true },
        value: { type: String, trim: true },
      },
    ],
    searchTags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    mainImage: {
      type: String, // Cloudinary URL
    },
    galleryImages: [
      {
        type: String, // Array of Cloudinary URLs
      },
    ],
    sku: {
      type: String,
      trim: true,
    },
    galleryLabels: [
      {
        type: String,
        trim: true,
      },
    ],
    headerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    subcategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    unit: {
      type: String,
      trim: true,
    },
    packSize: {
      type: String,
      trim: true,
    },
    variants: [
      {
        name: String,
        unit: String,
        packSize: String,
        sku: String,
      },
    ],
    gstTax: {
      type: Number,
      default: 0,
      min: 0,
      max: 28,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
);

masterProductSchema.index({ name: "text", searchTags: "text", brand: "text" });
masterProductSchema.index({ headerId: 1, status: 1 });
masterProductSchema.index({ categoryId: 1, status: 1 });

export default mongoose.model("MasterProduct", masterProductSchema);

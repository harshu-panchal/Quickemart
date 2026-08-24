import mongoose from "mongoose";

const catalogImportTaskSchema = new mongoose.Schema(
  {
    excelBuffer: {
      type: Buffer,
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      default: "PENDING",
      index: true,
    },
    total: {
      type: Number,
      default: 0,
    },
    processed: {
      type: Number,
      default: 0,
    },
    success: {
      type: Number,
      default: 0,
    },
    skipped: {
      type: Number,
      default: 0,
    },
    failed: {
      type: Number,
      default: 0,
    },
    errors: [
      {
        row: Number,
        col: String,
        message: String,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("CatalogImportTask", catalogImportTaskSchema);

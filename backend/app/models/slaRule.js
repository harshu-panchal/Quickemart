import mongoose from "mongoose";
import {
  SLA_FORMULA_TYPE,
  SLA_VIOLATION_CATEGORY,
} from "../constants/finance.js";

const slaRuleVersionSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    formulaType: {
      type: String,
      enum: Object.values(SLA_FORMULA_TYPE),
      required: true,
    },
    fixedAmount: { type: Number, default: 0, min: 0 },
    percentage: { type: Number, default: 0, min: 0, max: 100 },
    maxPenaltyAmount: { type: Number, default: null },
    minPenaltyAmount: { type: Number, default: 0, min: 0 },
    gracePeriodMinutes: { type: Number, default: 0, min: 0 },
    thresholdLimit: { type: Number, default: 1, min: 1 },
    requiresAdminApproval: { type: Boolean, default: true },
    disputeWindowDays: { type: Number, default: 7, min: 1 },
    effectiveFrom: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    changeReason: { type: String, trim: true },
  },
  { timestamps: true }
);

const slaRuleSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: Object.values(SLA_VIOLATION_CATEGORY),
      required: true,
      unique: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    formulaType: {
      type: String,
      enum: Object.values(SLA_FORMULA_TYPE),
      default: SLA_FORMULA_TYPE.FIXED,
    },
    fixedAmount: { type: Number, default: 0, min: 0 },
    percentage: { type: Number, default: 0, min: 0, max: 100 },
    maxPenaltyAmount: { type: Number, default: null },
    minPenaltyAmount: { type: Number, default: 0, min: 0 },
    gracePeriodMinutes: { type: Number, default: 0, min: 0 },
    thresholdLimit: { type: Number, default: 1, min: 1 },
    requiresAdminApproval: { type: Boolean, default: true },
    disputeWindowDays: { type: Number, default: 7, min: 1 },
    isActive: { type: Boolean, default: true, index: true },
    effectiveFrom: { type: Date, default: Date.now },
    version: { type: Number, default: 1 },
    versionHistory: [slaRuleVersionSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("SlaRule", slaRuleSchema);

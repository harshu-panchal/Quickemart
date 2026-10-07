import mongoose from "mongoose";
import {
  SLA_VIOLATION_CATEGORY,
  SLA_VIOLATION_STATUS,
} from "../constants/finance.js";

const evidenceSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    description: { type: String, trim: true },
    uploadedByRole: { type: String, enum: ["ADMIN", "SELLER", "CUSTOMER", "SYSTEM"], default: "SYSTEM" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const actionLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorRole: { type: String, enum: ["ADMIN", "SELLER", "SYSTEM"], default: "SYSTEM" },
    reason: { type: String, trim: true },
    timestamp: { type: Date, default: Date.now },
    metadata: { type: Object, default: {} },
  },
  { _id: true }
);

const disputeSchema = new mongoose.Schema(
  {
    isDisputed: { type: Boolean, default: false },
    reason: { type: String, trim: true },
    evidenceUrl: { type: String, trim: true },
    disputedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNotes: { type: String, trim: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    resolutionOutcome: { type: String, enum: ["UPHELD", "OVERTURNED", null], default: null },
  },
  { _id: false }
);

const slaViolationSchema = new mongoose.Schema(
  {
    violationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    category: {
      type: String,
      enum: Object.values(SLA_VIOLATION_CATEGORY),
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SlaRule",
      default: null,
    },
    ruleVersion: { type: Number, default: 1 },
    ruleSnapshot: { type: Object, required: true, default: {} },
    orderSnapshot: { type: Object, default: {} },
    calculatedPenalty: { type: Number, required: true, min: 0 },
    appliedPenalty: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: Object.values(SLA_VIOLATION_STATUS),
      default: SLA_VIOLATION_STATUS.PENDING_APPROVAL,
      index: true,
    },
    detectedBy: {
      type: String,
      enum: ["SYSTEM_EVENT", "ADMIN_MANUAL", "CUSTOMER_REPORT"],
      default: "SYSTEM_EVENT",
    },
    description: { type: String, trim: true },
    adminNotes: { type: String, trim: true },
    evidence: [evidenceSchema],
    dispute: { type: disputeSchema, default: () => ({}) },
    actionLog: [actionLogSchema],
    ledgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LedgerEntry",
      default: null,
    },
    reversalLedgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LedgerEntry",
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    waivedAt: { type: Date, default: null },
    waivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    waiverReason: { type: String, trim: true },
    idempotencyKey: {
      type: String,
      default: undefined,
    },
  },
  { timestamps: true }
);

slaViolationSchema.index({ sellerId: 1, createdAt: -1 });
slaViolationSchema.index({ orderId: 1, category: 1 });
slaViolationSchema.index({ status: 1, createdAt: -1 });

slaViolationSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
    name: "idx_sla_violation_idempotency_partial",
  }
);

export default mongoose.model("SlaViolation", slaViolationSchema);

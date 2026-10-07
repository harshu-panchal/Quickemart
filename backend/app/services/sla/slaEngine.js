import mongoose from "mongoose";
import SlaRule from "../../models/slaRule.js";
import SlaViolation from "../../models/slaViolation.js";
import Wallet from "../../models/wallet.js";
import Order from "../../models/order.js";
import Seller from "../../models/seller.js";
import FinanceAuditLog from "../../models/financeAuditLog.js";
import {
  FINANCE_AUDIT_ACTION,
  LEDGER_DIRECTION,
  LEDGER_TRANSACTION_TYPE,
  OWNER_TYPE,
  SLA_FORMULA_TYPE,
  SLA_VIOLATION_CATEGORY,
  SLA_VIOLATION_STATUS,
} from "../../constants/finance.js";
import { roundCurrency } from "../../utils/money.js";
import { createLedgerEntry } from "../finance/ledgerService.js";
import { getOrCreateWallet } from "../finance/walletService.js";

const DEFAULT_SLA_RULES = [
  {
    category: SLA_VIOLATION_CATEGORY.ACCEPTANCE_DELAY,
    title: "Order Acceptance Delay / Auto-Cancellation",
    description: "Seller failed to accept order within configured timeframe.",
    formulaType: SLA_FORMULA_TYPE.PERCENTAGE,
    fixedAmount: 50,
    percentage: 5,
    maxPenaltyAmount: 500,
    minPenaltyAmount: 20,
    gracePeriodMinutes: 10,
    thresholdLimit: 1,
    requiresAdminApproval: false,
    disputeWindowDays: 7,
  },
  {
    category: SLA_VIOLATION_CATEGORY.DISPATCH_DELAY,
    title: "Packaging / Dispatch Delay",
    description: "Seller delayed packing or handing order over to rider.",
    formulaType: SLA_FORMULA_TYPE.FIXED,
    fixedAmount: 30,
    percentage: 3,
    maxPenaltyAmount: 300,
    minPenaltyAmount: 10,
    gracePeriodMinutes: 15,
    thresholdLimit: 1,
    requiresAdminApproval: false,
    disputeWindowDays: 7,
  },
  {
    category: SLA_VIOLATION_CATEGORY.POST_ACCEPTANCE_CANCEL,
    title: "Seller Cancellation After Acceptance",
    description: "Seller accepted the order then cancelled it.",
    formulaType: SLA_FORMULA_TYPE.COMBINED,
    fixedAmount: 100,
    percentage: 10,
    maxPenaltyAmount: 1000,
    minPenaltyAmount: 50,
    gracePeriodMinutes: 0,
    thresholdLimit: 1,
    requiresAdminApproval: false,
    disputeWindowDays: 7,
  },
  {
    category: SLA_VIOLATION_CATEGORY.EXPIRED_PRODUCT,
    title: "Expired / Near-Expiry Product",
    description: "Seller supplied expired or near-expiry product.",
    formulaType: SLA_FORMULA_TYPE.PERCENTAGE,
    fixedAmount: 200,
    percentage: 20,
    maxPenaltyAmount: 2000,
    minPenaltyAmount: 100,
    gracePeriodMinutes: 0,
    thresholdLimit: 1,
    requiresAdminApproval: true,
    disputeWindowDays: 14,
  },
  {
    category: SLA_VIOLATION_CATEGORY.DEFECTIVE_WRONG_ITEM,
    title: "Wrong / Missing / Defective Item",
    description: "Seller packed incorrect, missing, or physically damaged item.",
    formulaType: SLA_FORMULA_TYPE.FIXED,
    fixedAmount: 150,
    percentage: 15,
    maxPenaltyAmount: 1500,
    minPenaltyAmount: 50,
    gracePeriodMinutes: 0,
    thresholdLimit: 1,
    requiresAdminApproval: true,
    disputeWindowDays: 7,
  },
  {
    category: SLA_VIOLATION_CATEGORY.FAKE_UNACCEPTED_SUPPLY,
    title: "Fake / Counterfeit / Uncertified Supply",
    description: "Seller supplied non-genuine or unauthorized product.",
    formulaType: SLA_FORMULA_TYPE.COMBINED,
    fixedAmount: 500,
    percentage: 50,
    maxPenaltyAmount: 5000,
    minPenaltyAmount: 500,
    gracePeriodMinutes: 0,
    thresholdLimit: 1,
    requiresAdminApproval: true,
    disputeWindowDays: 30,
  },
];

/**
 * Initializes default SLA rules in DB if missing.
 */
export async function ensureDefaultSlaRulesExist() {
  for (const ruleDef of DEFAULT_SLA_RULES) {
    const existing = await SlaRule.findOne({ category: ruleDef.category });
    if (!existing) {
      await SlaRule.create(ruleDef);
    }
  }
}

/**
 * Calculate penalty amount according to rule formula and bounds.
 */
export function calculatePenaltyAmount(rule, orderAmount = 0) {
  if (!rule) return 0;

  const baseAmount = Math.max(0, Number(orderAmount) || 0);
  let calculated = 0;

  const formulaType = rule.formulaType || SLA_FORMULA_TYPE.FIXED;
  const fixed = Number(rule.fixedAmount) || 0;
  const pct = Number(rule.percentage) || 0;

  if (formulaType === SLA_FORMULA_TYPE.FIXED) {
    calculated = fixed;
  } else if (formulaType === SLA_FORMULA_TYPE.PERCENTAGE) {
    calculated = (baseAmount * pct) / 100;
  } else if (formulaType === SLA_FORMULA_TYPE.COMBINED) {
    calculated = fixed + (baseAmount * pct) / 100;
  }

  const minPen = Number(rule.minPenaltyAmount) || 0;
  if (calculated < minPen) calculated = minPen;

  if (rule.maxPenaltyAmount !== null && rule.maxPenaltyAmount !== undefined) {
    const maxPen = Number(rule.maxPenaltyAmount);
    if (maxPen >= 0 && calculated > maxPen) {
      calculated = maxPen;
    }
  }

  return roundCurrency(calculated);
}

function buildViolationId() {
  const ts = Date.now().toString().slice(-8);
  const rand = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `SLA-VIOL-${ts}${rand}`;
}

/**
 * Record an SLA Violation.
 */
export async function recordSlaViolation({
  category,
  orderId,
  sellerId,
  amountOverride = null,
  description = "",
  evidence = [],
  detectedBy = "SYSTEM_EVENT",
  adminNotes = "",
  idempotencyKey = null,
  session: externalSession = null,
} = {}) {
  await ensureDefaultSlaRulesExist();

  const session = externalSession || (await mongoose.startSession());
  const managedSession = !externalSession;
  if (managedSession) session.startTransaction();

  try {
    const key = idempotencyKey || `SLA:${category}:${orderId}`;

    const existingViolation = await SlaViolation.findOne({ idempotencyKey: key }).session(session);
    if (existingViolation) {
      if (managedSession) await session.commitTransaction();
      return existingViolation;
    }

    const isMongoId = mongoose.Types.ObjectId.isValid(orderId);
    const order = await Order.findOne({
      $or: [
        ...(isMongoId ? [{ _id: orderId }] : []),
        { orderId: String(orderId).trim() },
      ],
    }).session(session);
    if (!order) throw new Error(`Order "${orderId}" not found in database`);

    let resolvedSellerId = null;
    const rawSellerId = sellerId || order.seller;
    if (rawSellerId) {
      const isSellerMongoId = mongoose.Types.ObjectId.isValid(rawSellerId);
      if (isSellerMongoId) {
        const sDoc = await Seller.findById(rawSellerId).session(session);
        if (sDoc) resolvedSellerId = sDoc._id;
      }
      if (!resolvedSellerId && typeof rawSellerId === "string") {
        const sDoc = await Seller.findOne({
          $or: [
            { sellerId: rawSellerId.trim() },
            { code: rawSellerId.trim() },
            { email: rawSellerId.trim() }
          ]
        }).session(session);
        if (sDoc) resolvedSellerId = sDoc._id;
      }
    }
    if (!resolvedSellerId && order.seller) {
      resolvedSellerId = order.seller;
    }
    if (!resolvedSellerId) throw new Error("Valid Seller not found for SLA violation");

    const rule = await SlaRule.findOne({ category, isActive: true }).session(session);
    if (!rule) throw new Error(`Active SLA Rule not found for category ${category}`);

    const orderAmount = order.pricing?.subtotal || order.pricing?.total || order.total || 0;
    const calculatedPenalty =
      amountOverride !== null && amountOverride !== undefined
        ? roundCurrency(amountOverride)
        : calculatePenaltyAmount(rule, orderAmount);

    const requiresApproval = rule.requiresAdminApproval;
    const initialStatus = requiresApproval
      ? SLA_VIOLATION_STATUS.PENDING_APPROVAL
      : SLA_VIOLATION_STATUS.APPROVED;

    const violation = new SlaViolation({
      violationId: buildViolationId(),
      category,
      orderId: order._id,
      sellerId: resolvedSellerId,
      ruleId: rule._id,
      ruleVersion: rule.version,
      ruleSnapshot: {
        category: rule.category,
        title: rule.title,
        formulaType: rule.formulaType,
        fixedAmount: rule.fixedAmount,
        percentage: rule.percentage,
        maxPenaltyAmount: rule.maxPenaltyAmount,
        minPenaltyAmount: rule.minPenaltyAmount,
        requiresAdminApproval: rule.requiresAdminApproval,
        disputeWindowDays: rule.disputeWindowDays,
      },
      orderSnapshot: {
        orderId: order.orderId,
        subtotal: order.pricing?.subtotal || 0,
        total: order.pricing?.total || 0,
        status: order.status,
      },
      calculatedPenalty,
      appliedPenalty: initialStatus === SLA_VIOLATION_STATUS.APPROVED ? calculatedPenalty : 0,
      status: initialStatus,
      detectedBy,
      description: description || rule.description,
      adminNotes,
      evidence: Array.isArray(evidence) ? evidence : [],
      idempotencyKey: key,
      actionLog: [
        {
          action: "VIOLATION_RECORDED",
          actorRole: detectedBy === "ADMIN_MANUAL" ? "ADMIN" : "SYSTEM",
          reason: description || "Automated SLA violation detection",
          timestamp: new Date(),
        },
      ],
    });

    await violation.save({ session });

    await FinanceAuditLog.create(
      [
        {
          action: FINANCE_AUDIT_ACTION.SLA_VIOLATION_RECORDED,
          actorType: detectedBy === "ADMIN_MANUAL" ? OWNER_TYPE.ADMIN : OWNER_TYPE.SELLER,
          actorId: resolvedSellerId,
          orderId: order._id,
          metadata: {
            violationId: violation.violationId,
            category,
            calculatedPenalty,
            status: initialStatus,
          },
        },
      ],
      { session }
    );

    if (initialStatus === SLA_VIOLATION_STATUS.APPROVED) {
      await applyViolationDeduction(violation._id, { session });
    }

    if (managedSession) await session.commitTransaction();
    return violation;
  } catch (error) {
    if (managedSession) await session.abortTransaction();
    if (error.code === 11000 && idempotencyKey) {
      return SlaViolation.findOne({ idempotencyKey });
    }
    throw error;
  } finally {
    if (managedSession) session.endSession();
  }
}

/**
 * Apply financial deduction for an approved SLA Violation.
 * Debits seller wallet and posts traceable LedgerEntry.
 */
export async function applyViolationDeduction(violationId, { session: externalSession = null } = {}) {
  const session = externalSession || (await mongoose.startSession());
  const managedSession = !externalSession;
  if (managedSession) session.startTransaction();

  try {
    const violation = await SlaViolation.findById(violationId).session(session);
    if (!violation) throw new Error(`SLA Violation ${violationId} not found`);

    if (violation.ledgerEntryId) {
      if (managedSession) await session.commitTransaction();
      return violation;
    }

    if (violation.status !== SLA_VIOLATION_STATUS.APPROVED) {
      throw new Error(`Cannot deduct penalty for violation in status ${violation.status}`);
    }

    const penaltyAmount = roundCurrency(violation.calculatedPenalty);
    if (penaltyAmount <= 0) {
      violation.appliedPenalty = 0;
      await violation.save({ session });
      if (managedSession) await session.commitTransaction();
      return violation;
    }

    const sellerWallet = await getOrCreateWallet(OWNER_TYPE.SELLER, violation.sellerId, { session });

    // Debit available balance if sufficient, else absorb from available + pending
    let availableBefore = roundCurrency(sellerWallet.availableBalance || 0);
    let pendingBefore = roundCurrency(sellerWallet.pendingBalance || 0);

    let debitFromAvailable = Math.min(availableBefore, penaltyAmount);
    let remainingPenalty = roundCurrency(penaltyAmount - debitFromAvailable);
    let debitFromPending = Math.min(pendingBefore, remainingPenalty);
    let unrecoveredPenalty = roundCurrency(remainingPenalty - debitFromPending);

    sellerWallet.availableBalance = roundCurrency(availableBefore - debitFromAvailable);
    sellerWallet.pendingBalance = roundCurrency(pendingBefore - debitFromPending);
    sellerWallet.totalDebited = roundCurrency((sellerWallet.totalDebited || 0) + penaltyAmount);

    if (unrecoveredPenalty > 0) {
      sellerWallet.meta = {
        ...(sellerWallet.meta || {}),
        unrecoveredPenalty: roundCurrency((sellerWallet.meta?.unrecoveredPenalty || 0) + unrecoveredPenalty),
      };
      sellerWallet.markModified("meta");
    }

    await sellerWallet.save({ session });

    const ledgerEntry = await createLedgerEntry(
      {
        orderId: violation.orderId,
        walletId: sellerWallet._id,
        actorType: OWNER_TYPE.SELLER,
        actorId: violation.sellerId,
        type: LEDGER_TRANSACTION_TYPE.SELLER_SLA_PENALTY_DEDUCTION,
        direction: LEDGER_DIRECTION.DEBIT,
        amount: penaltyAmount,
        description: `SLA Penalty deduction [${violation.category}] for order ${violation.orderSnapshot?.orderId || ""}`,
        reference: violation.violationId,
        metadata: {
          violationId: violation.violationId,
          category: violation.category,
          debitFromAvailable,
          debitFromPending,
        },
        idempotencyKey: `DEDUCT:${violation.violationId}`,
      },
      { session }
    );

    violation.appliedPenalty = penaltyAmount;
    violation.ledgerEntryId = ledgerEntry._id;
    violation.deductedAt = new Date();
    violation.actionLog.push({
      action: "PENALTY_DEDUCTED",
      actorRole: "SYSTEM",
      reason: `Deducted ₹${penaltyAmount} from seller wallet`,
      timestamp: new Date(),
    });

    await violation.save({ session });

    await FinanceAuditLog.create(
      [
        {
          action: FINANCE_AUDIT_ACTION.SLA_VIOLATION_APPROVED,
          actorType: OWNER_TYPE.SELLER,
          actorId: violation.sellerId,
          orderId: violation.orderId,
          metadata: {
            violationId: violation.violationId,
            appliedPenalty: penaltyAmount,
            ledgerEntryId: ledgerEntry._id,
          },
        },
      ],
      { session }
    );

    if (managedSession) await session.commitTransaction();
    return violation;
  } catch (error) {
    if (managedSession) await session.abortTransaction();
    throw error;
  } finally {
    if (managedSession) session.endSession();
  }
}

/**
 * Approve a pending SLA Violation (Admin action).
 */
export async function approveViolation(violationId, { adminId, adminNotes = "" } = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const violation = await SlaViolation.findById(violationId).session(session);
    if (!violation) throw new Error("SLA Violation not found");

    if (
      violation.status !== SLA_VIOLATION_STATUS.PENDING_APPROVAL &&
      violation.status !== SLA_VIOLATION_STATUS.DISPUTED
    ) {
      throw new Error(`Cannot approve violation in status ${violation.status}`);
    }

    violation.status = SLA_VIOLATION_STATUS.APPROVED;
    violation.approvedBy = adminId;
    violation.approvedAt = new Date();
    if (adminNotes) violation.adminNotes = adminNotes;

    violation.actionLog.push({
      action: "VIOLATION_APPROVED",
      actorId: adminId,
      actorRole: "ADMIN",
      reason: adminNotes || "Admin approved SLA violation",
      timestamp: new Date(),
    });

    await violation.save({ session });

    await applyViolationDeduction(violation._id, { session });

    await session.commitTransaction();
    return violation;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Reject a pending SLA Violation (Admin action).
 */
export async function rejectViolation(violationId, { adminId, adminNotes = "" } = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const violation = await SlaViolation.findById(violationId).session(session);
    if (!violation) throw new Error("SLA Violation not found");

    if (violation.status !== SLA_VIOLATION_STATUS.PENDING_APPROVAL) {
      throw new Error(`Cannot reject violation in status ${violation.status}`);
    }

    violation.status = SLA_VIOLATION_STATUS.REJECTED;
    violation.rejectedAt = new Date();
    if (adminNotes) violation.adminNotes = adminNotes;

    violation.actionLog.push({
      action: "VIOLATION_REJECTED",
      actorId: adminId,
      actorRole: "ADMIN",
      reason: adminNotes || "Admin rejected SLA violation",
      timestamp: new Date(),
    });

    await violation.save({ session });

    await FinanceAuditLog.create(
      [
        {
          action: FINANCE_AUDIT_ACTION.SLA_VIOLATION_REJECTED,
          actorType: OWNER_TYPE.ADMIN,
          actorId: adminId,
          orderId: violation.orderId,
          metadata: { violationId: violation.violationId },
        },
      ],
      { session }
    );

    await session.commitTransaction();
    return violation;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Waive/Reverse an SLA Violation penalty (Admin action).
 * Posts a compensating CREDIT ledger entry if penalty was already debited.
 */
export async function waiveViolation(violationId, { adminId, waiverReason = "" } = {}) {
  if (!waiverReason) throw new Error("Waiver reason is required");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const violation = await SlaViolation.findById(violationId).session(session);
    if (!violation) throw new Error("SLA Violation not found");

    if (violation.status === SLA_VIOLATION_STATUS.WAIVED) {
      await session.commitTransaction();
      return violation;
    }

    const previouslyApplied = roundCurrency(violation.appliedPenalty);

    // If penalty was already debited, credit it back to seller wallet via compensating ledger row
    if (violation.ledgerEntryId && previouslyApplied > 0) {
      const sellerWallet = await getOrCreateWallet(OWNER_TYPE.SELLER, violation.sellerId, { session });
      sellerWallet.availableBalance = roundCurrency((sellerWallet.availableBalance || 0) + previouslyApplied);
      sellerWallet.totalCredited = roundCurrency((sellerWallet.totalCredited || 0) + previouslyApplied);
      await sellerWallet.save({ session });

      const reversalLedger = await createLedgerEntry(
        {
          orderId: violation.orderId,
          walletId: sellerWallet._id,
          actorType: OWNER_TYPE.SELLER,
          actorId: violation.sellerId,
          type: LEDGER_TRANSACTION_TYPE.SELLER_SLA_PENALTY_REVERSAL,
          direction: LEDGER_DIRECTION.CREDIT,
          amount: previouslyApplied,
          description: `SLA Penalty reversal/waiver for ${violation.violationId}: ${waiverReason}`,
          reference: violation.violationId,
          metadata: {
            violationId: violation.violationId,
            waiverReason,
          },
          idempotencyKey: `WAIVE:${violation.violationId}`,
        },
        { session }
      );

      violation.reversalLedgerEntryId = reversalLedger._id;
    }

    violation.status = SLA_VIOLATION_STATUS.WAIVED;
    violation.waivedBy = adminId;
    violation.waivedAt = new Date();
    violation.waiverReason = waiverReason;

    violation.actionLog.push({
      action: "VIOLATION_WAIVED",
      actorId: adminId,
      actorRole: "ADMIN",
      reason: waiverReason,
      timestamp: new Date(),
    });

    await violation.save({ session });

    await FinanceAuditLog.create(
      [
        {
          action: FINANCE_AUDIT_ACTION.SLA_VIOLATION_WAIVED,
          actorType: OWNER_TYPE.ADMIN,
          actorId: adminId,
          orderId: violation.orderId,
          metadata: {
            violationId: violation.violationId,
            reversedAmount: previouslyApplied,
            waiverReason,
          },
        },
      ],
      { session }
    );

    await session.commitTransaction();
    return violation;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Submit seller dispute for a violation.
 */
export async function submitSellerDispute(violationId, sellerId, { reason, evidenceUrl = "" }) {
  if (!reason || !reason.trim()) throw new Error("Dispute reason is required");

  const violation = await SlaViolation.findById(violationId);
  if (!violation) throw new Error("SLA Violation not found");

  if (String(violation.sellerId) !== String(sellerId)) {
    throw new Error("Unauthorized: Seller can only dispute their own violations");
  }

  if (violation.status === SLA_VIOLATION_STATUS.WAIVED || violation.status === SLA_VIOLATION_STATUS.REJECTED) {
    throw new Error(`Cannot dispute violation in status ${violation.status}`);
  }

  violation.status = SLA_VIOLATION_STATUS.DISPUTED;
  violation.dispute = {
    isDisputed: true,
    reason: reason.trim(),
    evidenceUrl: evidenceUrl || "",
    disputedAt: new Date(),
  };

  if (evidenceUrl) {
    violation.evidence.push({
      url: evidenceUrl,
      description: "Seller dispute supporting evidence",
      uploadedByRole: "SELLER",
      uploadedAt: new Date(),
    });
  }

  violation.actionLog.push({
    action: "DISPUTE_SUBMITTED",
    actorId: sellerId,
    actorRole: "SELLER",
    reason: reason.trim(),
    timestamp: new Date(),
  });

  await violation.save();

  await FinanceAuditLog.create([
    {
      action: FINANCE_AUDIT_ACTION.SLA_VIOLATION_DISPUTED,
      actorType: OWNER_TYPE.SELLER,
      actorId: sellerId,
      orderId: violation.orderId,
      metadata: { violationId: violation.violationId, reason },
    },
  ]);

  return violation;
}

/**
 * Resolve seller dispute (Admin action).
 */
export async function resolveSellerDispute(violationId, { adminId, outcome, notes = "" }) {
  if (!["UPHELD", "OVERTURNED"].includes(outcome)) {
    throw new Error("Invalid outcome. Must be UPHELD or OVERTURNED");
  }

  const violation = await SlaViolation.findById(violationId);
  if (!violation) throw new Error("SLA Violation not found");

  if (violation.status !== SLA_VIOLATION_STATUS.DISPUTED) {
    throw new Error("Violation is not in DISPUTED status");
  }

  if (outcome === "OVERTURNED") {
    return waiveViolation(violationId, { adminId, waiverReason: `Dispute Overturned: ${notes || "Seller dispute accepted"}` });
  }

  // Outcome UPHELD
  violation.status = SLA_VIOLATION_STATUS.APPROVED;
  violation.dispute.resolvedAt = new Date();
  violation.dispute.resolvedBy = adminId;
  violation.dispute.resolutionOutcome = "UPHELD";
  violation.dispute.resolutionNotes = notes;

  violation.actionLog.push({
    action: "DISPUTE_RESOLVED_UPHELD",
    actorId: adminId,
    actorRole: "ADMIN",
    reason: notes || "Dispute rejected. Penalty upheld.",
    timestamp: new Date(),
  });

  await violation.save();

  if (!violation.ledgerEntryId) {
    await applyViolationDeduction(violation._id);
  }

  await FinanceAuditLog.create([
    {
      action: FINANCE_AUDIT_ACTION.SLA_VIOLATION_DISPUTE_RESOLVED,
      actorType: OWNER_TYPE.ADMIN,
      actorId: adminId,
      orderId: violation.orderId,
      metadata: { violationId: violation.violationId, outcome: "UPHELD" },
    },
  ]);

  return violation;
}

import SlaRule from "../models/slaRule.js";
import SlaViolation from "../models/slaViolation.js";
import FinanceAuditLog from "../models/financeAuditLog.js";
import handleResponse from "../utils/helper.js";
import {
  ensureDefaultSlaRulesExist,
  recordSlaViolation,
  approveViolation,
  rejectViolation,
  waiveViolation,
  submitSellerDispute,
  resolveSellerDispute,
} from "../services/sla/slaEngine.js";
import { FINANCE_AUDIT_ACTION, OWNER_TYPE, SLA_VIOLATION_STATUS } from "../constants/finance.js";

/* ===============================
   ADMIN: GET ALL SLA RULES
================================ */
export const getSlaRulesController = async (req, res) => {
  try {
    await ensureDefaultSlaRulesExist();
    const rules = await SlaRule.find().sort({ category: 1 }).lean();
    return handleResponse(res, 200, "SLA rules fetched successfully", rules);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN: UPDATE SLA RULE
================================ */
export const updateSlaRuleController = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      formulaType,
      fixedAmount,
      percentage,
      maxPenaltyAmount,
      minPenaltyAmount,
      gracePeriodMinutes,
      thresholdLimit,
      requiresAdminApproval,
      disputeWindowDays,
      isActive,
      changeReason,
    } = req.body;

    const rule = await SlaRule.findById(id);
    if (!rule) return handleResponse(res, 404, "SLA rule not found");

    // Save previous version in versionHistory
    rule.versionHistory.push({
      version: rule.version,
      formulaType: rule.formulaType,
      fixedAmount: rule.fixedAmount,
      percentage: rule.percentage,
      maxPenaltyAmount: rule.maxPenaltyAmount,
      minPenaltyAmount: rule.minPenaltyAmount,
      gracePeriodMinutes: rule.gracePeriodMinutes,
      thresholdLimit: rule.thresholdLimit,
      requiresAdminApproval: rule.requiresAdminApproval,
      disputeWindowDays: rule.disputeWindowDays,
      effectiveFrom: rule.effectiveFrom,
      updatedBy: req.user?.id || null,
      changeReason: changeReason || "Rule configuration updated",
    });

    rule.version += 1;
    if (title !== undefined) rule.title = title;
    if (description !== undefined) rule.description = description;
    if (formulaType !== undefined) rule.formulaType = formulaType;
    if (fixedAmount !== undefined) rule.fixedAmount = Number(fixedAmount);
    if (percentage !== undefined) rule.percentage = Number(percentage);
    if (maxPenaltyAmount !== undefined) rule.maxPenaltyAmount = maxPenaltyAmount === null ? null : Number(maxPenaltyAmount);
    if (minPenaltyAmount !== undefined) rule.minPenaltyAmount = Number(minPenaltyAmount);
    if (gracePeriodMinutes !== undefined) rule.gracePeriodMinutes = Number(gracePeriodMinutes);
    if (thresholdLimit !== undefined) rule.thresholdLimit = Number(thresholdLimit);
    if (requiresAdminApproval !== undefined) rule.requiresAdminApproval = Boolean(requiresAdminApproval);
    if (disputeWindowDays !== undefined) rule.disputeWindowDays = Number(disputeWindowDays);
    if (isActive !== undefined) rule.isActive = Boolean(isActive);
    rule.effectiveFrom = new Date();
    rule.updatedBy = req.user?.id || null;

    const updatedRule = await rule.save();

    await FinanceAuditLog.create([
      {
        action: FINANCE_AUDIT_ACTION.SLA_RULE_UPDATED,
        actorType: OWNER_TYPE.ADMIN,
        actorId: req.user?.id || null,
        metadata: {
          category: rule.category,
          newVersion: rule.version,
          changeReason: changeReason || "Rule updated",
        },
      },
    ]);

    return handleResponse(res, 200, "SLA rule updated successfully", updatedRule);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN: GET SLA VIOLATIONS (LIST)
================================ */
export const getSlaViolationsController = async (req, res) => {
  try {
    const { category, status, sellerId, orderId, page = 1, limit = 25, search } = req.query;

    const query = {};
    if (category) query.category = category;
    if (status) query.status = status;
    if (sellerId) query.sellerId = sellerId;
    if (orderId) query.orderId = orderId;
    if (search) {
      query.$or = [
        { violationId: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      SlaViolation.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("orderId", "orderId status createdAt pricing")
        .populate("sellerId", "shopName name phone")
        .populate("approvedBy", "name email")
        .populate("waivedBy", "name email")
        .lean(),
      SlaViolation.countDocuments(query),
    ]);

    return handleResponse(res, 200, "SLA violations fetched successfully", {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN: RECORD MANUAL SLA VIOLATION
================================ */
export const recordManualSlaViolationController = async (req, res) => {
  try {
    const { category, orderId, sellerId, amountOverride, description, evidence } = req.body;

    if (!category || !orderId) {
      return handleResponse(res, 400, "Category and Order ID are required");
    }

    const hasOverride = amountOverride !== undefined && amountOverride !== null && String(amountOverride).trim() !== "" && !isNaN(Number(amountOverride));
    const cleanSellerId = sellerId && String(sellerId).trim() ? String(sellerId).trim() : null;

    const violation = await recordSlaViolation({
      category,
      orderId: String(orderId).trim(),
      sellerId: cleanSellerId,
      amountOverride: hasOverride ? Number(amountOverride) : null,
      description: description || "Manually reported SLA violation",
      evidence: Array.isArray(evidence) ? evidence : [],
      detectedBy: "ADMIN_MANUAL",
      adminNotes: description || "",
    });

    return handleResponse(res, 201, "SLA violation recorded successfully", violation);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

/* ===============================
   ADMIN: APPROVE SLA VIOLATION
================================ */
export const approveSlaViolationController = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    const violation = await approveViolation(id, {
      adminId: req.user?.id || null,
      adminNotes: adminNotes || "",
    });

    return handleResponse(res, 200, "SLA violation approved and penalty deducted", violation);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

/* ===============================
   ADMIN: REJECT SLA VIOLATION
================================ */
export const rejectSlaViolationController = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    const violation = await rejectViolation(id, {
      adminId: req.user?.id || null,
      adminNotes: adminNotes || "",
    });

    return handleResponse(res, 200, "SLA violation rejected", violation);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

/* ===============================
   ADMIN: WAIVE SLA VIOLATION
================================ */
export const waiveSlaViolationController = async (req, res) => {
  try {
    const { id } = req.params;
    const { waiverReason } = req.body;

    if (!waiverReason) {
      return handleResponse(res, 400, "Waiver reason is required");
    }

    const violation = await waiveViolation(id, {
      adminId: req.user?.id || null,
      waiverReason,
    });

    return handleResponse(res, 200, "SLA violation waived and penalty reversed if previously debited", violation);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

/* ===============================
   ADMIN: RESOLVE SELLER DISPUTE
================================ */
export const resolveDisputeController = async (req, res) => {
  try {
    const { id } = req.params;
    const { outcome, notes } = req.body;

    if (!outcome || !["UPHELD", "OVERTURNED"].includes(outcome)) {
      return handleResponse(res, 400, "Valid outcome (UPHELD or OVERTURNED) is required");
    }

    const violation = await resolveSellerDispute(id, {
      adminId: req.user?.id || null,
      outcome,
      notes: notes || "",
    });

    return handleResponse(res, 200, `Seller dispute resolved with outcome: ${outcome}`, violation);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

/* ===============================
   ADMIN: SUMMARY & ANALYTICS
================================ */
export const getSlaSummaryController = async (req, res) => {
  try {
    const [stats] = await SlaViolation.aggregate([
      {
        $group: {
          _id: null,
          totalViolations: { $sum: 1 },
          totalCalculatedPenalties: { $sum: "$calculatedPenalty" },
          totalDeductedPenalties: { $sum: "$appliedPenalty" },
          pendingApprovalCount: {
            $sum: { $cond: [{ $eq: ["$status", SLA_VIOLATION_STATUS.PENDING_APPROVAL] }, 1, 0] },
          },
          approvedCount: {
            $sum: { $cond: [{ $eq: ["$status", SLA_VIOLATION_STATUS.APPROVED] }, 1, 0] },
          },
          disputedCount: {
            $sum: { $cond: [{ $eq: ["$status", SLA_VIOLATION_STATUS.DISPUTED] }, 1, 0] },
          },
          waivedCount: {
            $sum: { $cond: [{ $eq: ["$status", SLA_VIOLATION_STATUS.WAIVED] }, 1, 0] },
          },
        },
      },
    ]);

    const byCategory = await SlaViolation.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          totalAmount: { $sum: "$appliedPenalty" },
        },
      },
    ]);

    return handleResponse(res, 200, "SLA summary fetched successfully", {
      totalViolations: stats?.totalViolations || 0,
      totalCalculatedPenalties: stats?.totalCalculatedPenalties || 0,
      totalDeductedPenalties: stats?.totalDeductedPenalties || 0,
      pendingApprovalCount: stats?.pendingApprovalCount || 0,
      approvedCount: stats?.approvedCount || 0,
      disputedCount: stats?.disputedCount || 0,
      waivedCount: stats?.waivedCount || 0,
      byCategory: byCategory || [],
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   SELLER: SUBMIT DISPUTE
================================ */
export const submitDisputeController = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, evidenceUrl } = req.body;

    const violation = await submitSellerDispute(id, req.user.id, {
      reason,
      evidenceUrl,
    });

    return handleResponse(res, 200, "Dispute submitted successfully", violation);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

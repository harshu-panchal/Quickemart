import express from "express";
import {
  getSlaRulesController,
  updateSlaRuleController,
  getSlaViolationsController,
  recordManualSlaViolationController,
  approveSlaViolationController,
  rejectSlaViolationController,
  waiveSlaViolationController,
  resolveDisputeController,
  getSlaSummaryController,
  submitDisputeController,
} from "../controller/slaController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Admin Routes
router.get("/rules", verifyToken, allowRoles("admin"), getSlaRulesController);
router.put("/rules/:id", verifyToken, allowRoles("admin"), updateSlaRuleController);

router.get("/violations", verifyToken, allowRoles("admin"), getSlaViolationsController);
router.post("/violations", verifyToken, allowRoles("admin"), recordManualSlaViolationController);
router.post("/violations/:id/approve", verifyToken, allowRoles("admin"), approveSlaViolationController);
router.post("/violations/:id/reject", verifyToken, allowRoles("admin"), rejectSlaViolationController);
router.post("/violations/:id/waive", verifyToken, allowRoles("admin"), waiveSlaViolationController);
router.post("/violations/:id/resolve-dispute", verifyToken, allowRoles("admin"), resolveDisputeController);

router.get("/summary", verifyToken, allowRoles("admin"), getSlaSummaryController);

// Seller Routes
router.post("/violations/:id/dispute", verifyToken, allowRoles("seller"), submitDisputeController);

export default router;

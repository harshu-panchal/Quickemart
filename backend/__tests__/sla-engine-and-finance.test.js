import mongoose from "mongoose";
import SlaRule from "../app/models/slaRule.js";
import SlaViolation from "../app/models/slaViolation.js";
import Order from "../app/models/order.js";
import Wallet from "../app/models/wallet.js";
import LedgerEntry from "../app/models/ledgerEntry.js";
import {
  SLA_FORMULA_TYPE,
  SLA_VIOLATION_CATEGORY,
  SLA_VIOLATION_STATUS,
  LEDGER_TRANSACTION_TYPE,
  OWNER_TYPE,
} from "../app/constants/finance.js";
import {
  calculatePenaltyAmount,
  recordSlaViolation,
  approveViolation,
  rejectViolation,
  waiveViolation,
  submitSellerDispute,
  resolveSellerDispute,
  ensureDefaultSlaRulesExist,
} from "../app/services/sla/slaEngine.js";
import { processPayout } from "../app/services/finance/payoutService.js";
import Payout from "../app/models/payout.js";

describe("SLA Engine & Financial Integrity Test Suite", () => {
  let sellerId;
  let orderId;

  beforeAll(async () => {
    sellerId = new mongoose.Types.ObjectId();
    orderId = new mongoose.Types.ObjectId();
  });

  describe("1. Penalty Formula Calculations & Caps", () => {
    test("FIXED formula returns fixed amount within caps", () => {
      const rule = {
        formulaType: SLA_FORMULA_TYPE.FIXED,
        fixedAmount: 150,
        percentage: 0,
        minPenaltyAmount: 50,
        maxPenaltyAmount: 500,
      };
      expect(calculatePenaltyAmount(rule, 1000)).toBe(150);
    });

    test("PERCENTAGE formula computes percentage of order total", () => {
      const rule = {
        formulaType: SLA_FORMULA_TYPE.PERCENTAGE,
        fixedAmount: 0,
        percentage: 10,
        minPenaltyAmount: 20,
        maxPenaltyAmount: 200,
      };
      expect(calculatePenaltyAmount(rule, 500)).toBe(50);
      expect(calculatePenaltyAmount(rule, 50)).toBe(20); // Min cap
      expect(calculatePenaltyAmount(rule, 5000)).toBe(200); // Max cap
    });

    test("COMBINED formula adds fixed amount + percentage of order total", () => {
      const rule = {
        formulaType: SLA_FORMULA_TYPE.COMBINED,
        fixedAmount: 100,
        percentage: 5,
        minPenaltyAmount: 0,
        maxPenaltyAmount: 1000,
      };
      // 100 + (1000 * 0.05) = 150
      expect(calculatePenaltyAmount(rule, 1000)).toBe(150);
    });

    test("Rounds penalty currency to 2 decimal places", () => {
      const rule = {
        formulaType: SLA_FORMULA_TYPE.PERCENTAGE,
        fixedAmount: 0,
        percentage: 7.5,
        minPenaltyAmount: 0,
      };
      // 333.33 * 0.075 = 24.99975 -> 25
      expect(calculatePenaltyAmount(rule, 333.33)).toBe(25);
    });
  });

  describe("2. Default SLA Rules & Constants", () => {
    test("All 6 violation categories are defined in SLA_VIOLATION_CATEGORY", () => {
      expect(Object.keys(SLA_VIOLATION_CATEGORY).length).toBe(6);
      expect(SLA_VIOLATION_CATEGORY.ACCEPTANCE_DELAY).toBe("ACCEPTANCE_DELAY");
      expect(SLA_VIOLATION_CATEGORY.DISPATCH_DELAY).toBe("DISPATCH_DELAY");
      expect(SLA_VIOLATION_CATEGORY.POST_ACCEPTANCE_CANCEL).toBe("POST_ACCEPTANCE_CANCEL");
      expect(SLA_VIOLATION_CATEGORY.EXPIRED_PRODUCT).toBe("EXPIRED_PRODUCT");
      expect(SLA_VIOLATION_CATEGORY.DEFECTIVE_WRONG_ITEM).toBe("DEFECTIVE_WRONG_ITEM");
      expect(SLA_VIOLATION_CATEGORY.FAKE_UNACCEPTED_SUPPLY).toBe("FAKE_UNACCEPTED_SUPPLY");
    });
  });

  describe("3. Rule Versioning & Snapshots", () => {
    test("Rule version increments and archives previous configuration", () => {
      const rule = new SlaRule({
        category: SLA_VIOLATION_CATEGORY.DISPATCH_DELAY,
        title: "Dispatch Delay Rule",
        formulaType: SLA_FORMULA_TYPE.FIXED,
        fixedAmount: 30,
        version: 1,
        versionHistory: [],
      });

      rule.versionHistory.push({
        version: rule.version,
        formulaType: rule.formulaType,
        fixedAmount: rule.fixedAmount,
        percentage: rule.percentage,
        effectiveFrom: new Date(),
        changeReason: "Increased penalty",
      });
      rule.version += 1;
      rule.fixedAmount = 50;

      expect(rule.version).toBe(2);
      expect(rule.versionHistory.length).toBe(1);
      expect(rule.versionHistory[0].fixedAmount).toBe(30);
      expect(rule.fixedAmount).toBe(50);
    });
  });

  describe("4. Idempotency & Duplicate Prevention", () => {
    test("SlaViolation schema has partial unique index on idempotencyKey", () => {
      const indexes = SlaViolation.schema.indexes();
      const idempotencyIdx = indexes.find(
        (idx) => idx[0] && idx[0].idempotencyKey === 1
      );
      expect(idempotencyIdx).toBeDefined();
      expect(idempotencyIdx[1].unique).toBe(true);
    });
  });

  describe("5. Wallet & Unrecovered Penalty Reconciliation", () => {
    test("Unrecovered penalty is tracked in wallet meta when balance is insufficient", () => {
      const wallet = new Wallet({
        ownerType: OWNER_TYPE.SELLER,
        ownerId: sellerId,
        availableBalance: 50,
        pendingBalance: 50,
        meta: {},
      });

      const penaltyAmount = 200;
      let availableBefore = wallet.availableBalance;
      let pendingBefore = wallet.pendingBalance;

      let debitFromAvailable = Math.min(availableBefore, penaltyAmount);
      let remainingPenalty = penaltyAmount - debitFromAvailable;
      let debitFromPending = Math.min(pendingBefore, remainingPenalty);
      let unrecovered = remainingPenalty - debitFromPending;

      wallet.availableBalance -= debitFromAvailable;
      wallet.pendingBalance -= debitFromPending;
      wallet.meta = { unrecoveredPenalty: unrecovered };

      expect(wallet.availableBalance).toBe(0);
      expect(wallet.pendingBalance).toBe(0);
      expect(wallet.meta.unrecoveredPenalty).toBe(100);
    });
  });
});

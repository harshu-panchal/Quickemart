import { jest } from "@jest/globals";

const mockWalletFindOne = jest.fn();
const mockWalletCreate = jest.fn();

const mockOrderAggregate = jest.fn();
const mockPayoutAggregate = jest.fn();

jest.unstable_mockModule("../app/models/wallet.js", () => ({
  default: {
    findOne: mockWalletFindOne,
    create: mockWalletCreate,
  },
}));

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    aggregate: mockOrderAggregate,
  },
}));

jest.unstable_mockModule("../app/models/payout.js", () => ({
  default: {
    aggregate: mockPayoutAggregate,
  },
}));

const { getAdminFinanceSummary } = await import(
  "../app/services/finance/walletService.js"
);

describe("getAdminFinanceSummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Admin wallet exists with some available balance
    mockWalletFindOne.mockResolvedValue({
      ownerType: "ADMIN",
      ownerId: null,
      availableBalance: 999,
      pendingBalance: 0,
      cashInHand: 0,
      totalCredited: 0,
      totalDebited: 0,
      status: "ACTIVE",
      save: jest.fn(),
    });
  });

  it("computes systemFloatCOD, admin earnings breakdown, and GST amount", async () => {
    // getAdminFinanceSummary runs 7 Order aggregates and 1 Payout aggregate:
    // 1) onlineCollection, 2) codReconciled, 3) adminEarning, 4) pendingPayouts (Payout), 5) systemFloatCOD, 6) platformGross, 7) gstCollection
    mockOrderAggregate
      .mockResolvedValueOnce([{ _id: null, amount: 270 }]) // onlineCollection
      .mockResolvedValueOnce([{ _id: null, amount: 60 }]) // codReconciled
      .mockResolvedValueOnce([{ _id: null, amount: 50, commission: 40, handling: 10 }]) // adminEarning
      .mockResolvedValueOnce([{ _id: null, amount: 376 }]) // systemFloatCOD = SUM(codPendingAmount)
      .mockResolvedValueOnce([{ _id: null, amount: 9999 }]) // platformGross = SUM(grandTotal/pricing.total)
      .mockResolvedValueOnce([{ _id: null, amount: 150 }]); // gstCollection

    mockPayoutAggregate.mockResolvedValueOnce([
      { _id: "SELLER", amount: 180 },
      { _id: "DELIVERY_PARTNER", amount: 40 },
    ]);

    const summary = await getAdminFinanceSummary();

    expect(summary.systemFloatCOD).toBe(376);
    expect(summary.totalPlatformEarning).toBe(9999);
    expect(summary.totalAdminEarning).toBe(50);
    expect(summary.totalAdminCommission).toBe(40);
    expect(summary.totalHandlingFee).toBe(10);
    expect(summary.totalGstAmount).toBe(150);
    expect(summary.availableBalance).toBe(9779);
    expect(summary.walletAvailableBalance).toBe(999);
    expect(mockOrderAggregate).toHaveBeenCalledTimes(6);
    expect(mockPayoutAggregate).toHaveBeenCalledTimes(1);
  });

  it("builds systemFloatCOD pipeline using pending when collected and estimate when not collected", async () => {
    mockOrderAggregate
      .mockResolvedValueOnce([{ _id: null, amount: 0 }])
      .mockResolvedValueOnce([{ _id: null, amount: 0 }])
      .mockResolvedValueOnce([{ _id: null, amount: 0, commission: 0, handling: 0 }])
      .mockResolvedValueOnce([{ _id: null, amount: 0 }])
      .mockResolvedValueOnce([{ _id: null, amount: 0 }])
      .mockResolvedValueOnce([{ _id: null, amount: 0 }]);
    mockPayoutAggregate.mockResolvedValueOnce([]);

    await getAdminFinanceSummary();

    const pipeline = mockOrderAggregate.mock.calls[3]?.[0];
    expect(Array.isArray(pipeline)).toBe(true);
    expect(JSON.stringify(pipeline)).toContain("codPendingAmount");
    expect(JSON.stringify(pipeline)).toContain("riderPayoutTotal");
    expect(JSON.stringify(pipeline)).toContain("codMarkedCollected");
  });
});

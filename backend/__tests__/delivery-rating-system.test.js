import { jest } from "@jest/globals";

const mockDeliveryRatingCreate = jest.fn();
const mockDeliveryRatingFindOne = jest.fn();
const mockDeliveryRatingFind = jest.fn();
const mockDeliveryRatingAggregate = jest.fn();
const mockDeliveryRatingCountDocuments = jest.fn();

const mockOrderFindById = jest.fn();
const mockDeliveryFindById = jest.fn();
const mockDeliveryFindByIdAndUpdate = jest.fn();

function createQueryChain(result) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

jest.unstable_mockModule("../app/models/deliveryRating.js", () => ({
  default: {
    create: mockDeliveryRatingCreate,
    findOne: mockDeliveryRatingFindOne,
    find: mockDeliveryRatingFind,
    aggregate: mockDeliveryRatingAggregate,
    countDocuments: mockDeliveryRatingCountDocuments,
  },
}));

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findById: mockOrderFindById,
  },
}));

jest.unstable_mockModule("../app/models/delivery.js", () => ({
  default: {
    findById: mockDeliveryFindById,
    findByIdAndUpdate: mockDeliveryFindByIdAndUpdate,
  },
}));

const {
  submitDeliveryRating,
  getDeliveryRatingForOrder,
  getDeliveryPartnerRatingSummary,
  recalculateDeliveryPartnerRating,
} = await import("../app/services/deliveryRatingService.js");

describe("Delivery Person Rating & Review System", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("submits rating successfully for an eligible delivered order", async () => {
    const customerId = "cust-123";
    const orderId = "order-456";
    const riderId = "rider-789";

    mockOrderFindById.mockReturnValue(
      createQueryChain({
        _id: orderId,
        customer: customerId,
        orderStatus: "delivered",
        deliveryBoy: riderId,
      })
    );

    mockDeliveryRatingFindOne.mockResolvedValue(null);
    mockDeliveryRatingCreate.mockResolvedValue({
      _id: "rating-1",
      orderId,
      customerId,
      deliveryPartnerId: riderId,
      rating: 5,
      review: "On time and polite",
      tags: ["ON_TIME", "POLITE"],
    });

    mockDeliveryRatingAggregate.mockResolvedValue([
      { _id: riderId, totalRatings: 1, averageRating: 5 },
    ]);

    const result = await submitDeliveryRating(customerId, {
      orderId,
      rating: 5,
      review: "On time and polite",
      tags: ["ON_TIME", "POLITE"],
    });

    expect(result.rating.rating).toBe(5);
    expect(result.partnerAggregates.averageRating).toBe(5);
    expect(mockDeliveryFindByIdAndUpdate).toHaveBeenCalledWith(
      riderId,
      { averageRating: 5, ratingCount: 1 }
    );
  });

  it("rejects rating submission if order is not delivered", async () => {
    mockOrderFindById.mockReturnValue(
      createQueryChain({
        _id: "order-1",
        customer: "cust-1",
        orderStatus: "out_for_delivery",
        deliveryBoy: "rider-1",
      })
    );

    await expect(
      submitDeliveryRating("cust-1", { orderId: "order-1", rating: 5 })
    ).rejects.toThrow("Delivery ratings can only be submitted for delivered orders");
  });

  it("rejects rating submission if customer does not own the order", async () => {
    mockOrderFindById.mockReturnValue(
      createQueryChain({
        _id: "order-1",
        customer: "cust-other",
        orderStatus: "delivered",
        deliveryBoy: "rider-1",
      })
    );

    await expect(
      submitDeliveryRating("cust-my", { orderId: "order-1", rating: 5 })
    ).rejects.toThrow("Unauthorized to rate this order");
  });

  it("rejects rating if rating value is not an integer between 1 and 5", async () => {
    await expect(
      submitDeliveryRating("c1", { orderId: "o1", rating: 0 })
    ).rejects.toThrow("Rating must be an integer between 1 and 5");

    await expect(
      submitDeliveryRating("c1", { orderId: "o1", rating: 6 })
    ).rejects.toThrow("Rating must be an integer between 1 and 5");

    await expect(
      submitDeliveryRating("c1", { orderId: "o1", rating: 4.5 })
    ).rejects.toThrow("Rating must be an integer between 1 and 5");
  });

  it("prevents duplicate rating submission for the same order", async () => {
    mockOrderFindById.mockReturnValue(
      createQueryChain({
        _id: "o1",
        customer: "c1",
        orderStatus: "delivered",
        deliveryBoy: "r1",
      })
    );

    mockDeliveryRatingFindOne.mockResolvedValue({ _id: "existing-rating" });

    await expect(
      submitDeliveryRating("c1", { orderId: "o1", rating: 5 })
    ).rejects.toThrow("You have already submitted a delivery rating for this order");
  });

  it("correctly attributes rating to the final assigned delivery partner after reassignment", async () => {
    const customerId = "c1";
    const orderId = "o1";
    const finalRiderId = "rider-b";

    mockOrderFindById.mockReturnValue(
      createQueryChain({
        _id: orderId,
        customer: customerId,
        orderStatus: "delivered",
        deliveryBoy: finalRiderId, // Rider B completed delivery
      })
    );

    mockDeliveryRatingFindOne.mockResolvedValue(null);
    mockDeliveryRatingCreate.mockResolvedValue({
      _id: "r-new",
      deliveryPartnerId: finalRiderId,
    });
    mockDeliveryRatingAggregate.mockResolvedValue([]);

    await submitDeliveryRating(customerId, { orderId, rating: 4 });

    expect(mockDeliveryRatingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryPartnerId: finalRiderId,
      })
    );
  });

  it("returns rating summary and distribution for a delivery partner", async () => {
    const riderId = "507f1f77bcf86cd799439011";

    mockDeliveryFindById.mockReturnValue(
      createQueryChain({
        _id: riderId,
        name: "Rahul Sharma",
        vehicleType: "bike",
      })
    );

    mockDeliveryRatingAggregate.mockResolvedValue([
      { _id: 5, count: 4 },
      { _id: 4, count: 1 },
    ]);

    const summary = await getDeliveryPartnerRatingSummary(riderId);

    expect(summary.totalRatings).toBe(5);
    expect(summary.averageRating).toBe(4.8);
    expect(summary.distribution[5]).toBe(4);
    expect(summary.distribution[4]).toBe(1);
    expect(summary.distribution[3]).toBe(0);
  });
});

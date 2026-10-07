import { jest } from "@jest/globals";
import mongoose from "mongoose";
import Review from "../app/models/review.js";
import Product from "../app/models/product.js";
import MasterProduct from "../app/models/masterProduct.js";
import Order from "../app/models/order.js";
import {
    resolveCanonicalProduct,
    verifyPurchaseEligibility,
    recomputeProductRatingAggregates,
    createOrUpdateReview,
    deleteReview,
    moderateReview,
} from "../app/services/reviewService.js";

describe("Verified-Purchase Product Rating & Review System", () => {
    let mockUser;
    let mockSeller;
    let mockMasterProduct;
    let mockProduct;
    let mockOrder;

    beforeEach(() => {
        mockUser = { _id: new mongoose.Types.ObjectId(), role: "customer" };
        mockSeller = { _id: new mongoose.Types.ObjectId() };
        
        mockMasterProduct = {
            _id: new mongoose.Types.ObjectId(),
            name: "Master Earl Grey Tea",
            averageRating: 0,
            reviewCount: 0,
            ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        };

        mockProduct = {
            _id: new mongoose.Types.ObjectId(),
            name: "Earl Grey Tea 100g",
            masterProductId: mockMasterProduct._id,
            sellerId: mockSeller._id,
            price: 250,
            stock: 50,
            averageRating: 0,
            reviewCount: 0,
            ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        };

        mockOrder = {
            _id: new mongoose.Types.ObjectId(),
            customer: mockUser._id,
            status: "delivered",
            items: [{ product: mockProduct._id, quantity: 1, price: 250 }],
        };
    });

    describe("Canonical Product Identity", () => {
        it("resolves masterProductId as canonical ID when present", async () => {
            jest.spyOn(Product, "findById").mockResolvedValue(mockProduct);
            const canonical = await resolveCanonicalProduct(mockProduct._id);
            expect(canonical.canonicalProductId.toString()).toBe(mockMasterProduct._id.toString());
            expect(canonical.canonicalModel).toBe("MasterProduct");
        });

        it("resolves productId as canonical ID when masterProductId is null", async () => {
            const standaloneProduct = { ...mockProduct, masterProductId: null };
            jest.spyOn(Product, "findById").mockResolvedValue(standaloneProduct);
            const canonical = await resolveCanonicalProduct(standaloneProduct._id);
            expect(canonical.canonicalProductId.toString()).toBe(standaloneProduct._id.toString());
            expect(canonical.canonicalModel).toBe("Product");
        });
    });

    describe("Purchase Eligibility Verification", () => {
        it("rejects review if user has no delivered order", async () => {
            jest.spyOn(Product, "findById").mockResolvedValue(mockProduct);
            jest.spyOn(Product, "find").mockReturnValue({
                select: jest.fn().mockResolvedValue([{ _id: mockProduct._id }]),
            });
            jest.spyOn(Order, "findOne").mockReturnValue({
                sort: jest.fn().mockResolvedValue(null),
            });

            const result = await verifyPurchaseEligibility(mockUser._id, mockProduct._id);
            expect(result.isEligible).toBe(false);
            expect(result.reason).toContain("delivered");
        });

        it("approves eligibility if user has a delivered order for product", async () => {
            jest.spyOn(Product, "findById").mockResolvedValue(mockProduct);
            jest.spyOn(Product, "find").mockReturnValue({
                select: jest.fn().mockResolvedValue([{ _id: mockProduct._id }]),
            });
            jest.spyOn(Order, "findOne").mockReturnValue({
                sort: jest.fn().mockResolvedValue(mockOrder),
            });

            const result = await verifyPurchaseEligibility(mockUser._id, mockProduct._id);
            expect(result.isEligible).toBe(true);
            expect(result.order._id.toString()).toBe(mockOrder._id.toString());
        });
    });

    describe("Rating Validation & Aggregation", () => {
        it("rejects non-integer ratings or ratings outside 1-5 range", async () => {
            await expect(
                createOrUpdateReview(mockUser._id, { productId: mockProduct._id, rating: 6 })
            ).rejects.toThrow("Rating must be an integer between 1 and 5");

            await expect(
                createOrUpdateReview(mockUser._id, { productId: mockProduct._id, rating: 3.5 })
            ).rejects.toThrow("Rating must be an integer between 1 and 5");
        });

        it("correctly computes average rating and rating distribution for published reviews", async () => {
            jest.spyOn(Review, "aggregate").mockResolvedValue([
                { _id: 5, count: 3 },
                { _id: 4, count: 1 },
            ]);
            jest.spyOn(MasterProduct, "findByIdAndUpdate").mockResolvedValue({});
            jest.spyOn(Product, "updateMany").mockResolvedValue({});

            const aggregates = await recomputeProductRatingAggregates(
                mockMasterProduct._id,
                "MasterProduct"
            );

            expect(aggregates.reviewCount).toBe(4);
            expect(aggregates.averageRating).toBe(4.8); // (5*3 + 4*1) / 4 = 19/4 = 4.75 -> 4.8
            expect(aggregates.ratingDistribution[5]).toBe(3);
            expect(aggregates.ratingDistribution[4]).toBe(1);
            expect(aggregates.ratingDistribution[1]).toBe(0);
        });
    });
});

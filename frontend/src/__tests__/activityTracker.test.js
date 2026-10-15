import { jest } from "@jest/globals";
import { trackProductClickActivity } from "../modules/customer/utils/activityTracker.js";

describe("trackProductClickActivity", () => {
  const originalLocalStorage = global.localStorage;
  let mockApiClient;

  beforeEach(() => {
    mockApiClient = {
      trackProductClick: jest.fn().mockResolvedValue({ data: { success: true } }),
    };

    let store = {};
    global.localStorage = {
      getItem: (key) => store[key] || null,
      setItem: (key, value) => {
        store[key] = String(value);
      },
      removeItem: (key) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  });

  afterAll(() => {
    global.localStorage = originalLocalStorage;
  });

  it("should not trigger api call if user is not authenticated (no token)", () => {
    const product = { _id: "prod-123", name: "Apple", price: 100 };
    trackProductClickActivity(product, mockApiClient);

    expect(mockApiClient.trackProductClick).not.toHaveBeenCalled();
  });

  it("should trigger api call when auth_customer token is present", () => {
    global.localStorage.setItem("auth_customer", "dummy-jwt-customer-token");
    const product = { _id: "prod-123", name: "Apple", price: 100, salePrice: 90 };

    trackProductClickActivity(product, mockApiClient);

    expect(mockApiClient.trackProductClick).toHaveBeenCalledWith({
      productId: "prod-123",
      productName: "Apple",
      price: 100,
      salePrice: 90,
      brand: "",
      categoryName: "",
      sellerId: null,
    });
  });

  it("should trigger api call when legacy token is present", () => {
    global.localStorage.setItem("token", "dummy-jwt-legacy-token");
    const product = { _id: "prod-legacy-1", name: "Mango", price: 80 };

    trackProductClickActivity(product, mockApiClient);

    expect(mockApiClient.trackProductClick).toHaveBeenCalledWith({
      productId: "prod-legacy-1",
      productName: "Mango",
      price: 80,
      salePrice: 0,
      brand: "",
      categoryName: "",
      sellerId: null,
    });
  });

  it("should throttle repeated clicks on the same product within 3 seconds", () => {
    global.localStorage.setItem("auth_customer", "dummy-jwt-token");
    const product = { _id: "prod-throttle-test", name: "Banana", price: 50 };

    trackProductClickActivity(product, mockApiClient);
    expect(mockApiClient.trackProductClick).toHaveBeenCalledTimes(1);

    // Immediate second click
    trackProductClickActivity(product, mockApiClient);
    expect(mockApiClient.trackProductClick).toHaveBeenCalledTimes(1);
  });

  it("should not throw or block when api call rejects", () => {
    global.localStorage.setItem("auth_customer", "dummy-jwt-token");
    mockApiClient.trackProductClick.mockRejectedValueOnce(new Error("Network error"));

    expect(() => {
      trackProductClickActivity({ _id: "prod-err-test", name: "Orange", price: 60 }, mockApiClient);
    }).not.toThrow();
  });
});

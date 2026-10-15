import { customerApi } from "../services/customerApi";
import { getStoredAuthToken } from "@core/utils/authStorage";
import { STORAGE_KEYS } from "@core/utils/storageKeys";

const CLICK_THROTTLE_MS = 3000;
const lastClickTimestamps = new Map();

/**
 * Returns any available customer auth token from storage.
 */
export function getCustomerAuthToken() {
  try {
    const local = typeof localStorage !== "undefined" ? localStorage : null;
    const session = typeof sessionStorage !== "undefined" ? sessionStorage : null;

    return (
      (typeof getStoredAuthToken === "function" ? getStoredAuthToken(STORAGE_KEYS.AUTH_CUSTOMER) : null) ||
      (local ? local.getItem("auth_customer") : null) ||
      (session ? session.getItem("auth_customer") : null) ||
      (local ? local.getItem("token") : null) ||
      (session ? session.getItem("token") : null) ||
      (local ? local.getItem("customerToken") : null) ||
      null
    );
  } catch {
    return null;
  }
}

/**
 * Tracks a product click/view for authenticated customers in a non-blocking, fail-safe manner.
 * Automatically throttles repeated clicks on the same product within 3 seconds.
 *
 * @param {Object} product - Product object being viewed/clicked.
 * @param {Object} [apiClient=customerApi] - API client instance.
 */
export function trackProductClickActivity(product, apiClient = customerApi) {
  try {
    if (!product) return;

    // Check if an auth token exists in storage for customer
    const token = getCustomerAuthToken();
    if (!token) {
      return;
    }

    const pid = String(product._id || product.id || "").trim();
    if (!pid) return;

    const now = Date.now();
    const lastClick = lastClickTimestamps.get(pid);
    if (lastClick && now - lastClick < CLICK_THROTTLE_MS) {
      return; // Throttled to prevent duplicate spam
    }
    lastClickTimestamps.set(pid, now);

    // Prune stale cache entries if map exceeds 200 items
    if (lastClickTimestamps.size > 200) {
      for (const [key, timestamp] of lastClickTimestamps.entries()) {
        if (now - timestamp > CLICK_THROTTLE_MS * 2) {
          lastClickTimestamps.delete(key);
        }
      }
    }

    const payload = {
      productId: pid,
      productName: product.name || "",
      price: product.price || 0,
      salePrice: product.salePrice || 0,
      brand: product.brand || "",
      categoryName:
        product.category?.name ||
        product.categoryId?.name ||
        (typeof product.category === "string" ? product.category : "") ||
        "",
      sellerId: product.sellerId?._id || product.sellerId || null,
    };

    if (apiClient && typeof apiClient.trackProductClick === "function") {
      apiClient.trackProductClick(payload).catch((err) => {
        console.warn("[ActivityTracker] Non-fatal tracking failure:", err?.message || err);
      });
    }
  } catch (err) {
    console.warn("[ActivityTracker] Non-fatal error:", err?.message || err);
  }
}

export default trackProductClickActivity;

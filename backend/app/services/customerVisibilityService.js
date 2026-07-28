import Seller from "../models/seller.js";
import { calculateDistance } from "../utils/helper.js";
import { buildKey, getOrSet, getTTL } from "./cacheService.js";
import { isShopCurrentlyOpen } from "./shopTimingService.js";

const MAX_SELLER_SEARCH_DISTANCE_M = 100000;

export function parseCustomerCoordinates(query = {}) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { valid: false, lat: null, lng: null };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false, lat: null, lng: null };
  }

  return { valid: true, lat, lng };
}

/**
 * Round lat/lng to 4 decimal places (~11m precision) for cache key.
 * This groups nearby requests into the same cache bucket.
 */
function buildNearbySellersKey(lat, lng) {
  const rLat = Number(lat).toFixed(4);
  const rLng = Number(lng).toFixed(4);
  return buildKey("sellers", "nearby", `${rLat}:${rLng}`);
}

export async function getNearbySellerIdsForCustomer(lat, lng) {
  const fetchFn = async () => {
    // Fetch only sellers that have a real GPS location configured, within 100km.
    // Sellers with missing or [0,0] coordinates are NOT shown by default —
    // they must have their shop location properly set by admin/seller.
    const geoSellers = await Seller.find({
      isActive: true,
      $or: [
        { applicationStatus: "approved" },
        { applicationStatus: { $exists: false } },
        { applicationStatus: null },
      ],
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [lng, lat],
          },
          $maxDistance: MAX_SELLER_SEARCH_DISTANCE_M,
        },
      },
    })
      .select("_id location serviceRadius isActive shopTiming applicationStatus")
      .lean();

    return geoSellers
      .filter((seller) => {
        if (!isShopCurrentlyOpen(seller)) return false;
        const coords = seller?.location?.coordinates;
        // Strictly require a valid, non-zero GPS location
        if (!Array.isArray(coords) || coords.length < 2) return false;
        const [sellerLng, sellerLat] = coords;
        // Skip sellers whose location is still at default [0, 0]
        if (Math.abs(sellerLat) < 1e-5 && Math.abs(sellerLng) < 1e-5) return false;
        if (!Number.isFinite(sellerLat) || !Number.isFinite(sellerLng)) return false;
        // Fine filter: customer must be within seller's own serviceRadius
        const distanceKm = calculateDistance(lat, lng, sellerLat, sellerLng);
        return distanceKm <= (seller.serviceRadius || 5);
      })
      .map((seller) => String(seller._id));
  };

  return getOrSet(buildNearbySellersKey(lat, lng), fetchFn, getTTL("nearbySellers"));
}

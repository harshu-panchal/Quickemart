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
    // 1. Fetch sellers matching location geometry within 100km
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

    // 2. Fetch sellers with default [0, 0] or missing coordinates (e.g. admin-created sellers)
    const defaultSellers = await Seller.find({
      isActive: true,
      $or: [
        { applicationStatus: "approved" },
        { applicationStatus: { $exists: false } },
        { applicationStatus: null },
      ],
      $or: [
        { location: { $exists: false } },
        { "location.coordinates": { $eq: [0, 0] } },
        { "location.coordinates": { $exists: false } },
      ],
    })
      .select("_id location serviceRadius isActive shopTiming applicationStatus")
      .lean();

    const sellerMap = new Map();
    for (const s of [...geoSellers, ...defaultSellers]) {
      sellerMap.set(String(s._id), s);
    }

    return Array.from(sellerMap.values())
      .filter((seller) => {
        if (!isShopCurrentlyOpen(seller)) return false;
        const coords = seller?.location?.coordinates;
        // If unconfigured/default [0, 0] or missing, seller is available by default
        if (!Array.isArray(coords) || coords.length < 2 || (coords[0] === 0 && coords[1] === 0)) {
          return true;
        }
        const [sellerLng, sellerLat] = coords;
        if (!Number.isFinite(sellerLat) || !Number.isFinite(sellerLng)) {
          return true;
        }
        const distanceKm = calculateDistance(lat, lng, sellerLat, sellerLng);
        return distanceKm <= (seller.serviceRadius || 5);
      })
      .map((seller) => String(seller._id));
  };

  return getOrSet(buildNearbySellersKey(lat, lng), fetchFn, getTTL("nearbySellers"));
}

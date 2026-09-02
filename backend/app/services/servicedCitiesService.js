import Seller from "../models/seller.js";
import { buildKey, getOrSet, invalidate } from "./cacheService.js";

/**
 * Extracts and normalizes city name from seller location and service profile
 */
function resolveCityFromSeller(seller) {
  // 1. Direct city property from seller location section
  if (seller?.city && String(seller.city).trim()) {
    return String(seller.city).trim();
  }

  // 2. Locality property from seller profile if present
  if (seller?.locality && String(seller.locality).trim()) {
    const loc = String(seller.locality).trim();
    if (loc.length > 2 && !/^\d{5,6}$/.test(loc)) {
      return loc;
    }
  }

  // 3. Extract city from seller full address string
  const address = String(seller?.address || "").trim();
  if (address) {
    const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const candidate = parts[parts.length - 2];
      if (candidate && candidate.length > 2 && !/^\d{5,6}$/.test(candidate)) {
        return candidate;
      }
    }
    if (parts[0] && parts[0].length > 2 && !/^\d{5,6}$/.test(parts[0])) {
      return parts[0];
    }
  }

  return null;
}

function formatTitleCase(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function getServicedCities(forceRefresh = false) {
  const cacheKey = buildKey("public", "servicedCities");

  if (forceRefresh) {
    await invalidate(cacheKey).catch(() => {});
  }

  // Short 30-second TTL so database changes reflect almost instantly
  return getOrSet(
    cacheKey,
    async () => {
      // Query ALL approved/verified sellers directly from DB
      const approvedSellers = await Seller.find({
        $or: [{ applicationStatus: "approved" }, { isVerified: true }],
      })
        .select("city locality state address location serviceRadius")
        .lean();

      const citySet = new Set();

      for (const seller of approvedSellers) {
        const rawCity = resolveCityFromSeller(seller);
        if (rawCity) {
          const formatted = formatTitleCase(rawCity);
          if (formatted && formatted.length > 2 && !/^\d+$/.test(formatted)) {
            citySet.add(formatted);
          }
        }
      }

      const uniqueCities = Array.from(citySet).sort((a, b) => a.localeCompare(b));

      // Fallback default cities if database has no seller entries yet
      if (uniqueCities.length === 0) {
        return ["Indore", "Udaipur"];
      }

      return uniqueCities;
    },
    30
  );
}

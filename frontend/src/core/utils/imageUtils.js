import { resolveApiBaseUrl } from '../api/resolveApiBaseUrl';

const CLOUDINARY_REGEX = /res\.cloudinary\.com/i;
const CLOUDINARY_UPLOAD_SEGMENT_REGEX = /\/upload\/([^/]+)\//i;

export function resolveImageUrl(url) {
  if (!url || typeof url !== "string") return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (CLOUDINARY_REGEX.test(url)) return url;

  // Primary base URL for images (production host where static uploads reside)
  const envApiUrl = import.meta.env.VITE_API_URL || "https://quickemartcom.com/api";
  const productionBase = envApiUrl.replace(/\/+$/, "").replace(/\/api$/, "");
  const imageBase = `${productionBase}/api`; // https://quickemartcom.com/api

  // 1. If URL starts with http://localhost:7000 or http://127.0.0.1:7000, convert it to production imageBase
  if (url.includes("localhost:7000") || url.includes("127.0.0.1:7000")) {
    const uploadsIdx = url.indexOf("uploads/");
    if (uploadsIdx !== -1) {
      const subPath = url.substring(uploadsIdx + "uploads/".length);
      return `${imageBase}/uploads/${subPath}`;
    }
  }

  // 2. If url contains "uploads/" (whether relative or absolute)
  const uploadsIdx = url.indexOf("uploads/");
  if (uploadsIdx !== -1) {
    const subPath = url.substring(uploadsIdx + "uploads/".length);
    return `${imageBase}/uploads/${subPath}`;
  }

  // 3. If relative path (does not start with http:// or https://)
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    const cleanPath = url.startsWith("/") ? url.slice(1) : url;
    return `${imageBase}/uploads/${cleanPath}`;
  }

  return url;
}

/**
 * Appends Cloudinary optimisation transforms to a URL.
 * Safe to call on any URL — non-Cloudinary URLs are returned unchanged.
 */
export function applyCloudinaryTransform(url, params = "f_auto,q_auto,w_400,dpr_auto") {
  if (!url) return url;
  
  const resolved = resolveImageUrl(url);
  if (!CLOUDINARY_REGEX.test(resolved)) return resolved;
  
  const match = resolved.match(CLOUDINARY_UPLOAD_SEGMENT_REGEX);
  if (!match) return resolved;

  const segmentAfterUpload = match[1] || "";
  const alreadyHasTransforms =
    segmentAfterUpload.includes(",") ||
    /^[a-z]{1,4}_[^/]+$/i.test(segmentAfterUpload);

  if (alreadyHasTransforms) return resolved;

  // Insert transform before the segment after `/upload/` (often `v123...`).
  return resolved.replace(CLOUDINARY_UPLOAD_SEGMENT_REGEX, `/upload/${params}/$1/`);
}

export function isCloudinaryUrl(url) {
  return !!url && CLOUDINARY_REGEX.test(url);
}

export function buildCloudinarySrcSet(
  url,
  entries,
  baseParams = "f_auto,q_auto,c_fill,g_auto",
) {
  if (!isCloudinaryUrl(url) || !Array.isArray(entries) || entries.length === 0)
    return undefined;

  return entries
    .map(({ w, h }) => {
      const params = [
        baseParams,
        typeof w === "number" ? `w_${w}` : null,
        typeof h === "number" ? `h_${h}` : null,
      ]
        .filter(Boolean)
        .join(",");

      const href = applyCloudinaryTransform(url, params) || url;
      const descriptor = typeof w === "number" ? `${w}w` : "";
      return descriptor ? `${href} ${descriptor}` : href;
    })
    .join(", ");
}

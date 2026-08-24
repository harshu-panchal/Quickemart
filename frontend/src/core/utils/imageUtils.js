import { resolveApiBaseUrl } from '../api/resolveApiBaseUrl';

const CLOUDINARY_REGEX = /res\.cloudinary\.com/i;
const CLOUDINARY_UPLOAD_SEGMENT_REGEX = /\/upload\/([^/]+)\//i;

export function resolveImageUrl(url) {
  if (!url || typeof url !== "string") return url;
  if (CLOUDINARY_REGEX.test(url)) return url;

  let apiBase;
  try {
    apiBase = resolveApiBaseUrl().replace(/\/api$/, "");
  } catch {
    return url;
  }
  if (!apiBase) return url;

  // If the URL contains /uploads/, extract the relative path starting from /uploads/
  // and prepend the active backend base URL with the /api prefix.
  const idx = url.indexOf("/uploads/");
  if (idx !== -1) {
    return `${apiBase}/api${url.substring(idx)}`;
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

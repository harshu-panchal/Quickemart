import crypto from "crypto";

// Suggested-filename convention for the Admin Bulk Listing ZIP import:
// quickemart-<hash>-<purpose>.<extension>
//
// This is ONLY used to suggest filenames (template sample row, "Download
// Image Filename List"). It is never enforced at import time — if the
// Excel already contains a filename (any convention or none), that exact
// value is the source of truth for matching against the ZIP.
//
// The hash is deterministic (sha1 of rowNum+productName, truncated) so
// re-downloading the filename list for unchanged Excel content always
// suggests the same names.
export function buildQuickemartFilename({ rowNum, productName, purpose, extension }) {
    const hash = crypto
        .createHash("sha1")
        .update(`${rowNum}:${productName || ""}`)
        .digest("hex")
        .slice(0, 6);
    const safePurpose = String(purpose || "image")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "image";
    const safeExtension = String(extension || "webp")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "webp";

    return `quickemart-${hash}-${safePurpose}.${safeExtension}`;
}

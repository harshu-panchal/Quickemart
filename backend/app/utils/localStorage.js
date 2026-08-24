import axios from "axios";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

function getMaxUploadBytes() {
    const raw = parseInt(process.env.MEDIA_MAX_FILE_SIZE || "10485760", 10); // 10MB default
    return Number.isFinite(raw) && raw > 0 ? raw : 10485760;
}

// MIME types accepted for authenticated buffer uploads (admin/user forms) —
// mirrors the app's existing allow-list, which includes PDFs for KYC/seller docs.
function getBufferAllowedMimeTypes() {
    return (
        process.env.MEDIA_ALLOWED_MIME_TYPES ||
        "image/jpeg,image/png,image/webp,image/gif,application/pdf"
    )
        .split(",")
        .map((mime) => mime.trim().toLowerCase())
        .filter(Boolean);
}

// MIME types accepted when downloading images from arbitrary external URLs
// (e.g. bulk catalog import). Kept stricter than buffer uploads since this
// path fetches attacker-influenced third-party URLs.
const EXTERNAL_IMAGE_ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
];

const MIME_EXTENSION_MAP = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
};

function getPublicServerUrl() {
    const configured = String(process.env.PUBLIC_SERVER_URL || "").trim();
    if (configured) return configured.replace(/\/+$/, "");
    const port = process.env.PORT || "7000";
    return `http://localhost:${port}`;
}

// Sanitizes a caller-supplied folder string (e.g. "delivery/profiles",
// "master-catalog") into a safe nested path segment, stripping any
// directory traversal or non-filesystem-safe characters.
function sanitizeFolderName(folderName) {
    const segments = String(folderName || "misc")
        .split("/")
        .map((segment) =>
            segment
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, "")
        )
        .filter((segment) => segment && segment !== "." && segment !== "..");
    return segments.length > 0 ? segments.join("/") : "misc";
}

function extensionFromMime(mimeType) {
    return MIME_EXTENSION_MAP[String(mimeType || "").toLowerCase()] || null;
}

// Falls back to reading the file's own magic bytes when a caller doesn't
// supply a mimeType (several existing callers never did — Cloudinary used
// to auto-detect from the buffer). Also used to double-check the declared
// content-type isn't just mismatched with reality.
function sniffMimeType(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif"; // GIF87a / GIF89a
    if (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
        return "image/webp";
    }
    if (buffer.subarray(0, 4).toString("ascii") === "%PDF") return "application/pdf";
    return null;
}

function generateFileName(extension) {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const safeExt = String(extension || "bin").replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
    return `${id}-${timestamp}.${safeExt}`;
}

/**
 * Persists a file buffer to local disk under public/uploads/<folderName>/
 * and returns its full public URL. Mirrors the (folder, {mimeType}) shape
 * that callers already pass to uploadToCloudinary.
 */
export async function saveFileBufferToDisk(buffer, folderName, mimeType) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error("Empty file buffer");
    }

    const allowedMimeTypes = getBufferAllowedMimeTypes();
    let normalizedMime = String(mimeType || "").trim().toLowerCase();
    if (!normalizedMime || !allowedMimeTypes.includes(normalizedMime)) {
        // No usable hint from the caller (or it didn't match an allowed type)
        // — fall back to sniffing the buffer's own magic bytes, matching how
        // Cloudinary used to auto-detect resource type from content alone.
        const sniffed = sniffMimeType(buffer);
        if (sniffed && allowedMimeTypes.includes(sniffed)) {
            normalizedMime = sniffed;
        }
    }

    if (!normalizedMime || !allowedMimeTypes.includes(normalizedMime)) {
        throw new Error(`Unsupported file type: ${normalizedMime || "unknown"}`);
    }

    const maxUploadBytes = getMaxUploadBytes();
    if (buffer.length > maxUploadBytes) {
        throw new Error(`File exceeds maximum allowed size of ${maxUploadBytes} bytes`);
    }

    const extension = extensionFromMime(normalizedMime) || "bin";
    const safeFolder = sanitizeFolderName(folderName);
    const targetDir = path.join(UPLOADS_ROOT, ...safeFolder.split("/"));
    await fs.mkdir(targetDir, { recursive: true });

    const fileName = generateFileName(extension);
    const targetPath = path.join(targetDir, fileName);
    await fs.writeFile(targetPath, buffer);

    const relativePath = `/uploads/${safeFolder}/${fileName}`;
    return `${getPublicServerUrl()}${relativePath}`;
}

// Best-effort pre-check: ask the remote server for the file size via HEAD
// before committing to a GET. Some servers don't support HEAD or omit
// Content-Length — in that case we return null and let the GET's
// maxContentLength guard below be the source of truth.
async function probeContentLength(url) {
    try {
        const headRes = await axios.head(url, {
            timeout: 8000,
            validateStatus: (status) => status >= 200 && status < 400,
        });
        const len = Number(headRes.headers["content-length"]);
        return Number.isFinite(len) && len > 0 ? len : null;
    } catch {
        return null;
    }
}

/**
 * Downloads an image from an external URL (e.g. a bulk-import Excel row),
 * enforces size/type limits, and saves it locally. Returns the full public
 * URL, or throws a descriptive error the caller can attach to a row.
 */
export async function downloadExternalImage(url, folderName) {
    if (!url || typeof url !== "string") {
        throw new Error("Image URL is required");
    }

    const maxUploadBytes = getMaxUploadBytes();

    const declaredLength = await probeContentLength(url);
    if (declaredLength && declaredLength > maxUploadBytes) {
        throw new Error(`Image exceeds maximum allowed size of ${maxUploadBytes} bytes`);
    }

    let response;
    try {
        response = await axios.get(url, {
            responseType: "arraybuffer",
            maxContentLength: maxUploadBytes,
            maxBodyLength: maxUploadBytes,
            timeout: 20000,
            validateStatus: (status) => status >= 200 && status < 300,
        });
    } catch (err) {
        if (err.response) {
            throw new Error(`Image download failed with status ${err.response.status}`);
        }
        const msg = String(err.message || "");
        if (/maxContentLength|maxBodyLength/i.test(msg)) {
            throw new Error(`Image exceeds maximum allowed size of ${maxUploadBytes} bytes`);
        }
        throw new Error(`Failed to download image: ${msg || "network error"}`);
    }

    const buffer = Buffer.from(response.data);
    if (buffer.length > maxUploadBytes) {
        throw new Error(`Image exceeds maximum allowed size of ${maxUploadBytes} bytes`);
    }

    let contentType = String(response.headers["content-type"] || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
    if (!EXTERNAL_IMAGE_ALLOWED_MIME_TYPES.includes(contentType)) {
        // Some servers respond with a generic content-type (e.g.
        // application/octet-stream) for real images — fall back to sniffing
        // the actual bytes before rejecting the row.
        const sniffed = sniffMimeType(buffer);
        if (sniffed && EXTERNAL_IMAGE_ALLOWED_MIME_TYPES.includes(sniffed)) {
            contentType = sniffed;
        } else {
            throw new Error(`Unsupported image content type: ${contentType || "unknown"}`);
        }
    }

    return saveFileBufferToDisk(buffer, folderName, contentType);
}

/**
 * Safely deletes a locally uploaded file from disk given its URL or relative path.
 * Ignores Cloudinary or external URLs.
 */
export async function deleteUploadedFile(fileUrl) {
    if (!fileUrl || typeof fileUrl !== "string") return;

    // Ignore Cloudinary or external URLs unless they contain /uploads/
    if (/res\.cloudinary\.com/i.test(fileUrl)) {
        return;
    }
    if (/^https?:\/\//i.test(fileUrl) && !fileUrl.includes("/uploads/")) {
        return;
    }

    try {
        let uploadsIndex = fileUrl.indexOf("/uploads/");
        if (uploadsIndex === -1) {
            uploadsIndex = fileUrl.indexOf("/api/uploads/");
        }

        if (uploadsIndex === -1) {
            return; // Not a local upload URL
        }

        const marker = fileUrl.includes("/api/uploads/") ? "/api/uploads/" : "/uploads/";
        const relativePath = fileUrl.substring(fileUrl.indexOf(marker) + marker.length);
        
        // Resolve absolute target path on disk
        const targetPath = path.join(UPLOADS_ROOT, ...relativePath.split("/"));

        // Delete file
        await fs.unlink(targetPath);
    } catch (err) {
        // Ignore file not found (ENOENT) errors
        if (err.code !== "ENOENT") {
            // Log other errors if any
            console.error("Failed to delete local upload file:", fileUrl, err.message);
        }
    }
}

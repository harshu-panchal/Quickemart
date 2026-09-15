import yauzl from "yauzl";
import path from "path";

// Per-entry and cumulative (uncompressed) size caps — guards against
// decompression-bomb ZIPs. Overridable via env for operators who need to
// import unusually large product photography.
const DEFAULT_MAX_ENTRY_BYTES = parseInt(
    process.env.BULK_IMPORT_MAX_IMAGE_BYTES || "15728640", // 15MB
    10,
);
const DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = parseInt(
    process.env.BULK_IMPORT_MAX_ZIP_UNCOMPRESSED_BYTES || String(2 * 1024 * 1024 * 1024), // 2GB
    10,
);

function isDirectoryEntry(entry) {
    return /[/\\]$/.test(entry.fileName);
}

// yauzl already rejects entries with backslashes, absolute paths, or ".."
// segments by default (see its internal validateFileName) and emits an
// "error" on the zipfile — the explicit check here just gives a clearer,
// app-specific message before that generic rejection would otherwise fire.
function isUnsafeEntryName(fileName) {
    if (!fileName) return true;
    if (fileName.includes("\\")) return true;
    if (/^[a-zA-Z]:/.test(fileName) || fileName.startsWith("/")) return true;
    if (fileName.split("/").includes("..")) return true;
    return false;
}

// Best-effort symlink detection: unix permission bits only live in the
// upper 16 bits of externalFileAttributes when the archive was authored on
// a unix host (the low byte of versionMadeBy === 3).
function isSymlinkEntry(entry) {
    const madeByHost = (entry.versionMadeBy >> 8) & 0xff;
    if (madeByHost !== 3) return false;
    const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
    return (unixMode & 0xf000) === 0xa000;
}

/**
 * Opens a ZIP and walks every entry exactly once to build a filename index,
 * without ever reading/decompressing file contents. Keeps the underlying
 * zipfile handle OPEN and returns it — the caller uses it afterward for
 * O(1) random-access extraction via `extractZipEntryBuffer` (no re-scanning
 * per image) and is responsible for calling `zipfile.close()` exactly once
 * when the whole import is done (success or failure).
 *
 * Resolves with:
 *   {
 *     zipfile,           // open yauzl ZipFile handle — caller must close()
 *     manifest,          // Map<basename, { entry } | { ambiguous: true }>
 *     entryCount,
 *     totalUncompressedBytes,
 *   }
 */
export function buildZipManifest(zipPath, options = {}) {
    const maxEntryBytes = options.maxEntryBytes || DEFAULT_MAX_ENTRY_BYTES;
    const maxTotalBytes = options.maxTotalBytes || DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES;

    return new Promise((resolve, reject) => {
        // autoClose:false is required — otherwise yauzl closes the file
        // handle as soon as the manifest scan reaches "end", and the whole
        // point of returning `zipfile` is to do O(1) random-access reads
        // against it afterward via extractZipEntryBuffer.
        yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
            if (err) {
                return reject(new Error(`Invalid or corrupted ZIP file: ${err.message}`));
            }

            const manifest = new Map();
            let entryCount = 0;
            let totalUncompressedBytes = 0;
            let settled = false;

            const fail = (message) => {
                if (settled) return;
                settled = true;
                try { zipfile.close(); } catch (_) { /* already closed */ }
                reject(new Error(message));
            };

            const finish = () => {
                if (settled) return;
                settled = true;
                resolve({ zipfile, manifest, entryCount, totalUncompressedBytes });
            };

            zipfile.on("error", (zipErr) => fail(`ZIP read error: ${zipErr.message}`));

            zipfile.on("entry", (entry) => {
                if (settled) return;

                if (isDirectoryEntry(entry)) {
                    zipfile.readEntry();
                    return;
                }

                if (isUnsafeEntryName(entry.fileName)) {
                    fail(`Unsafe file path detected in ZIP: "${entry.fileName}"`);
                    return;
                }

                if (isSymlinkEntry(entry)) {
                    fail(`Symlink entries are not allowed in ZIP: "${entry.fileName}"`);
                    return;
                }

                const size = Number(entry.uncompressedSize) || 0;
                const basename = path.posix.basename(entry.fileName);

                if (size > maxEntryBytes) {
                    fail(
                        `Image "${basename}" exceeds the maximum allowed size of ${maxEntryBytes} bytes`,
                    );
                    return;
                }

                totalUncompressedBytes += size;
                if (totalUncompressedBytes > maxTotalBytes) {
                    fail(
                        `The ZIP file's total uncompressed size exceeds the maximum allowed limit of ${maxTotalBytes} bytes`,
                    );
                    return;
                }

                entryCount += 1;

                if (manifest.has(basename)) {
                    manifest.set(basename, { ambiguous: true });
                } else {
                    manifest.set(basename, { entry });
                }

                zipfile.readEntry();
            });

            zipfile.on("end", finish);

            zipfile.readEntry();
        });
    });
}

/**
 * Extracts exactly one entry's contents from an already-open zipfile handle
 * (as returned by `buildZipManifest`). O(1) random access — does not
 * re-scan the archive. Only ever holds this single entry's buffer in
 * memory, never the whole archive.
 */
export function extractZipEntryBuffer(zipfile, entry) {
    return new Promise((resolve, reject) => {
        zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
                return reject(new Error(`Failed to read "${entry.fileName}" from ZIP: ${err.message}`));
            }

            const chunks = [];
            readStream.on("data", (chunk) => chunks.push(chunk));
            readStream.on("end", () => resolve(Buffer.concat(chunks)));
            readStream.on("error", (streamErr) =>
                reject(new Error(`Failed to read "${entry.fileName}" from ZIP: ${streamErr.message}`)),
            );
        });
    });
}

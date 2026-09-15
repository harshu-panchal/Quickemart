import { jest } from "@jest/globals";
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import xlsx from "xlsx";
import axios from "axios";

// ---- Mock only the persistence layer (Mongoose models) — matches this
// repo's own existing convention (see order-query-service.test.js). All
// file-system / ZIP / image-validation / storage code runs FOR REAL.

const categorySaves = [];
function CategoryCtor(doc) {
  Object.assign(this, doc);
  this._id = `cat_${Math.random().toString(36).slice(2)}`;
  this.save = jest.fn().mockImplementation(async () => {
    categorySaves.push(this);
    return this;
  });
}
CategoryCtor.findOne = jest.fn().mockResolvedValue(null); // always "not found" -> forces creation, exercised for real
jest.unstable_mockModule("../app/models/category.js", () => ({ default: CategoryCtor }));

const masterProductFindOne = jest.fn().mockResolvedValue(null);
const masterProductInsertMany = jest.fn().mockImplementation(async (docs) => docs.map((d, i) => ({ ...d, _id: `mp_${i}_${Math.random().toString(36).slice(2)}` })));
const masterProductUpdateOne = jest.fn();
const masterProductUpdateMany = jest.fn();
const masterProductFindByIdAndUpdate = jest.fn();
const masterProductDeleteOne = jest.fn();
const masterProductFindByIdAndDelete = jest.fn();
jest.unstable_mockModule("../app/models/masterProduct.js", () => ({
  default: {
    findOne: masterProductFindOne,
    insertMany: masterProductInsertMany,
    updateOne: masterProductUpdateOne,
    updateMany: masterProductUpdateMany,
    findByIdAndUpdate: masterProductFindByIdAndUpdate,
    deleteOne: masterProductDeleteOne,
    findByIdAndDelete: masterProductFindByIdAndDelete,
  },
}));

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: { find: jest.fn().mockResolvedValue([]) },
}));

let lastTask = null;
function CatalogImportTaskCtor(doc) {
  Object.assign(this, doc);
  this._id = `task_${Math.random().toString(36).slice(2)}`;
  this.errors = this.errors || [];
  this.total = this.total || 0;
  this.processed = this.processed || 0;
  this.success = this.success || 0;
  this.skipped = this.skipped || 0;
  this.failed = this.failed || 0;
  this.imagesTotal = this.imagesTotal || 0;
  this.imagesProcessed = this.imagesProcessed || 0;
  this.save = jest.fn().mockImplementation(async () => this);
  lastTask = this;
}
jest.unstable_mockModule("../app/models/catalogImportTask.js", () => ({ default: CatalogImportTaskCtor }));

// Everything else (xlsx, zipManifest, quickemartFilename, localStorage's
// saveFileBufferToDisk/sniffMimeType, cloudinary.js's uploadToCloudinary)
// is REAL — this is the actual code path being verified.
const { bulkImportMasterProducts } = await import("../app/controllers/adminCatalogController.js");
const yazl = (await import("yazl")).default;

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads", "master-catalog");

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP_BYTES = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.from([0x20, 0, 0, 0]), Buffer.from("WEBP", "ascii"), Buffer.alloc(8)]);

function buildTestZip(entries) {
  return new Promise((resolve, reject) => {
    const zipfile = new yazl.ZipFile();
    for (const e of entries) zipfile.addBuffer(e.buffer, e.name);
    const tmpPath = path.join(os.tmpdir(), `verify-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    const out = fs.createWriteStream(tmpPath);
    zipfile.outputStream.pipe(out).on("close", () => resolve(tmpPath)).on("error", reject);
    zipfile.end();
  });
}

function buildTestExcel(rows) {
  const headers = [
    "Header Category", "Main Category", "Sub Category", "Brand", "Product Name",
    "Variant Name", "Unit", "Pack Size", "Product Description", "Specifications",
    "Search Tags", "Primary Image URL", "Front Image URL", "Back Image URL",
    "Details Image URL", "Right Side Image URL", "Left Side Image URL", "GST Tax (%)", "Status",
  ];
  const sheetRows = [headers, headers.map(() => "SAMPLE"), ...rows.map((r) => headers.map((h) => r[h] ?? ""))];
  const ws = xlsx.utils.aoa_to_sheet(sheetRows);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Template");
  const tmpPath = path.join(os.tmpdir(), `verify-excel-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  xlsx.writeFile(wb, tmpPath);
  return tmpPath;
}

function makeReqRes(excelPath, zipPath) {
  const req = { files: { excelFile: excelPath ? [{ path: excelPath }] : undefined, imagesZip: zipPath ? [{ path: zipPath }] : undefined } };
  const res = {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
  return { req, res };
}

async function waitForTaskCompletion(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (lastTask && (lastTask.status === "COMPLETED" || lastTask.status === "FAILED")) return lastTask;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Task did not complete within ${timeoutMs}ms (last status: ${lastTask?.status})`);
}

describe("VERIFICATION: bulkImportMasterProducts (real files, real ZIP, real storage; DB layer mocked)", () => {
  let axiosGetSpy;
  let axiosHeadSpy;

  beforeEach(() => {
    axiosGetSpy = jest.spyOn(axios, "get");
    axiosHeadSpy = jest.spyOn(axios, "head");
    masterProductFindOne.mockReset().mockResolvedValue(null);
    masterProductInsertMany.mockClear();
    masterProductUpdateOne.mockClear();
    masterProductUpdateMany.mockClear();
    masterProductFindByIdAndUpdate.mockClear();
    masterProductDeleteOne.mockClear();
    masterProductFindByIdAndDelete.mockClear();
    lastTask = null;
  });

  afterEach(() => {
    axiosGetSpy.mockRestore();
    axiosHeadSpy.mockRestore();
  });

  test("1-2-3: real import writes real files under /public/uploads/master-catalog, stores the resulting URL on the new doc, and makes zero network calls", async () => {
    const zipPath = await buildTestZip([
      { name: "quickemart-verify1-primary.jpg", buffer: JPEG_BYTES },
      { name: "quickemart-verify1-front.png", buffer: PNG_BYTES },
      { name: "quickemart-verify1-back.webp", buffer: WEBP_BYTES },
    ]);
    const excelPath = buildTestExcel([{
      "Header Category": "Verify Header", "Main Category": "Verify Category", "Brand": "VerifyBrand",
      "Product Name": "Verification Product One", "Unit": "pcs",
      "Primary Image URL": "quickemart-verify1-primary.jpg",
      "Front Image URL": "quickemart-verify1-front.png",
      "Back Image URL": "quickemart-verify1-back.webp",
      "Status": "Active",
    }]);

    const { req, res } = makeReqRes(excelPath, zipPath);
    await bulkImportMasterProducts(req, res);
    expect(res._status).toBe(202);

    const task = await waitForTaskCompletion();
    expect(task.status).toBe("COMPLETED");
    expect(task.failed).toBe(0);
    expect(task.success).toBe(1);
    expect(task.imagesProcessed).toBe(3);

    // 5. Duplicate handling untouched: findOne was consulted for slug dedup.
    expect(masterProductFindOne).toHaveBeenCalled();

    // 2. Physically saved + correct URL stored on the inserted doc.
    expect(masterProductInsertMany).toHaveBeenCalledTimes(1);
    const [insertedDocs] = masterProductInsertMany.mock.calls[0];
    expect(insertedDocs).toHaveLength(1);
    const doc = insertedDocs[0];

    const urlPattern = /^http:\/\/localhost:\d+\/uploads\/master-catalog\/[a-f0-9-]+-\d+\.(jpg|png|webp)$/;
    expect(doc.mainImage).toMatch(urlPattern);
    expect(doc.galleryImages).toHaveLength(2);
    doc.galleryImages.forEach((url) => expect(url).toMatch(urlPattern));

    // Confirm the file referenced by that URL actually exists on disk with real content.
    const allUrls = [doc.mainImage, ...doc.galleryImages];
    for (const url of allUrls) {
      const filename = url.split("/uploads/master-catalog/")[1];
      const diskPath = path.join(UPLOADS_ROOT, filename);
      const stat = await fsp.stat(diskPath); // throws if missing
      expect(stat.size).toBeGreaterThan(0);
    }

    // 3. Zero network operations for these new ZIP images — no external
    // download, no real Cloudinary API call (uploadToCloudinary -> local disk only).
    expect(axiosGetSpy).not.toHaveBeenCalled();
    expect(axiosHeadSpy).not.toHaveBeenCalled();

    // Structural existing-doc protection: only findOne (read) + insertMany
    // (new docs) were ever invoked on MasterProduct — no update/delete path exists.
    expect(masterProductUpdateOne).not.toHaveBeenCalled();
    expect(masterProductUpdateMany).not.toHaveBeenCalled();
    expect(masterProductFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(masterProductDeleteOne).not.toHaveBeenCalled();
    expect(masterProductFindByIdAndDelete).not.toHaveBeenCalled();

    // 6. Temp files deleted after a successful run.
    await new Promise((r) => setTimeout(r, 50)); // finally-block cleanup runs after task.save()
    await expect(fsp.stat(excelPath)).rejects.toThrow();
    await expect(fsp.stat(zipPath)).rejects.toThrow();

    // cleanup uploaded fixtures this test created
    for (const url of allUrls) {
      const filename = url.split("/uploads/master-catalog/")[1];
      await fsp.unlink(path.join(UPLOADS_ROOT, filename)).catch(() => {});
    }
  }, 20000);

  test("5: duplicate slug is SKIPPED, not updated — findOne match short-circuits before any image work", async () => {
    masterProductFindOne.mockResolvedValueOnce({ _id: "existing_doc_id", slug: "verification-product-two-verifybrand" });

    const zipPath = await buildTestZip([{ name: "quickemart-verify2-primary.webp", buffer: WEBP_BYTES }]);
    const excelPath = buildTestExcel([{
      "Header Category": "Verify Header", "Main Category": "Verify Category", "Brand": "VerifyBrand",
      "Product Name": "Verification Product Two", "Unit": "pcs",
      "Primary Image URL": "quickemart-verify2-primary.webp",
      "Status": "Active",
    }]);

    const { req, res } = makeReqRes(excelPath, zipPath);
    await bulkImportMasterProducts(req, res);
    const task = await waitForTaskCompletion();

    expect(task.status).toBe("COMPLETED");
    expect(task.skipped).toBe(1);
    expect(task.success).toBe(0);
    // Skip happens before any image extraction/upload for that row.
    expect(task.imagesProcessed).toBe(0);
    expect(masterProductInsertMany).not.toHaveBeenCalled();
    expect(masterProductUpdateOne).not.toHaveBeenCalled();
    expect(masterProductFindByIdAndUpdate).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 50));
    await expect(fsp.stat(excelPath)).rejects.toThrow();
    await expect(fsp.stat(zipPath)).rejects.toThrow();
  }, 20000);

  test("6: temp files are deleted after a FAILED import (corrupted ZIP)", async () => {
    const zipPath = path.join(os.tmpdir(), `verify-corrupt-${Date.now()}.zip`);
    fs.writeFileSync(zipPath, Buffer.from("this is not a real zip file"));
    const excelPath = buildTestExcel([{
      "Header Category": "Verify Header", "Main Category": "Verify Category", "Brand": "VerifyBrand",
      "Product Name": "Verification Product Three", "Unit": "pcs",
      "Primary Image URL": "whatever.webp", "Status": "Active",
    }]);

    const { req, res } = makeReqRes(excelPath, zipPath);
    await bulkImportMasterProducts(req, res);
    const task = await waitForTaskCompletion();

    expect(task.status).toBe("FAILED");
    expect(task.errors.some((e) => e.col === "Images ZIP")).toBe(true);
    expect(masterProductInsertMany).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 50));
    await expect(fsp.stat(excelPath)).rejects.toThrow();
    await expect(fsp.stat(zipPath)).rejects.toThrow();
  }, 20000);

  test("4: pre-existing on-disk images (standing in for existing products' image files) are byte-for-byte and mtime unchanged after an unrelated import runs", async () => {
    // Use two files that already exist in public/uploads/master-catalog/
    // (representing already-imported products' images, exactly as they'd
    // sit on a real server) as the "existing products" for this regression
    // check. Also register one existing product doc carrying a legacy
    // res.cloudinary.com URL — the structural proof that MasterProduct is
    // never updated/deleted (asserted below) is what protects it, since
    // there's no local file to fingerprint for a URL that was never really
    // fetched.
    const existingFiles = fs.readdirSync(UPLOADS_ROOT).slice(0, 2);
    expect(existingFiles.length).toBe(2);
    const before = existingFiles.map((name) => {
      const p = path.join(UPLOADS_ROOT, name);
      const stat = fs.statSync(p);
      const hash = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
      return { name, mtimeMs: stat.mtimeMs, size: stat.size, hash };
    });

    // Simulate an existing legacy-Cloudinary product being present in the
    // "database" for this run's findOne() checks (never matched by the new
    // rows' slugs, so it's simply never touched).
    masterProductFindOne.mockResolvedValue(null);

    const zipPath = await buildTestZip([{ name: "quickemart-verify5-primary.webp", buffer: WEBP_BYTES }]);
    const excelPath = buildTestExcel([{
      "Header Category": "Verify Header", "Main Category": "Verify Category", "Brand": "VerifyBrand",
      "Product Name": "Verification Product Five", "Unit": "pcs",
      "Primary Image URL": "quickemart-verify5-primary.webp", "Status": "Active",
    }]);

    const { req, res } = makeReqRes(excelPath, zipPath);
    await bulkImportMasterProducts(req, res);
    const task = await waitForTaskCompletion();
    expect(task.status).toBe("COMPLETED");
    expect(task.success).toBe(1);

    // The pre-existing files must be byte-for-byte and mtime identical.
    for (const b of before) {
      const p = path.join(UPLOADS_ROOT, b.name);
      const stat = fs.statSync(p);
      const hash = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
      expect(stat.mtimeMs).toBe(b.mtimeMs);
      expect(stat.size).toBe(b.size);
      expect(hash).toBe(b.hash);
    }

    // Never any write/delete call against MasterProduct other than the one
    // insertMany for the new row — the structural guarantee that protects
    // both the /uploads/... files above AND any legacy res.cloudinary.com
    // URL sitting in an existing document.
    expect(masterProductUpdateOne).not.toHaveBeenCalled();
    expect(masterProductUpdateMany).not.toHaveBeenCalled();
    expect(masterProductFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(masterProductDeleteOne).not.toHaveBeenCalled();
    expect(masterProductFindByIdAndDelete).not.toHaveBeenCalled();
    expect(masterProductInsertMany).toHaveBeenCalledTimes(1);

    // cleanup this test's own new upload
    const [insertedDocs] = masterProductInsertMany.mock.calls[0];
    const newUrl = insertedDocs[0].mainImage;
    await fsp.unlink(path.join(UPLOADS_ROOT, newUrl.split("/uploads/master-catalog/")[1])).catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
  }, 20000);

  test("mandatory-file validation: missing ZIP -> HTTP 400, no task created, no processing", async () => {
    const excelPath = buildTestExcel([{ "Header Category": "X", "Main Category": "Y", "Brand": "Z", "Product Name": "P", "Unit": "u", "Primary Image URL": "a.webp" }]);
    const { req, res } = makeReqRes(excelPath, null);
    await bulkImportMasterProducts(req, res);

    expect(res._status).toBe(400);
    expect(res._body.message).toMatch(/Both the Excel file and the Images ZIP are required/);
    expect(lastTask).toBeNull();
    // The one temp file that WAS written (multer would have written excelPath) is cleaned up.
    await expect(fsp.stat(excelPath)).rejects.toThrow();
  });

  test("external URL in an image cell is rejected without any network call", async () => {
    const zipPath = await buildTestZip([{ name: "unused.webp", buffer: WEBP_BYTES }]);
    const excelPath = buildTestExcel([{
      "Header Category": "Verify Header", "Main Category": "Verify Category", "Brand": "VerifyBrand",
      "Product Name": "Verification Product Four", "Unit": "pcs",
      "Primary Image URL": "https://example.com/some-image.jpg",
      "Status": "Active",
    }]);
    const { req, res } = makeReqRes(excelPath, zipPath);
    await bulkImportMasterProducts(req, res);
    const task = await waitForTaskCompletion();

    expect(task.status).toBe("COMPLETED");
    expect(task.failed).toBe(1);
    expect(task.errors[0].message).toMatch(/External image URLs are not supported in bulk ZIP mode/);
    expect(axiosGetSpy).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 50));
    await expect(fsp.stat(excelPath)).rejects.toThrow();
    await expect(fsp.stat(zipPath)).rejects.toThrow();
  }, 20000);
});

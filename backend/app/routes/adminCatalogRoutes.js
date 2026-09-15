import express from "express";
import os from "os";
import {
    getMasterProducts,
    addMasterProduct,
    updateMasterProduct,
    deleteMasterProduct,
    bulkImportMasterProducts,
    getImportTemplate,
    getCatalogImportStatus,
    getImageManifest
} from "../controllers/adminCatalogController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Bulk Listing's Excel + ZIP upload is routed to disk (not memory) so a
// large ZIP (thousands of images) is never buffered into process RAM.
const BULK_IMPORT_MAX_ZIP_BYTES = parseInt(
    process.env.BULK_IMPORT_MAX_ZIP_BYTES || String(500 * 1024 * 1024), // 500MB
    10,
);
const bulkImportUpload = multer({
    storage: multer.diskStorage({ destination: os.tmpdir() }),
    limits: { fileSize: BULK_IMPORT_MAX_ZIP_BYTES },
});

const router = express.Router();

// All routes here should be protected and restricted to admin/product roles
router.use(verifyToken);
router.use(allowRoles("admin", "superadmin", "product"));

router.get("/", getMasterProducts);
router.post("/", upload.fields([{ name: 'mainImage', maxCount: 1 }, { name: 'galleryImages', maxCount: 5 }]), addMasterProduct);
router.put("/:id", upload.fields([{ name: 'mainImage', maxCount: 1 }, { name: 'galleryImages', maxCount: 5 }]), updateMasterProduct);
router.delete("/:id", allowRoles("admin", "superadmin"), deleteMasterProduct);

// Bulk Import Excel + Images ZIP (both mandatory — see bulkImportMasterProducts)
router.get("/template", getImportTemplate);
router.post(
    "/import",
    bulkImportUpload.fields([
        { name: "excelFile", maxCount: 1 },
        { name: "imagesZip", maxCount: 1 },
    ]),
    bulkImportMasterProducts,
);
router.get("/import/status/:taskId", getCatalogImportStatus);
router.post("/import/image-manifest", upload.single("excelFile"), getImageManifest);

export default router;


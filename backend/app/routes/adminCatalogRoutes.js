import express from "express";
import { 
    getMasterProducts, 
    addMasterProduct, 
    updateMasterProduct,
    deleteMasterProduct,
    bulkImportMasterProducts,
    getImportTemplate,
    getCatalogImportStatus
} from "../controllers/adminCatalogController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({ storage });

const router = express.Router();

// All routes here should be protected and restricted to admin/product roles
router.use(verifyToken);
router.use(allowRoles("admin", "superadmin", "product"));

router.get("/", getMasterProducts);
router.post("/", upload.fields([{ name: 'mainImage', maxCount: 1 }, { name: 'galleryImages', maxCount: 5 }]), addMasterProduct);
router.put("/:id", upload.fields([{ name: 'mainImage', maxCount: 1 }, { name: 'galleryImages', maxCount: 5 }]), updateMasterProduct);
router.delete("/:id", allowRoles("admin", "superadmin"), deleteMasterProduct);

// Bulk Import Excel
router.get("/template", getImportTemplate);
router.post("/import", upload.single("excelFile"), bulkImportMasterProducts);
router.get("/import/status/:taskId", getCatalogImportStatus);

export default router;


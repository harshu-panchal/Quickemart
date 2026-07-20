import express from "express";
import {
    getProducts,
    getSellerProducts,
    createProduct,
    createSellerListing,
    updateProduct,
    deleteProduct,
    getProductById,
    getModerationProducts,
    approveProduct,
    rejectProduct,
    bulkImportProducts,
    generateBulkTemplate,
    getCatalogBrands,
    getCatalogProducts
} from "../controller/productController.js";
import { adjustStock, getStockHistory } from "../controller/stockController.js";
import {
    verifyToken,
    allowRoles,
    optionalVerifyToken,
    requireApprovedSeller,
} from "../middleware/authMiddleware.js";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({ storage });

const router = express.Router();

// Public routes with optional auth (to detect admin/seller vs customer)
router.get("/", optionalVerifyToken, getProducts);
router.get("/bulk/template", generateBulkTemplate);

// Seller protected routes
router.get("/seller/me", verifyToken, allowRoles("seller"), requireApprovedSeller, getSellerProducts);
router.get("/stock-history", verifyToken, allowRoles("seller"), requireApprovedSeller, getStockHistory);
router.post("/adjust-stock", verifyToken, allowRoles("seller"), requireApprovedSeller, adjustStock);
router.post("/bulk", verifyToken, allowRoles("seller"), requireApprovedSeller, bulkImportProducts);
router.get("/moderation", verifyToken, allowRoles("admin"), getModerationProducts);
router.patch("/moderation/:id/approve", verifyToken, allowRoles("admin"), approveProduct);
router.patch("/moderation/:id/reject", verifyToken, allowRoles("admin"), rejectProduct);

// Catalog selection routes for sellers
router.get("/catalog/brands", verifyToken, allowRoles("seller", "admin"), getCatalogBrands);
router.get("/catalog/products", verifyToken, allowRoles("seller", "admin"), getCatalogProducts);

router.get("/:id", optionalVerifyToken, getProductById);

// Admin-only: create full product (master catalog item with all metadata)
router.post(
    "/",
    verifyToken,
    allowRoles("admin"),
    upload.any(),
    createProduct
);

// Seller-only: list a master catalog product with price + stock
router.post(
    "/seller/listings",
    verifyToken,
    allowRoles("seller"),
    requireApprovedSeller,
    createSellerListing
);

router.put(
    "/:id",
    verifyToken,
    allowRoles("seller", "admin"),
    requireApprovedSeller,
    upload.any(),
    updateProduct
);

router.delete(
    "/:id",
    verifyToken,
    allowRoles("seller", "admin"),
    requireApprovedSeller,
    deleteProduct
);

export default router;

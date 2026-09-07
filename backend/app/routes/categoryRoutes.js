import express from "express";
import {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
} from "../controller/categoryController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({ storage });

const router = express.Router();

// Public route to get categories
router.get("/", getCategories);

// Admin and Product Manager routes
router.post(
    "/",
    verifyToken,
    allowRoles("admin", "product"),
    upload.single("image"),
    createCategory
);

router.put(
    "/:id",
    verifyToken,
    allowRoles("admin", "product"),
    upload.single("image"),
    updateCategory
);

router.delete(
    "/:id",
    verifyToken,
    allowRoles("admin", "product"),
    deleteCategory
);

export default router;

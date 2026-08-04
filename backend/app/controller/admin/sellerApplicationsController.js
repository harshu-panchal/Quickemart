import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import {
  approveSellerApplicationById,
  getPendingSellerApplications,
  rejectSellerApplicationById,
} from "../../services/admin/sellerApplicationService.js";
import Seller from "../../models/seller.js";
import { uploadToCloudinary } from "../../services/mediaService.js";

export const getPendingSellers = async (req, res) => {
  try {
    const { q = "", status = "pending" } = req.query;
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 100,
    });

    const data = await getPendingSellerApplications({
      q,
      status,
      page,
      limit,
      skip,
    });

    return handleResponse(res, 200, "Pending seller applications fetched", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const approveSellerApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const seller = await approveSellerApplicationById({
      sellerId: id,
      reviewedBy: req.user.id,
    });

    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    return handleResponse(res, 200, "Seller approved successfully", seller);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const rejectSellerApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const seller = await rejectSellerApplicationById({
      sellerId: id,
      reviewedBy: req.user.id,
      reason,
    });

    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    return handleResponse(res, 200, "Seller application rejected", seller);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* -------------------------------------------------------
   ADMIN: Create seller directly (bypasses OTP & approval)
------------------------------------------------------- */
const DOCUMENT_FIELDS = ["tradeLicense", "gstCertificate", "idProof"];

const generateSellerId = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "SLR-";
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
};

export const adminCreateSeller = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      shopName,
      password,
      address,
      locality,
      city,
      state,
      pincode,
      lat,
      lng,
      radius,
      category,
    } = req.body || {};

    // --- Validation ---
    if (!name || !email || !phone || !shopName || !password) {
      return handleResponse(res, 400, "Name, email, phone number, shop name and password are required");
    }

    if (password.length < 6) {
      return handleResponse(res, 400, "Password must be at least 6 characters");
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await Seller.findOne({ email: normalizedEmail });
    if (existing) {
      return handleResponse(res, 409, "A seller with this email already exists");
    }

    const normalizedPhone = String(phone).trim();
    if (!/^[0-9]{10}$/.test(normalizedPhone)) {
      return handleResponse(res, 400, "A valid 10-digit phone number is required");
    }

    const existingPhone = await Seller.findOne({ phone: normalizedPhone });
    if (existingPhone) {
      return handleResponse(res, 409, "A seller with this phone number already exists");
    }

    // --- Generate unique sellerId ---
    let sellerId;
    let attempts = 0;
    do {
      sellerId = generateSellerId();
      attempts++;
      // Avoid infinite loop on collision (extremely unlikely)
      if (attempts > 20) break;
    } while (await Seller.findOne({ sellerId }));

    // --- Handle optional document uploads ---
    const documentFiles = req.files || [];
    const uploadedDocs = {};

    if (Array.isArray(documentFiles) && documentFiles.length > 0) {
      for (const file of documentFiles) {
        try {
          if (file.fieldname && DOCUMENT_FIELDS.includes(file.fieldname)) {
            const url = await uploadToCloudinary(file.buffer, "docs", {
              mimeType: file.mimetype,
            });
            uploadedDocs[file.fieldname] = url;
          }
        } catch (err) {
          console.error("Failed to upload document:", err.message);
        }
      }
    }

    // --- Parse coordinates ---
    const parsedLat = lat !== undefined ? Number(lat) : undefined;
    const parsedLng = lng !== undefined ? Number(lng) : undefined;
    const parsedRadius = radius !== undefined ? Number(radius) : 5;

    // --- Build seller data ---
    const sellerData = {
      sellerId,
      name: name.trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      password,
      shopName: shopName.trim(),
      category: category?.trim() || "General",
      address: address?.trim() || "",
      locality: locality?.trim() || "",
      city: city?.trim() || "",
      state: state?.trim() || "",
      pincode: pincode?.trim() || "",
      documents: Object.keys(uploadedDocs).length > 0 ? uploadedDocs : undefined,
      applicationStatus: "approved",
      isVerified: true,
      isActive: true,
      emailVerified: true,
      phoneVerified: true,
      reviewedBy: req.user?.id,
      reviewedAt: new Date(),
    };

    if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
      sellerData.location = {
        type: "Point",
        coordinates: [parsedLng, parsedLat],
      };
    }

    if (Number.isFinite(parsedRadius) && parsedRadius >= 1 && parsedRadius <= 100) {
      sellerData.serviceRadius = parsedRadius;
    }

    const seller = await Seller.create(sellerData);

    return handleResponse(res, 201, "Seller created successfully", {
      seller,
      sellerId,
      message: "Seller can now log in to the seller portal using the provided email and password.",
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};


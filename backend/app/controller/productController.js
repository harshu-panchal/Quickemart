import mongoose from "mongoose";
import Product from "../models/product.js";
import MasterProduct from "../models/masterProduct.js";
import Category from "../models/category.js";
import { syncUnlinkedSellerProductsToMasterCatalog } from "../controllers/adminCatalogController.js";
import { calculateCustomerDisplayPrice } from "../services/finance/pricingService.js";
import ExcelJS from "exceljs";
import Order from "../models/order.js";
import Review from "../models/review.js";
import { handleResponse } from "../utils/helper.js";
import { slugify } from "../utils/slugify.js";
import getPagination from "../utils/pagination.js";
import Admin from "../models/admin.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";

async function getAdminIds() {
  const admins = await Admin.find().select("_id").lean();
  return (admins || []).map((a) => a?._id).filter(Boolean);
}
import {
  parseCustomerCoordinates,
  getNearbySellerIdsForCustomer,
} from "../services/customerVisibilityService.js";
import {
  enqueueProductIndex,
  enqueueProductRemoval,
} from "../services/searchSyncService.js";
import { buildKey, getOrSet, getTTL, invalidate } from "../services/cacheService.js";
import { uploadToCloudinary } from "../services/mediaService.js";
import logger from "../services/logger.js";
import { deleteUploadedFile } from "../utils/localStorage.js";
import { resolveCategoryName, resolveSellerName } from "../services/entityNameCache.js";
import {
  PRODUCT_APPROVAL_STATUS,
  getProductApprovalConfig,
  getApprovedOrLegacyFilter,
  buildApprovalStatusFilter,
  normalizeProductModerationFields,
  sanitizeApprovalNote,
  resolveProductApprovalStatus,
} from "../services/productModerationService.js";
import { buildSearchRegex } from "../utils/regex.js";

// Phase 3 P3-5: when search term is reasonably specific and the env flag
// is enabled, prefer Mongo's `name + tags` text index over case-insensitive
// regex. Default OFF — keeps existing substring-search semantics so the
// behavior of the customer-facing search bar is unchanged unless explicitly
// opted in by ops.
function isProductTextSearchEnabled() {
  return (
    String(process.env.PRODUCT_SEARCH_USE_TEXT || "false").toLowerCase() === "true"
  );
}

function buildProductListKey(queryParams) {
  const sorted = Object.keys(queryParams)
    .sort()
    .reduce((acc, k) => {
      acc[k] = String(queryParams[k] ?? "").trim().toLowerCase();
      return acc;
    }, {});
  return buildKey("catalog", "productList", JSON.stringify(sorted));
}

function isCustomerVisibilityRequest(req) {
  const role = String(req.user?.role || "").toLowerCase();
  // Admin and seller should not be subject to location filtering
  return !role || (role !== "admin" && role !== "seller" && role !== "delivery");
}

function parseSellerIdFilters({ sellerId, sellerIds }) {
  if (typeof sellerIds === "string" && sellerIds.trim()) {
    return sellerIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .map(String);
  }

  if (sellerId) {
    return [String(sellerId)];
  }

  return [];
}

function makeProductSku(name, index = 1) {
  const prefix = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5) || "item";
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${String(index).padStart(2, "0")}-${randomSuffix}`;
}

function parseJsonIfString(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function normalizeUrl(value) {
  const normalized = String(value || "").trim();
  if (!/^https?:\/\//i.test(normalized)) return "";
  return normalized;
}

function parseImageList(input) {
  const candidate = parseJsonIfString(input);
  if (Array.isArray(candidate)) {
    return candidate.map((item) => normalizeUrl(item)).filter(Boolean);
  }
  if (typeof candidate === "string" && candidate.includes(",")) {
    return candidate
      .split(",")
      .map((item) => normalizeUrl(item))
      .filter(Boolean);
  }
  const single = normalizeUrl(candidate);
  return single ? [single] : [];
}

function applyMediaFields(productData) {
  const explicitMainImage = normalizeUrl(productData.mainImage || productData.mainImageUrl);
  const galleryImages = parseImageList(productData.galleryImages);
  const genericImages = parseImageList(productData.images);

  const mergedGallery = [...galleryImages, ...genericImages].filter(Boolean);
  if (explicitMainImage) {
    productData.mainImage = explicitMainImage;
  } else if (mergedGallery.length > 0) {
    productData.mainImage = mergedGallery[0];
    mergedGallery.shift();
    if (Array.isArray(productData.galleryLabels) && productData.galleryLabels.length > 0) {
      productData.galleryLabels.shift();
    }
  } else {
    delete productData.mainImage;
  }

  if (mergedGallery.length > 0) {
    productData.galleryImages = mergedGallery;
  } else if (!Array.isArray(productData.galleryImages)) {
    productData.galleryImages = [];
  }
}

const RESTRICTED_MODERATION_FIELDS = [
  "approvalStatus",
  "approvalRequestedAt",
  "approvalReviewedAt",
  "approvalReviewedBy",
  "approvalNote",
  "lastSubmittedByRole",
];

function stripRestrictedModerationFields(payload = {}) {
  for (const field of RESTRICTED_MODERATION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      delete payload[field];
    }
  }
}

function normalizeProductDocumentModeration(product) {
  if (!product) return product;
  return normalizeProductModerationFields(product);
}

function normalizeProductListModeration(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => normalizeProductDocumentModeration(item));
}

function buildSellerPendingModerationUpdate() {
  return {
    approvalStatus: PRODUCT_APPROVAL_STATUS.PENDING,
    approvalRequestedAt: new Date(),
    approvalReviewedAt: null,
    approvalReviewedBy: null,
    approvalNote: "",
    lastSubmittedByRole: "seller",
  };
}

function buildSellerApprovedModerationUpdate() {
  return {
    approvalStatus: PRODUCT_APPROVAL_STATUS.APPROVED,
    approvalRequestedAt: null,
    approvalReviewedAt: null,
    approvalReviewedBy: null,
    approvalNote: "",
    lastSubmittedByRole: "seller",
  };
}

function buildAdminApprovedModerationUpdate(adminId, note = "") {
  return {
    approvalStatus: PRODUCT_APPROVAL_STATUS.APPROVED,
    approvalRequestedAt: null,
    approvalReviewedAt: new Date(),
    approvalReviewedBy: adminId || null,
    approvalNote: sanitizeApprovalNote(note),
    lastSubmittedByRole: "admin",
  };
}

function buildAdminRejectedModerationUpdate(adminId, note = "") {
  return {
    approvalStatus: PRODUCT_APPROVAL_STATUS.REJECTED,
    approvalRequestedAt: null,
    approvalReviewedAt: new Date(),
    approvalReviewedBy: adminId || null,
    approvalNote: sanitizeApprovalNote(note),
    lastSubmittedByRole: "admin",
  };
}

/* ===============================
   GET ALL PRODUCTS (Public/Admin)
================================ */
export const getProducts = async (req, res) => {
  try {
    const {
      search,
      category,
      subcategory,
      header,
      status,
      approvalStatus,
      sellerId,
      featured,
      categoryId,
      subcategoryId,
      headerId,
      categoryIds,
      sellerIds,
      sort,
      lat,
      lng,
    } = req.query;
    const enforceRadius = isCustomerVisibilityRequest(req);

    const query = {};
    if (search) {
      const term = String(search).trim();
      if (term) {
        if (isProductTextSearchEnabled() && term.length >= 3) {
          query.$text = { $search: term };
        } else {
          // P3-5: substring search is preserved (so customer-facing UX
          // doesn't shift) but the term is now regex-escaped to avoid
          // injection and runtime errors on `(`, `*`, etc.
          query.name = buildSearchRegex(term, { anchored: false });
        }
      }
    }

    // Support both field names for flexibility (backward compatibility)
    const finalHeaderId = header || headerId;
    const finalCategoryId = category || categoryId;
    const finalSubcategoryId = subcategory || subcategoryId;

    const providedLevels = [finalHeaderId, finalCategoryId, finalSubcategoryId].filter(
      (v) => v && v !== "all",
    );

    if (providedLevels.length > 1) {
      // Multiple distinct levels explicitly provided together -> exact AND match
      // (used by admin-style filtering where header/category/subcategory are all known).
      if (finalHeaderId && finalHeaderId !== "all") query.headerId = finalHeaderId;
      if (finalCategoryId && finalCategoryId !== "all") query.categoryId = finalCategoryId;
      if (finalSubcategoryId && finalSubcategoryId !== "all") query.subcategoryId = finalSubcategoryId;
    } else if (providedLevels.length === 1) {
      // A single, level-ambiguous category id (e.g. from a customer nav link) -> match it
      // against whichever hierarchy field the product was actually assigned to.
      const singleId = providedLevels[0];
      query.$or = [
        { headerId: singleId },
        { categoryId: singleId },
        { subcategoryId: singleId },
      ];
    }

    const requestedSellerIds = parseSellerIdFilters({ sellerId, sellerIds });
    const coords = parseCustomerCoordinates({ lat, lng });
    const shouldApplyLocationFilter = enforceRadius || coords.valid;
    if (enforceRadius && !coords.valid) {
      return handleResponse(
        res,
        400,
        "lat and lng are required for customer product visibility",
      );
    }

    let nearbySellerIds = [];
    if (shouldApplyLocationFilter && coords.valid) {
      nearbySellerIds = await getNearbySellerIdsForCustomer(
        coords.lat,
        coords.lng,
      );

      // If user explicitly requested a specific sellerId, enforce location radius check on that seller
      if (requestedSellerIds.length > 0) {
        const nearbySet = new Set(nearbySellerIds.map(String));
        const finalSellerIds = requestedSellerIds.filter((id) => nearbySet.has(String(id)));
        if (!finalSellerIds.length) {
          return handleResponse(res, 200, "No products available in your area", {
            items: [],
            page: 1,
            limit: 24,
            total: 0,
            totalPages: 1,
          });
        }
        query.sellerId = { $in: finalSellerIds };
      }
    }

    if (categoryIds && typeof categoryIds === "string") {
      const ids = categoryIds
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id && id !== "all");
      if (ids.length) query.categoryId = { $in: ids };
    }
    // Multiple sellers: sellerIds=id1,id2 (or single sellerId)
    if (!query.sellerId) {
      if (sellerIds && typeof sellerIds === "string") {
        const ids = sellerIds
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id && id !== "all");
        if (ids.length) query.sellerId = { $in: ids };
      } else if (sellerId) {
        query.sellerId = sellerId;
      }
    }

    if (featured !== undefined) query.isFeatured = featured === "true";

    let finalQuery = { ...query };
    if (enforceRadius) {
      finalQuery.status = "active";
      finalQuery = { $and: [finalQuery, getApprovedOrLegacyFilter()] };
    } else {
      if (status && status !== "all") {
        finalQuery.status = status;
      }
      if (approvalStatus && String(approvalStatus).trim().toLowerCase() !== "all") {
        const moderationFilter = buildApprovalStatusFilter(approvalStatus);
        if (Object.keys(moderationFilter).length > 0) {
          finalQuery = { $and: [finalQuery, moderationFilter] };
        }
      }
    }

    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 24,
      maxLimit: 100,
    });

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      "name-asc": { name: 1, createdAt: -1 },
      "name-desc": { name: -1, createdAt: -1 },
      "price-asc": { price: 1, createdAt: -1 },
      "price-desc": { price: -1, createdAt: -1 },
      "stock-asc": { stock: 1, createdAt: -1 },
      "stock-desc": { stock: -1, createdAt: -1 },
    };
    const sortQuery = sortMap[String(sort || "newest").toLowerCase()] || sortMap.newest;

    const fetchFn = async () => {
      const [rawProducts, total] = await Promise.all([
        Product.find(finalQuery)
          .select(
            "name slug description sku price salePrice stock brand weight mainImage galleryImages headerId categoryId subcategoryId sellerId status approvalStatus approvalRequestedAt approvalReviewedAt approvalReviewedBy approvalNote lastSubmittedByRole isFeatured variants createdAt masterProductId",
          )
          // No .populate() — names resolved via cache-backed entityNameCache
          .sort(sortQuery)
          .skip(skip)
          .limit(limit)
          .lean(),
        Product.countDocuments(finalQuery),
      ]);

      // Query Master Catalog products that have no seller offers listed in this area/query
      let masterProducts = [];
      try {
        const masterQuery = { status: { $ne: 'deleted' } };
        if (query.$or) {
          masterQuery.$or = query.$or;
        } else {
          if (query.headerId) masterQuery.headerId = query.headerId;
          if (query.categoryId) masterQuery.categoryId = query.categoryId;
          if (query.subcategoryId) masterQuery.subcategoryId = query.subcategoryId;
        }
        if (query.name) masterQuery.name = query.name;
        if (query.$text) masterQuery.$text = query.$text;

        const existingMasterIds = new Set(
          rawProducts.map((p) => (p.masterProductId ? String(p.masterProductId) : null)).filter(Boolean)
        );
        const existingSlugs = new Set(rawProducts.map(p => p.slug));
        const existingNames = new Set(rawProducts.map(p => String(p.name || '').toLowerCase()));

        const allMaster = await MasterProduct.find(masterQuery).lean();

        masterProducts = allMaster
          .filter(
            (mp) =>
              !existingMasterIds.has(String(mp._id)) &&
              !existingSlugs.has(mp.slug) &&
              !existingNames.has(String(mp.name || '').toLowerCase())
          )
          .map(mp => ({
            _id: mp._id,
            name: mp.name,
            slug: mp.slug,
            description: mp.description || '',
            sku: mp.sku || '',
            price: 0,
            salePrice: 0,
            stock: 0,
            brand: mp.brand || '',
            weight: mp.packSize || '',
            mainImage: mp.mainImage || '',
            galleryImages: mp.galleryImages || [],
            headerId: mp.headerId,
            categoryId: mp.categoryId,
            subcategoryId: mp.subcategoryId,
            sellerId: null,
            status: 'active',
            approvalStatus: 'approved',
            isFeatured: false,
            variants: (mp.variants || []).map(v => ({ ...v, price: 0, salePrice: 0, stock: 0 })),
            createdAt: mp.createdAt,
            isMasterProduct: true,
            isOutOfStock: true
          }));
      } catch (err) {
        logger.error("Failed to query master products for customer view", { error: err });
      }

      const combinedRaw = [...rawProducts, ...masterProducts];
      const combinedTotal = total + masterProducts.length;

      // Collect unique category IDs (headerId, categoryId, subcategoryId) and seller IDs
      const categoryIdSet = new Set();
      const sellerIdSet = new Set();
      for (const p of combinedRaw) {
        if (p.headerId) categoryIdSet.add(String(p.headerId));
        if (p.categoryId) categoryIdSet.add(String(p.categoryId));
        if (p.subcategoryId) categoryIdSet.add(String(p.subcategoryId));
        if (p.sellerId) sellerIdSet.add(String(p.sellerId));
      }

      // Resolve names in parallel via cache-backed service
      const [categoryEntries, sellerEntries] = await Promise.all([
        Promise.all(
          [...categoryIdSet].map(async (id) => [id, await resolveCategoryName(id)]),
        ),
        Promise.all(
          [...sellerIdSet].map(async (id) => [id, await resolveSellerName(id)]),
        ),
      ]);

      const nameMap = Object.fromEntries([...categoryEntries, ...sellerEntries]);

      const categoryDocs = await Category.find({ _id: { $in: Array.from(categoryIdSet) } })
        .select("_id name adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule handlingFees handlingFeeType handlingFeeValue")
        .lean();
      const categoryMap = new Map(categoryDocs.map(c => [String(c._id), c]));

      const nearbySellerSet = new Set((nearbySellerIds || []).map(String));

      const products = combinedRaw.map((p) => {
        const pSellerId = p.sellerId ? String(p.sellerId._id || p.sellerId) : null;
        let isAvailable = false;
        let effectiveStock = Number(p.stock || 0);
        let effectivePrice = Number(p.price || 0);
        let effectiveSalePrice = Number(p.salePrice || 0);
        let activeSellerObj = p.sellerId;

        if (shouldApplyLocationFilter) {
          if (pSellerId && nearbySellerSet.has(pSellerId) && effectiveStock > 0) {
            isAvailable = true;
          } else {
            // Check if there is another seller in nearbySellerSet providing this master product / SKU
            const masterIdStr = p.masterProductId ? String(p.masterProductId) : String(p._id);
            const nearbyOffer = rawProducts.find((other) => {
              const otherSellerId = String(other.sellerId?._id || other.sellerId || '');
              const otherMasterId = other.masterProductId ? String(other.masterProductId) : String(other._id);
              return nearbySellerSet.has(otherSellerId) && Number(other.stock || 0) > 0 && (otherMasterId === masterIdStr || other.sku === p.sku);
            });

            if (nearbyOffer) {
              isAvailable = true;
              effectiveStock = Number(nearbyOffer.stock || 0);
              effectivePrice = Number(nearbyOffer.price || 0);
              effectiveSalePrice = Number(nearbyOffer.salePrice || 0);
              activeSellerObj = nearbyOffer.sellerId;
            } else {
              isAvailable = false;
              effectiveStock = 0;
            }
          }
        } else {
          isAvailable = effectiveStock > 0;
        }

        const enriched = {
          ...p,
          stock: effectiveStock,
          price: effectivePrice,
          salePrice: effectiveSalePrice,
          isAvailableInLocation: isAvailable,
          isOutOfStock: !isAvailable || effectiveStock <= 0,
          inStock: isAvailable && effectiveStock > 0,
          headerId: p.headerId
            ? { _id: p.headerId, name: nameMap[String(p.headerId)] ?? null }
            : null,
          categoryId: p.categoryId
            ? { _id: p.categoryId, name: nameMap[String(p.categoryId)] ?? null }
            : null,
          subcategoryId: p.subcategoryId
            ? { _id: p.subcategoryId, name: nameMap[String(p.subcategoryId)] ?? null }
            : null,
          sellerId: activeSellerObj
            ? (typeof activeSellerObj === 'object' ? activeSellerObj : { _id: activeSellerObj, shopName: nameMap[String(activeSellerObj)] ?? null })
            : null,
        };

        const headerIdStr = String(p.headerId?._id || p.headerId || '');
        const catIdStr = String(p.categoryId?._id || p.categoryId || '');
        const catConfig = categoryMap.get(headerIdStr) || categoryMap.get(catIdStr) || null;

        const rawSale = Number(enriched.salePrice || enriched.price || 0);
        const rawReg = Number(enriched.price || enriched.salePrice || 0);

        const saleDisplay = calculateCustomerDisplayPrice(rawSale, catConfig).customerDisplayPrice;
        const regDisplay = calculateCustomerDisplayPrice(rawReg, catConfig).customerDisplayPrice;

        const updatedVariants = (p.variants || []).map((v) => {
          const vSale = Number(v.salePrice || v.price || 0);
          const vReg = Number(v.price || v.salePrice || 0);
          const vSaleDisplay = calculateCustomerDisplayPrice(vSale, catConfig).customerDisplayPrice;
          const vRegDisplay = calculateCustomerDisplayPrice(vReg, catConfig).customerDisplayPrice;
          return {
            ...v,
            sellerBasePrice: vSale,
            salePrice: vSaleDisplay,
            price: vRegDisplay,
            stock: isAvailable ? Number(v.stock || 0) : 0,
          };
        });

        return {
          ...enriched,
          sellerBasePrice: rawSale,
          salePrice: saleDisplay,
          price: regDisplay,
          variants: updatedVariants,
        };
      });

      return {
        items: normalizeProductListModeration(products),
        page,
        limit,
        total: combinedTotal,
        totalPages: Math.ceil(combinedTotal / limit) || 1,
      };
    };

    const role = String(req.user?.role || "").toLowerCase();
    const shouldCache = !role || (role !== "admin" && role !== "seller");

    const result = shouldCache
      ? await getOrSet(buildProductListKey(req.query), fetchFn, getTTL("productList"))
      : await fetchFn();

    return handleResponse(res, 200, "Products fetched successfully", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET SELLER PRODUCTS
================================ */
export const getSellerProducts = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { stockStatus, sort, approvalStatus } = req.query;
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const baseSellerQuery = { sellerId };
    const query = { ...baseSellerQuery };
    if (stockStatus === "in") {
      query.$or = [{ stock: { $gt: 0 } }, { "variants.stock": { $gt: 0 } }];
    } else if (stockStatus === "out") {
      query.stock = { $lte: 0 };
    }

    if (approvalStatus && String(approvalStatus).trim().toLowerCase() !== "all") {
      const approvalFilter = buildApprovalStatusFilter(approvalStatus);
      if (Object.keys(approvalFilter).length > 0) {
        Object.assign(query, approvalFilter);
      }
    }

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      "name-asc": { name: 1, createdAt: -1 },
      "name-desc": { name: -1, createdAt: -1 },
      "price-asc": { price: 1, createdAt: -1 },
      "price-desc": { price: -1, createdAt: -1 },
      "stock-asc": { stock: 1, createdAt: -1 },
      "stock-desc": { stock: -1, createdAt: -1 },
    };
    const sortQuery = sortMap[String(sort || "newest").toLowerCase()] || sortMap.newest;

    const [
      products,
      total,
      totalAll,
      activeCount,
      lowStockCount,
      outOfStockCount,
      pendingCount,
      approvedCount,
      rejectedCount,
    ] = await Promise.all([
      Product.find(query)
        .select(
          "name slug description sku price salePrice stock lowStockAlert brand weight mainImage galleryImages headerId categoryId subcategoryId sellerId status approvalStatus approvalRequestedAt approvalReviewedAt approvalReviewedBy approvalNote lastSubmittedByRole isFeatured variants createdAt masterProductId",
        )
        .populate("headerId", "name")
        .populate("categoryId", "name")
        .populate("subcategoryId", "name")
        .populate("sellerId", "shopName")
        .sort(sortQuery)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(query),
      Product.countDocuments(baseSellerQuery),
      Product.countDocuments({ ...baseSellerQuery, status: "active" }),
      Product.countDocuments({
        ...baseSellerQuery,
        $expr: {
          $and: [
            {
              $gt: [
                {
                  $convert: {
                    input: "$stock",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                0,
              ],
            },
            {
              $lte: [
                {
                  $convert: {
                    input: "$stock",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                {
                  $let: {
                    vars: {
                      rawThreshold: {
                        $convert: {
                          input: "$lowStockAlert",
                          to: "double",
                          onError: 0,
                          onNull: 0,
                        },
                      },
                    },
                    in: {
                      $cond: [{ $gt: ["$$rawThreshold", 0] }, "$$rawThreshold", 5],
                    },
                  },
                },
              ],
            },
          ],
        },
      }),
      Product.countDocuments({ ...baseSellerQuery, stock: 0 }),
      Product.countDocuments({
        ...baseSellerQuery,
        approvalStatus: PRODUCT_APPROVAL_STATUS.PENDING,
      }),
      Product.countDocuments({
        ...baseSellerQuery,
        $and: [
          { ...baseSellerQuery },
          buildApprovalStatusFilter(PRODUCT_APPROVAL_STATUS.APPROVED),
        ],
      }),
      Product.countDocuments({
        ...baseSellerQuery,
        approvalStatus: PRODUCT_APPROVAL_STATUS.REJECTED,
      }),
    ]);

    // Mark each product with listing metadata
    const listedProducts = normalizeProductListModeration(products).map((p) => ({
      ...p,
      isListedBySeller: true,
      isLegacyProduct: !p.masterProductId, // true = old seller-created, false = catalog-linked
    }));

    return handleResponse(res, 200, "Seller products fetched", {
      items: listedProducts,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      summary: {
        total: totalAll,
        active: activeCount,
        lowStock: lowStockCount,
        outOfStock: outOfStockCount,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   CREATE SELLER LISTING
   (Seller picks a master catalog product,
    provides price + stock per variant)
================================ */
export const createSellerListing = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { masterProductId, variants: variantsRaw, status } = req.body;

    if (!masterProductId) {
      return handleResponse(res, 400, "masterProductId is required");
    }

    // Load the master product for metadata
    const master = await MasterProduct.findById(masterProductId).lean();
    if (!master) {
      return handleResponse(res, 404, "Master product not found");
    }

    // Parse variants if sent as string (FormData)
    let variants = variantsRaw;
    if (typeof variants === "string") {
      try {
        variants = JSON.parse(variants);
      } catch {
        variants = [];
      }
    }
    if (!Array.isArray(variants) || variants.length === 0) {
      return handleResponse(res, 400, "At least one variant with price and stock is required");
    }

    // Validate each variant has a price
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      if (!v.price || Number(v.price) <= 0) {
        return handleResponse(res, 400, `Variant "${v.name || i + 1}" must have a valid price`);
      }
      if (v.stock === undefined || v.stock === "" || Number(v.stock) < 0) {
        return handleResponse(res, 400, `Variant "${v.name || i + 1}" must have a stock value`);
      }
    }

    // Normalize variants: merge master metadata with seller's price/stock
    const normalizedVariants = variants.map((v, idx) => ({
      name: v.name || master.variants?.[idx]?.name || `Variant ${idx + 1}`,
      price: Number(v.price),
      salePrice: Number(v.salePrice || 0),
      stock: Number(v.stock),
      sku: v.sku || `${master.slug}-${(v.name || idx + 1).toString().toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    }));

    // Auto-calculate root stock and price from variants
    const totalStock = normalizedVariants.reduce((sum, v) => sum + v.stock, 0);
    const rootStock = Math.max(Number(0), totalStock);
    const rootPrice = normalizedVariants[0].price;
    const rootSalePrice = normalizedVariants[0].salePrice || 0;

    // Build unique slug for this seller listing
    let baseSlug = `${master.slug}-${String(sellerId).slice(-6)}`;
    let finalSlug = baseSlug;
    let slugExists = await Product.exists({ slug: finalSlug });
    let attempts = 0;
    while (slugExists && attempts < 10) {
      attempts++;
      finalSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 5)}`;
      slugExists = await Product.exists({ slug: finalSlug });
    }

    // Build unique SKU for this listing
    const rawSku = master.sku ? `${master.sku}-${String(sellerId).slice(-4)}` : makeProductSku(master.name, 1);
    let finalSku = rawSku;
    let skuExists = await Product.exists({ sku: finalSku });
    attempts = 0;
    while (skuExists && attempts < 10) {
      attempts++;
      finalSku = `${rawSku}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      skuExists = await Product.exists({ sku: finalSku });
    }

    // Determine approval status
    let moderationUpdate = {};
    const approvalConfig = await getProductApprovalConfig();
    if (approvalConfig.sellerCreateRequiresApproval) {
      moderationUpdate = buildSellerPendingModerationUpdate();
    } else {
      moderationUpdate = buildSellerApprovedModerationUpdate();
    }

    // Create the product listing using master catalog metadata + seller's price/stock
    const newProduct = await Product.create({
      masterProductId: master._id,
      sellerId,
      name: master.name,
      slug: finalSlug,
      sku: finalSku,
      description: master.description || "",
      brand: master.brand || "App",
      weight: master.packSize || master.unit || "",
      mainImage: master.mainImage || "",
      galleryImages: master.galleryImages || [],
      galleryLabels: master.galleryLabels || [],
      tags: master.searchTags || [],
      headerId: master.headerId,
      categoryId: master.categoryId,
      subcategoryId: master.subcategoryId || undefined,
      price: rootPrice,
      salePrice: rootSalePrice,
      stock: rootStock,
      variants: normalizedVariants,
      gstTax: master.gstTax || 0,
      status: status || "active",
      ...moderationUpdate,
    });

    // Invalidate cache comprehensively for master product, new listing, product lists, and nearby sellers
    await invalidate(`cache:catalog:product:${master._id.toString()}`);
    if (master.slug) {
      await invalidate(`cache:catalog:product:slug-${master.slug.toLowerCase()}`);
    }
    await invalidate(`cache:catalog:product:${newProduct._id.toString()}`);
    if (newProduct.slug) {
      await invalidate(`cache:catalog:product:slug-${newProduct.slug.toLowerCase()}`);
    }
    await invalidate("cache:catalog:productList:*");
    await invalidate(buildKey("catalog", "productList", "*"));
    await invalidate("cache:sellers:nearby:*");
    await invalidate(buildKey("sellers", "nearby", "*"));

    const approvalStatus = newProduct.approvalStatus;
    const message = approvalStatus === "pending"
      ? "Product submitted for admin approval"
      : "Product listed successfully";

    return handleResponse(res, 201, message, normalizeProductDocumentModeration(newProduct.toObject()));
  } catch (error) {
    logger.error("createSellerListing error", { error });
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   CREATE PRODUCT
================================ */
export const createProduct = async (req, res) => {

  try {
    const role = String(req.user?.role || "").toLowerCase();
    const productData = { ...req.body };
    stripRestrictedModerationFields(productData);

    if (role === "admin") {
      if (!productData.sellerId) {
        return handleResponse(res, 400, "sellerId is required for admin-created products");
      }
    } else {
      productData.sellerId = req.user.id;
    }

    // Handle multipart files (mainImage and galleryImages)
    const files = req.files || [];
    if (files.length > 0) {
      const galleryUrls = [];
      for (const file of files) {
        try {
          if (file.fieldname === "mainImage") {
            const url = await uploadToCloudinary(file.buffer, "products", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            productData.mainImage = url;
          } else if (file.fieldname === "galleryImages") {
            const url = await uploadToCloudinary(file.buffer, "products", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            galleryUrls.push(url);
          }
        } catch (err) {
          logger.error("Cloudinary upload failed", {
            scope: "createProduct",
            error: err,
          });
        }
      }
      if (galleryUrls.length > 0) {
        productData.galleryImages = galleryUrls;
      }
    }

    // Parse JSON fields if they come as strings from FormData
    if (typeof productData.variants === "string") {
      try {
        productData.variants = JSON.parse(productData.variants);
      } catch (e) {
        logger.error("Failed to parse variants JSON", {
          scope: "createProduct",
          error: e,
        });
      }
    }
    if (typeof productData.galleryLabels === "string") {
      try {
        productData.galleryLabels = JSON.parse(productData.galleryLabels);
      } catch (e) {
        // Fallback
      }
    }
    if (typeof productData.tags === "string" && productData.tags.startsWith("[")) {
      try {
        productData.tags = JSON.parse(productData.tags);
      } catch (e) {
        // Not JSON, keep as is
      }
    }

    if (!productData.name) {
      return handleResponse(res, 400, "Product name is required");
    }

    // Auto-generate & ensure unique slug
    let rawSlug = productData.slug && productData.slug.trim() !== ""
      ? slugify(productData.slug)
      : slugify(productData.name);
    let finalSlug = rawSlug;
    let slugExists = await Product.exists({ slug: finalSlug });
    let attempts = 0;
    while (slugExists && attempts < 10) {
      attempts++;
      finalSlug = `${rawSlug}-${Math.random().toString(36).substring(2, 6)}`;
      slugExists = await Product.exists({ slug: finalSlug });
    }
    productData.slug = finalSlug;

    productData.description =
      typeof productData.description === "string"
        ? productData.description.trim()
        : productData.description || "";

    // Auto-generate & ensure unique product SKU
    let rawSku = productData.sku && String(productData.sku).trim() !== ""
      ? String(productData.sku).trim()
      : makeProductSku(productData.name, 1);
    let finalSku = rawSku;
    let skuExists = await Product.exists({ sku: finalSku });
    attempts = 0;
    while (skuExists && attempts < 10) {
      attempts++;
      finalSku = `${rawSku}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      skuExists = await Product.exists({ sku: finalSku });
    }
    productData.sku = finalSku;

    applyMediaFields(productData);

    // Handle tags if string
    if (typeof productData.tags === "string") {
      productData.tags = productData.tags.split(",").map((tag) => tag.trim());
    }

    // Handle variants if string (multipart/form-data sends as string)
    if (typeof productData.variants === "string") {
      try {
        productData.variants = JSON.parse(productData.variants);
      } catch (e) {
        productData.variants = [];
      }
    }

    if (Array.isArray(productData.variants) && productData.variants.length > 0) {
      productData.variants = productData.variants.map((variant, idx) => ({
        ...variant,
        price: Number(variant.price || 0),
        salePrice: Number(variant.salePrice || 0),
        stock: Number(variant.stock || 0),
        sku:
          variant?.sku && String(variant.sku).trim()
            ? variant.sku
            : makeProductSku(productData.name, idx + 1),
      }));

      const totalVariantStock = productData.variants.reduce((sum, v) => sum + Number(v.stock || 0), 0);
      productData.stock = Math.max(Number(productData.stock || 0), totalVariantStock);

      const firstVariant = productData.variants[0];
      if ((!productData.price || Number(productData.price) <= 0) && firstVariant?.price > 0) {
        productData.price = firstVariant.price;
        productData.salePrice = firstVariant.salePrice || 0;
      }
    }

    if (productData.gstTax !== undefined) {
      productData.gstTax = Math.max(0, Math.min(28, Number(productData.gstTax) || 0));
    }

    let moderationUpdate = {};
    let successMessage = "Product created successfully";

    let isPendingApproval = false;
    if (role === "admin") {
      moderationUpdate = buildAdminApprovedModerationUpdate(req.user?.id || null);
    } else {
      const approvalConfig = await getProductApprovalConfig();
      if (approvalConfig.sellerCreateRequiresApproval) {
        moderationUpdate = buildSellerPendingModerationUpdate();
        successMessage = "Product submitted for admin approval";
        isPendingApproval = true;
      } else {
        moderationUpdate = buildSellerApprovedModerationUpdate();
      }
    }
    Object.assign(productData, moderationUpdate);

    const product = await Product.create(productData);

    if (isPendingApproval && product && product._id) {
      try {
        const adminIds = await getAdminIds();
        emitNotificationEvent(NOTIFICATION_EVENTS.PRODUCT_MODERATION_REQUEST, {
          productId: product._id,
          productName: product.name,
          sellerId: req.user.id,
          adminIds,
          action: 'create'
        });
      } catch (e) {
        logger.error("Notification emission failed", { error: e });
      }
    }

    if (product && product._id) {
      // Enqueue search indexing asynchronously
      await enqueueProductIndex(product._id.toString());
      await invalidate(`cache:catalog:product:${product._id.toString()}`);
      if (product.masterProductId) {
        await invalidate(`cache:catalog:product:${product.masterProductId.toString()}`);
      }
    }

    try {
      await invalidate("cache:catalog:productList:*");
      await invalidate(buildKey("catalog", "productList", "*"));
      await invalidate("cache:offersections:public:*");
    } catch (cacheErr) {
      logger.error("Cache invalidation error", {
        scope: "createProduct",
        error: cacheErr,
      });
    }

    return handleResponse(
      res,
      201,
      successMessage,
      normalizeProductDocumentModeration(product?.toObject?.() || product),
    );
  } catch (error) {
    logger.error("Create Product Error", { scope: "createProduct", error });
    if (error.code === 11000) {
      return handleResponse(res, 400, "Slug or SKU already exists");
    }
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE PRODUCT
================================ */
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const role = String(req.user.role || "").toLowerCase();
    const productData = { ...req.body };
    stripRestrictedModerationFields(productData);
    if (Object.prototype.hasOwnProperty.call(productData, "sellerId")) {
      delete productData.sellerId;
    }

    // Handle existing gallery image URLs if sent from form
    let existingGallery = [];
    if (productData.existingGalleryImages) {
      try {
        existingGallery = JSON.parse(productData.existingGalleryImages);
      } catch (err) {
        existingGallery = [];
      }
    }

    if (productData.mainImageUrl) {
      productData.mainImage = productData.mainImageUrl;
    }

    // Handle multipart files (mainImage and galleryImages)
    const files = req.files || [];
    if (files.length > 0) {
      const galleryUrls = [...existingGallery];
      for (const file of files) {
        try {
          if (file.fieldname === "mainImage") {
            const url = await uploadToCloudinary(file.buffer, "products", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            productData.mainImage = url;
          } else if (file.fieldname === "galleryImages") {
            const url = await uploadToCloudinary(file.buffer, "products", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            galleryUrls.push(url);
          }
        } catch (err) {
          logger.error("Cloudinary upload failed during update", {
            scope: "updateProduct",
            error: err,
          });
        }
      }
      if (galleryUrls.length > 0) {
        productData.galleryImages = galleryUrls;
      }
    } else if (existingGallery.length > 0) {
      productData.galleryImages = existingGallery;
    }

    // Parse JSON fields
    if (typeof productData.variants === "string") {
      try {
        productData.variants = JSON.parse(productData.variants);
      } catch (e) {
        logger.error("Failed to parse variants JSON during update", {
          scope: "updateProduct",
          error: e,
        });
      }
    }
    if (typeof productData.galleryLabels === "string") {
      try {
        productData.galleryLabels = JSON.parse(productData.galleryLabels);
      } catch (e) {
        // Fallback
      }
    }
    if (typeof productData.tags === "string" && productData.tags.startsWith("[")) {
      try {
        productData.tags = JSON.parse(productData.tags);
      } catch (e) {
        // Not JSON, keep as is
      }
    }

    // Admin bypasses sellerId check
    const query = role === "admin" ? { _id: id } : { _id: id, sellerId };
    const product = await Product.findOne(query);

    if (!product) {
      return handleResponse(res, 404, "Product not found or unauthorized");
    }

    const existingSlug = product.slug;
    const existingSku = product.sku;

    // Handle slug update safely without collision
    if (productData.slug && String(productData.slug).trim() !== "") {
      const candidateBase = slugify(productData.slug);
      if (candidateBase !== existingSlug) {
        let uniqueSlug = candidateBase;
        let counter = 1;
        while (await Product.exists({ slug: uniqueSlug, _id: { $ne: id } })) {
          uniqueSlug = `${candidateBase}-${counter}`;
          counter++;
        }
        productData.slug = uniqueSlug;
      } else {
        delete productData.slug;
      }
    } else if (productData.name && productData.name !== product.name) {
      const candidateBase = slugify(productData.name);
      if (candidateBase !== existingSlug) {
        let uniqueSlug = candidateBase;
        let counter = 1;
        while (await Product.exists({ slug: uniqueSlug, _id: { $ne: id } })) {
          uniqueSlug = `${candidateBase}-${counter}`;
          counter++;
        }
        productData.slug = uniqueSlug;
      } else {
        delete productData.slug;
      }
    } else {
      delete productData.slug;
    }

    // Handle SKU update safely without collision
    if (productData.sku && String(productData.sku).trim() !== "") {
      const candidateSku = String(productData.sku).trim();
      if (candidateSku !== existingSku) {
        let uniqueSku = candidateSku;
        let counter = 1;
        while (await Product.exists({ sku: uniqueSku, _id: { $ne: id } })) {
          uniqueSku = `${candidateSku}-${counter}`;
          counter++;
        }
        productData.sku = uniqueSku;
      } else {
        delete productData.sku;
      }
    } else {
      delete productData.sku;
    }

    if (productData.gstTax !== undefined) {
      productData.gstTax = Math.max(0, Math.min(28, Number(productData.gstTax) || 0));
    }

    if (productData.description !== undefined) {
      productData.description =
        typeof productData.description === "string"
          ? productData.description.trim()
          : productData.description || "";
    }

    applyMediaFields(productData);

    if (typeof productData.tags === "string") {
      productData.tags = productData.tags.split(",").map((tag) => tag.trim());
    }

    if (typeof productData.variants === "string") {
      try {
        productData.variants = JSON.parse(productData.variants);
      } catch (e) {
        // keep existing if invalid
      }
    }

    if (Array.isArray(productData.variants) && productData.variants.length > 0) {
      const existingVariants = product.variants || [];
      const skuBaseName = productData.name || product.name || 'item';

      productData.variants = productData.variants.map((variant, idx) => {
        const vSku = variant?.sku && String(variant.sku).trim()
          ? String(variant.sku).trim()
          : (existingVariants[idx]?.sku || `${existingSku || 'SKU'}-V${idx + 1}`);

        return {
          ...variant,
          price: Number(variant.price || 0),
          salePrice: Number(variant.salePrice || 0),
          stock: Number(variant.stock || 0),
          sku: vSku,
        };
      });

      const totalVariantStock = productData.variants.reduce((sum, v) => sum + Number(v.stock || 0), 0);
      productData.stock = Math.max(Number(productData.stock || 0), totalVariantStock);

      const firstVariant = productData.variants[0];
      if ((!productData.price || Number(productData.price) <= 0) && firstVariant?.price > 0) {
        productData.price = firstVariant.price;
        productData.salePrice = firstVariant.salePrice || 0;
      }
    }

    let moderationUpdate = {};
    let successMessage = "Product updated successfully";

    let isPendingApproval = false;
    if (role === "admin") {
      moderationUpdate = buildAdminApprovedModerationUpdate(req.user?.id || null);
    } else {
      const approvalConfig = await getProductApprovalConfig();
      if (approvalConfig.sellerEditRequiresApproval) {
        moderationUpdate = buildSellerPendingModerationUpdate();
        successMessage = "Product changes submitted for admin approval";
        isPendingApproval = true;
      } else {
        moderationUpdate = buildSellerApprovedModerationUpdate();
      }
    }
    Object.assign(productData, moderationUpdate);

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { $set: productData },
      { new: true, runValidators: true },
    );

    if (updatedProduct) {
      // Clean up old main image if it was replaced with a new one
      if (productData.mainImage && productData.mainImage !== product.mainImage) {
        try {
          await deleteUploadedFile(product.mainImage);
        } catch (cleanupErr) {
          logger.error("Failed to delete replaced main image", {
            scope: "updateProduct",
            error: cleanupErr,
          });
        }
      }

      // Clean up old gallery images that were removed in this update
      if (productData.galleryImages && Array.isArray(product.galleryImages)) {
        try {
          for (const oldUrl of product.galleryImages) {
            if (oldUrl && !productData.galleryImages.includes(oldUrl)) {
              await deleteUploadedFile(oldUrl);
            }
          }
        } catch (cleanupErr) {
          logger.error("Failed to delete removed gallery images", {
            scope: "updateProduct",
            error: cleanupErr,
          });
        }
      }
    }

    if (isPendingApproval && updatedProduct) {
      try {
        const adminIds = await getAdminIds();
        emitNotificationEvent(NOTIFICATION_EVENTS.PRODUCT_MODERATION_REQUEST, {
          productId: updatedProduct._id,
          productName: updatedProduct.name,
          sellerId: req.user.id,
          adminIds,
          action: 'update'
        });
      } catch (e) {
        logger.error("Notification emission failed", { error: e });
      }
    }

    // Enqueue search indexing asynchronously
    await enqueueProductIndex(id);
    await invalidate(`cache:catalog:product:${id}`);
    if (updatedProduct && updatedProduct.masterProductId) {
      await invalidate(`cache:catalog:product:${updatedProduct.masterProductId.toString()}`);
    }

    try {
      await invalidate("cache:catalog:productList:*");
      await invalidate(buildKey("catalog", "productList", "*"));
      await invalidate("cache:offersections:public:*");
    } catch (cacheErr) {
      logger.error("Cache invalidation error", {
        scope: "updateProduct",
        error: cacheErr,
      });
    }

    return handleResponse(
      res,
      200,
      successMessage,
      normalizeProductDocumentModeration(updatedProduct?.toObject?.() || updatedProduct),
    );
  } catch (error) {
    logger.error("Update Product Error", { scope: "updateProduct", error });
    if (error.name === "ValidationError") {
      return handleResponse(
        res,
        400,
        Object.values(error.errors)
          .map((e) => e.message)
          .join(", "),
      );
    }
    if (error.name === "CastError") {
      return handleResponse(res, 400, `Invalid ${error.path}: ${error.value}`);
    }
    if (error.code === 11000) {
      return handleResponse(res, 400, "Slug or SKU already exists");
    }
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   DELETE PRODUCT
================================ */
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const role = req.user.role;

    const query = role === "admin" ? { _id: id } : { _id: id, sellerId };
    const product = await Product.findOneAndDelete(query);

    if (!product) {
      return handleResponse(res, 404, "Product not found or unauthorized");
    }

    // Safely delete uploaded images from the server disk
    try {
      if (product.mainImage) {
        await deleteUploadedFile(product.mainImage);
      }
      if (Array.isArray(product.galleryImages)) {
        for (const imageUrl of product.galleryImages) {
          if (imageUrl) {
            await deleteUploadedFile(imageUrl);
          }
        }
      }
    } catch (cleanupErr) {
      logger.error("Failed to clean up deleted product images", {
        scope: "deleteProduct",
        productId: id,
        error: cleanupErr,
      });
    }

    // Enqueue search index removal asynchronously
    await enqueueProductRemoval(id);
    await invalidate(`cache:catalog:product:${id}`);

    try {
      await invalidate(buildKey("catalog", "productList", "*"));
      await invalidate("cache:offersections:public:*");
    } catch (cacheErr) {
      logger.error("Cache invalidation error", {
        scope: "deleteProduct",
        error: cacheErr,
      });
    }

    return handleResponse(res, 200, "Product deleted successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET SINGLE PRODUCT
================================ */
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const enforceRadius = isCustomerVisibilityRequest(req) && (process.env.NODE_ENV === "production" || req.query.enforceRadius === "true");

    let nearbySellerSet = null;
    const coords = parseCustomerCoordinates(req.query || {});
    if (enforceRadius) {
      if (!coords.valid) {
        return handleResponse(
          res,
          400,
          "lat and lng are required for customer product visibility",
        );
      }
      const nearbySellerIds = await getNearbySellerIdsForCustomer(
        coords.lat,
        coords.lng,
      );
      nearbySellerSet = new Set(nearbySellerIds.map(String));
    }

    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId
      ? { $or: [{ _id: id }, { masterProductId: id }], status: "active" }
      : { slug: id.toLowerCase(), status: "active" };

    const cacheKey = buildKey("catalog", "product", isObjectId ? id : `slug-${id.toLowerCase()}`);
    let product = await getOrSet(
      cacheKey,
      async () => {
        let p = await Product.findOne(query)
          .select(
            "name slug description sku price salePrice stock lowStockAlert brand weight mainImage galleryImages headerId categoryId subcategoryId sellerId status approvalStatus approvalRequestedAt approvalReviewedAt approvalReviewedBy approvalNote lastSubmittedByRole isFeatured variants createdAt masterProductId",
          )
          .populate("headerId", "name")
          .populate("categoryId", "name")
          .populate("subcategoryId", "name")
          .populate("sellerId", "shopName")
          .sort({ price: 1 })
          .lean();

        if (!p) {
          const masterQuery = isObjectId ? { _id: id } : { slug: id.toLowerCase() };
          const masterProduct = await MasterProduct.findOne(masterQuery)
            .populate("headerId", "name")
            .populate("categoryId", "name")
            .populate("subcategoryId", "name")
            .lean();

          if (masterProduct) {
            const sellerOffer = await Product.findOne({ masterProductId: masterProduct._id, status: "active" })
              .select(
                "name slug description sku price salePrice stock lowStockAlert brand weight mainImage galleryImages headerId categoryId subcategoryId sellerId status approvalStatus approvalRequestedAt approvalReviewedAt approvalReviewedBy approvalNote lastSubmittedByRole isFeatured variants createdAt masterProductId",
              )
              .populate("headerId", "name")
              .populate("categoryId", "name")
              .populate("subcategoryId", "name")
              .populate("sellerId", "shopName")
              .sort({ price: 1 })
              .lean();

            if (sellerOffer) {
              p = sellerOffer;
            } else {
              p = {
                _id: masterProduct._id,
                name: masterProduct.name,
                slug: masterProduct.slug,
                description: masterProduct.description || '',
                sku: masterProduct.sku || '',
                price: 0,
                salePrice: 0,
                stock: 0,
                brand: masterProduct.brand || '',
                weight: masterProduct.packSize || '',
                mainImage: masterProduct.mainImage || '',
                galleryImages: masterProduct.galleryImages || [],
                headerId: masterProduct.headerId,
                categoryId: masterProduct.categoryId,
                subcategoryId: masterProduct.subcategoryId,
                sellerId: null,
                status: 'active',
                approvalStatus: 'approved',
                isFeatured: false,
                variants: (masterProduct.variants || []).map(v => ({ ...v, price: 0, salePrice: 0, stock: 0 })),
                createdAt: masterProduct.createdAt,
                isMasterProduct: true,
                isOutOfStock: true
              };
            }
          }
        }
        return p;
      },
      getTTL("product"),
    );

    if (!product) {
      return handleResponse(res, 404, "Product not found");
    }

    if (enforceRadius) {
      const approvalState = resolveProductApprovalStatus(product);
      if (product.status !== "active" || approvalState !== PRODUCT_APPROVAL_STATUS.APPROVED) {
        return handleResponse(res, 404, "Product not found");
      }
    }

    const sellerIdForProduct = product?.sellerId ? String(product.sellerId._id || product.sellerId) : null;
    let isAvailableInLocation = true;
    let finalStock = Number(product?.stock || 0);

    if (enforceRadius || nearbySellerSet) {
      if (sellerIdForProduct && nearbySellerSet && nearbySellerSet.has(sellerIdForProduct) && finalStock > 0) {
        isAvailableInLocation = true;
      } else {
        // Try finding nearby seller offer
        const masterIdStr = product.masterProductId ? String(product.masterProductId) : String(product._id);
        const nearbyOffer = await Product.findOne({
          $or: [
            { masterProductId: masterIdStr },
            { _id: masterIdStr },
            { sku: product.sku }
          ],
          sellerId: { $in: Array.from(nearbySellerSet || []) },
          status: "active",
          stock: { $gt: 0 }
        }).populate("sellerId", "shopName").lean();

        if (nearbyOffer) {
          isAvailableInLocation = true;
          finalStock = Number(nearbyOffer.stock || 0);
          product = {
            ...product,
            price: nearbyOffer.price,
            salePrice: nearbyOffer.salePrice,
            stock: finalStock,
            sellerId: nearbyOffer.sellerId,
            variants: nearbyOffer.variants || product.variants
          };
        } else {
          isAvailableInLocation = false;
          finalStock = 0;
          product = {
            ...product,
            stock: 0,
            variants: (product.variants || []).map(v => ({ ...v, stock: 0 }))
          };
        }
      }
    } else {
      isAvailableInLocation = finalStock > 0;
    }

    product.isAvailableInLocation = isAvailableInLocation;
    product.isOutOfStock = !isAvailableInLocation || finalStock <= 0;
    product.inStock = isAvailableInLocation && finalStock > 0;

    const payload = normalizeProductDocumentModeration(product);

    if (req.user) {
      const userId = req.user.id;
      const purchase = await Order.findOne({
        customer: userId,
        "items.product": id,
        $or: [
          { orderStatus: { $regex: /^delivered$/i } },
          { status: { $regex: /^delivered$/i } }
        ]
      });
      payload.hasPurchased = !!purchase;

      const existingReview = await Review.findOne({
        userId,
        productId: id
      });
      payload.hasReviewed = !!existingReview;
    }

    return handleResponse(
      res,
      200,
      "Product details fetched",
      payload,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN MODERATION LIST
================================ */
export const getModerationProducts = async (req, res) => {
  try {
    const {
      approvalStatus = "all",
      status = "all",
      search = "",
      sellerId,
      category,
      categoryId,
      subcategory,
      subcategoryId,
      header,
      headerId,
      sort = "newest",
    } = req.query;
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 100,
    });

    const baseQuery = {};
    if (status && status !== "all") {
      baseQuery.status = status;
    }
    if (sellerId && sellerId !== "all") {
      baseQuery.sellerId = sellerId;
    }

    const finalHeaderId = header || headerId;
    const finalCategoryId = category || categoryId;
    const finalSubcategoryId = subcategory || subcategoryId;
    if (finalHeaderId && finalHeaderId !== "all") {
      baseQuery.headerId = finalHeaderId;
    }
    if (finalCategoryId && finalCategoryId !== "all") {
      baseQuery.categoryId = finalCategoryId;
    }
    if (finalSubcategoryId && finalSubcategoryId !== "all") {
      baseQuery.subcategoryId = finalSubcategoryId;
    }

    if (search && String(search).trim()) {
      const term = String(search).trim();
      if (isProductTextSearchEnabled() && term.length >= 3) {
        baseQuery.$text = { $search: term };
      } else {
        // P3-5: same substring semantics, now safely escaped.
        const safe = buildSearchRegex(term, { anchored: false });
        baseQuery.$or = [
          { name: safe },
          { slug: safe },
          { sku: safe },
        ];
      }
    }

    const effectiveStockExpr = {
      $cond: {
        if: { $gt: [{ $size: { $ifNull: ["$variants", []] } }, 0] },
        then: {
          $sum: {
            $map: {
              input: "$variants",
              as: "v",
              in: { $convert: { input: "$$v.stock", to: "double", onError: 0, onNull: 0 } }
            }
          }
        },
        else: { $convert: { input: "$stock", to: "double", onError: 0, onNull: 0 } }
      }
    };

    const thresholdExpr = {
      $let: {
        vars: {
          rawThreshold: { $convert: { input: "$lowStockAlert", to: "double", onError: 0, onNull: 0 } }
        },
        in: { $cond: [{ $gt: ["$$rawThreshold", 0] }, "$$rawThreshold", 10] }
      }
    };

    const { stockStatus = "all" } = req.query;
    if (stockStatus !== "all") {
      if (stockStatus === "out") {
        baseQuery.$expr = { $eq: [effectiveStockExpr, 0] };
      } else if (stockStatus === "low") {
        baseQuery.$expr = {
          $and: [
            { $gt: [effectiveStockExpr, 0] },
            { $lte: [effectiveStockExpr, thresholdExpr] }
          ]
        };
      }
    }

    let moderatedQuery = { ...baseQuery };
    const approvalFilter = buildApprovalStatusFilter(approvalStatus);
    if (Object.keys(approvalFilter).length > 0) {
      moderatedQuery = { $and: [moderatedQuery, approvalFilter] };
    }

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      "name-asc": { name: 1, createdAt: -1 },
      "name-desc": { name: -1, createdAt: -1 },
      "price-asc": { price: 1, createdAt: -1 },
      "price-desc": { price: -1, createdAt: -1 },
    };
    const sortQuery = sortMap[String(sort || "newest").toLowerCase()] || sortMap.newest;

    // Compute base counts for stats cards, ignoring status/stock filters
    const baseStatsQuery = { ...baseQuery };
    delete baseStatsQuery.status;
    delete baseStatsQuery.$expr;

    const [items, total, allCount, pendingCount, approvedCount, rejectedCount, activeCount, lowStockCount, outOfStockCount] =
      await Promise.all([
        Product.find(moderatedQuery)
          .select(
            "name slug description sku price salePrice stock lowStockAlert brand weight mainImage galleryImages headerId categoryId subcategoryId sellerId status approvalStatus approvalRequestedAt approvalReviewedAt approvalReviewedBy approvalNote lastSubmittedByRole isFeatured variants createdAt",
          )
          .populate("headerId", "name")
          .populate("categoryId", "name")
          .populate("subcategoryId", "name")
          .populate("sellerId", "shopName name")
          .populate("approvalReviewedBy", "name email")
          .sort(sortQuery)
          .skip(skip)
          .limit(limit)
          .lean(),
        Product.countDocuments(moderatedQuery),
        Product.countDocuments(baseStatsQuery),
        Product.countDocuments({
          ...baseStatsQuery,
          approvalStatus: PRODUCT_APPROVAL_STATUS.PENDING,
        }),
        Product.countDocuments({
          $and: [
            { ...baseStatsQuery },
            buildApprovalStatusFilter(PRODUCT_APPROVAL_STATUS.APPROVED),
          ],
        }),
        Product.countDocuments({
          ...baseStatsQuery,
          approvalStatus: PRODUCT_APPROVAL_STATUS.REJECTED,
        }),
        Product.countDocuments({ ...baseStatsQuery, status: "active" }),
        Product.countDocuments({
          ...baseStatsQuery,
          $expr: {
            $and: [
              { $gt: [effectiveStockExpr, 0] },
              { $lte: [effectiveStockExpr, thresholdExpr] }
            ]
          }
        }),
        Product.countDocuments({ ...baseStatsQuery, $expr: { $eq: [effectiveStockExpr, 0] } }),
      ]);

    return handleResponse(res, 200, "Moderation products fetched", {
      items: normalizeProductListModeration(items),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      counts: {
        all: allCount,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        active: activeCount,
        lowStock: lowStockCount,
        outOfStock: outOfStockCount,
      },
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN MODERATION ACTIONS
================================ */
export const approveProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const note = req.body?.approvalNote ?? req.body?.note ?? "";
    const moderationUpdate = buildAdminApprovedModerationUpdate(
      req.user?.id || null,
      note,
    );

    const updated = await Product.findByIdAndUpdate(
      id,
      { $set: moderationUpdate },
      { new: true, runValidators: true },
    )
      .populate("headerId", "name")
      .populate("categoryId", "name")
      .populate("subcategoryId", "name")
      .populate("sellerId", "shopName name")
      .populate("approvalReviewedBy", "name email");

    if (!updated) {
      return handleResponse(res, 404, "Product not found");
    }

    await enqueueProductIndex(id);
    await invalidate(`cache:catalog:product:${id}`);
    await invalidate(buildKey("catalog", "productList", "*"));
    await invalidate("cache:offersections:public:*");

    return handleResponse(
      res,
      200,
      "Product approved successfully",
      normalizeProductDocumentModeration(updated?.toObject?.() || updated),
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const rejectProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const note = req.body?.approvalNote ?? req.body?.note ?? "";
    const moderationUpdate = buildAdminRejectedModerationUpdate(
      req.user?.id || null,
      note,
    );

    const updated = await Product.findByIdAndUpdate(
      id,
      { $set: moderationUpdate },
      { new: true, runValidators: true },
    )
      .populate("headerId", "name")
      .populate("categoryId", "name")
      .populate("subcategoryId", "name")
      .populate("sellerId", "shopName name")
      .populate("approvalReviewedBy", "name email");

    if (!updated) {
      return handleResponse(res, 404, "Product not found");
    }

    await enqueueProductIndex(id);
    await invalidate(`cache:catalog:product:${id}`);
    await invalidate(buildKey("catalog", "productList", "*"));
    await invalidate("cache:offersections:public:*");

    return handleResponse(
      res,
      200,
      "Product rejected successfully",
      normalizeProductDocumentModeration(updated?.toObject?.() || updated),
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const bulkImportProducts = async (req, res) => {
  try {
    const role = String(req.user?.role || "").toLowerCase();
    const { products, mode } = req.body || {};

    if (!Array.isArray(products) || products.length === 0) {
      return handleResponse(res, 400, "No products provided for import");
    }

    let sellerId = req.user.id;
    if (role === "admin") {
      if (!req.body.sellerId) {
        return handleResponse(res, 400, "sellerId is required for admin import");
      }
      sellerId = req.body.sellerId;
    }

    // Load active categories in memory
    const CategoryModel = (await import("../models/category.js")).default;
    const activeCategories = await CategoryModel.find({ status: "active" }).lean();

    const importedProducts = [];
    const errors = [];

    // getProductApprovalConfig from moderation service;
    // builder functions are defined locally in this file
    const { getProductApprovalConfig } = await import("../services/productModerationService.js");

    const approvalConfig = await getProductApprovalConfig();

    for (let index = 0; index < products.length; index++) {
      const pData = products[index];
      const rowNum = index + 3; // mapping to excel row

      try {
        if (!pData.name) {
          throw new Error(`Row ${rowNum}: Product Title is required`);
        }
        if (!pData.mainGroup) {
          throw new Error(`Row ${rowNum}: Main Group is required`);
        }
        if (!pData.specificCategory) {
          throw new Error(`Row ${rowNum}: Specific Category is required`);
        }

        // Find mainGroup (header)
        let header = activeCategories.find(
          (c) => c.type === "header" && c.name.toLowerCase() === String(pData.mainGroup).trim().toLowerCase()
        );
        if (!header) {
          throw new Error(`Row ${rowNum}: Main Group "${pData.mainGroup}" not found or inactive`);
        }

        // Find specificCategory under header
        let category = activeCategories.find(
          (c) =>
            c.type === "category" &&
            String(c.parentId) === String(header._id) &&
            c.name.toLowerCase() === String(pData.specificCategory).trim().toLowerCase()
        );
        if (!category) {
          const newCatSlug = slugify(pData.specificCategory);
          // Check if category with same name or slug already exists under a different parent
          const existingCategoryElsewhere = activeCategories.find(
            (c) =>
              c.type === "category" &&
              (c.name.toLowerCase() === String(pData.specificCategory).trim().toLowerCase() ||
                c.slug === newCatSlug)
          );

          if (existingCategoryElsewhere) {
            category = existingCategoryElsewhere;
            // Align header to the actual parent header of the existing category
            const parentHeader = activeCategories.find(
              (c) => c.type === "header" && String(c._id) === String(category.parentId)
            );
            if (parentHeader) {
              header = parentHeader;
            }
          } else {
            // Create the category automatically
            const newCategory = await CategoryModel.create({
              name: String(pData.specificCategory).trim(),
              slug: newCatSlug,
              type: "category",
              parentId: header._id,
              status: "active"
            });

            category = newCategory.toObject ? newCategory.toObject() : newCategory;
            activeCategories.push(category);
          }
        }

        // Check if subcategories exist under this category
        const subcategoriesUnderCategory = activeCategories.filter(
          (c) => c.type === "subcategory" && String(c.parentId) === String(category._id)
        );

        if (subcategoriesUnderCategory.length > 0 && (!pData.subCategory || !String(pData.subCategory).trim())) {
          throw new Error(`Row ${rowNum}: Sub Category is required for Main Category "${category.name}"`);
        }

        // Find subCategory under category
        let subcategory = null;
        if (pData.subCategory && String(pData.subCategory).trim()) {
          subcategory = activeCategories.find(
            (c) =>
              c.type === "subcategory" &&
              String(c.parentId) === String(category._id) &&
              c.name.toLowerCase() === String(pData.subCategory).trim().toLowerCase()
          );
          if (!subcategory) {
            const newSubSlug = slugify(pData.subCategory);
            // Check if subcategory with same name or slug already exists under a different parent
            const existingSubElsewhere = activeCategories.find(
              (c) =>
                c.type === "subcategory" &&
                (c.name.toLowerCase() === String(pData.subCategory).trim().toLowerCase() ||
                  c.slug === newSubSlug)
            );

            if (existingSubElsewhere) {
              subcategory = existingSubElsewhere;
              // Align category and header to the actual hierarchy of the existing subcategory
              const parentCategory = activeCategories.find(
                (c) => c.type === "category" && String(c._id) === String(subcategory.parentId)
              );
              if (parentCategory) {
                category = parentCategory;
                const parentHeader = activeCategories.find(
                  (c) => c.type === "header" && String(c._id) === String(category.parentId)
                );
                if (parentHeader) {
                  header = parentHeader;
                }
              }
            } else {
              // Create the subcategory automatically
              const newSubcategory = await CategoryModel.create({
                name: String(pData.subCategory).trim(),
                slug: newSubSlug,
                type: "subcategory",
                parentId: category._id,
                status: "active"
              });

              subcategory = newSubcategory.toObject ? newSubcategory.toObject() : newSubcategory;
              activeCategories.push(subcategory);
            }
          }
        }

        // Resolve status
        const resolvedStatus = pData.status === "inactive" ? "inactive" : "active";

        // Determine price, salePrice, stock from Variant 1
        const v1 = pData.variants && pData.variants[0];
        if (!v1) {
          throw new Error(`Row ${rowNum}: At least one variant is required`);
        }

        const price = Number(v1.price);
        const salePrice = v1.salePrice ? Number(v1.salePrice) : undefined;
        const stock = Number(v1.stock);

        if (isNaN(price)) {
          throw new Error(`Row ${rowNum}: Variant 1 Price must be a valid number`);
        }
        if (isNaN(stock)) {
          throw new Error(`Row ${rowNum}: Variant 1 Stock must be a valid number`);
        }

        const finalVariants = pData.variants.map((v, vIdx) => {
          return {
            name: String(v.name || "").trim(),
            price: Number(v.price),
            salePrice: v.salePrice ? Number(v.salePrice) : undefined,
            stock: Number(v.stock),
            sku: v.sku && String(v.sku).trim() ? String(v.sku).trim() : makeProductSku(pData.name, vIdx + 1),
          };
        });

        // Use custom slugify or fallback
        let slug = slugify(pData.name);

        const newProdData = {
          name: String(pData.name).trim(),
          slug,
          sku: finalVariants[0].sku, // use variant 1 sku as product sku
          description: String(pData.description || "").trim(),
          brand: String(pData.brand || "").trim(),
          weight: String(pData.weight || "").trim(),
          tags: Array.isArray(pData.tags) ? pData.tags : [],
          sellerId,
          headerId: header._id,
          categoryId: category._id,
          subcategoryId: subcategory ? subcategory._id : null,
          status: resolvedStatus,
          mainImage: pData.mainImageUrl ? String(pData.mainImageUrl).trim() : undefined,
          galleryImages: Array.isArray(pData.galleryUrls) ? pData.galleryUrls : [],
          variants: finalVariants,
          price,
          salePrice,
          stock,
        };

        // Moderation
        let moderationUpdate = {};
        if (role === "admin") {
          moderationUpdate = buildAdminApprovedModerationUpdate(req.user?.id || null);
        } else {
          if (approvalConfig.sellerCreateRequiresApproval) {
            moderationUpdate = buildSellerPendingModerationUpdate();
          } else {
            moderationUpdate = buildSellerApprovedModerationUpdate();
          }
        }
        Object.assign(newProdData, moderationUpdate);

        const newProduct = await Product.create(newProdData);
        if (newProduct && newProduct._id) {
          await enqueueProductIndex(newProduct._id.toString());
        }
        importedProducts.push(newProduct);
      } catch (rowErr) {
        errors.push(rowErr.message);
      }
    }

    // Invalidate list caches
    await invalidate(buildKey("catalog", "productList", "*"));
    await invalidate("cache:offersections:public:*");

    if (errors.length > 0) {
      return handleResponse(res, 400, "Import completed with errors", {
        importedCount: importedProducts.length,
        errors,
      });
    }

    return handleResponse(res, 200, "Products imported successfully", {
      importedCount: importedProducts.length,
      products: importedProducts.map(p => p._id),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getCatalogBrands = async (req, res) => {
  try {
    const { headerId, categoryId, subcategoryId } = req.query;
    const query = { status: { $ne: 'deleted' } };

    const conditions = [];
    if (subcategoryId) conditions.push({ subcategoryId }, { categoryId: subcategoryId }, { headerId: subcategoryId });
    if (categoryId) conditions.push({ categoryId }, { headerId: categoryId });
    if (headerId) conditions.push({ headerId });

    if (conditions.length > 0) {
      query.$or = conditions;
    }

    const rawBrands = await MasterProduct.distinct("brand", query);
    const brands = (rawBrands || [])
      .filter((b) => b && typeof b === 'string' && b.trim() !== '')
      .map((b) => b.trim())
      .filter((val, idx, self) => self.findIndex((t) => t.toLowerCase() === val.toLowerCase()) === idx)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    return res.status(200).json({ success: true, results: brands });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getCatalogProducts = async (req, res) => {
  try {
    await syncUnlinkedSellerProductsToMasterCatalog();
    const { headerId, categoryId, subcategoryId, brand } = req.query;
    const query = { status: { $ne: 'deleted' } };

    const conditions = [];
    if (subcategoryId) conditions.push({ subcategoryId }, { categoryId: subcategoryId }, { headerId: subcategoryId });
    if (categoryId) conditions.push({ categoryId }, { headerId: categoryId });
    if (headerId) conditions.push({ headerId });

    if (conditions.length > 0) {
      query.$or = conditions;
    }

    if (brand) query.brand = new RegExp("^" + String(brand).trim() + "$", "i");

    const products = await MasterProduct.find(query).populate('headerId categoryId subcategoryId', 'name');
    return res.status(200).json({ success: true, results: products });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const generateBulkTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();

    // 1. Fetch live DB Categories
    const categories = await Category.find({ type: "header" })
      .select("name type children")
      .populate({
        path: "children",
        select: "name type children",
        populate: {
          path: "children",
          select: "name type"
        }
      })
      .sort({ name: 1 })
      .lean();

    // 2. Fetch live Master Products & Brands
    const masterProducts = await MasterProduct.find({ status: { $ne: "deleted" } })
      .select("name brand variants")
      .lean();

    const distinctBrands = [...new Set(masterProducts.map(p => p.brand).filter(Boolean))];
    const brandList = distinctBrands.length > 0 ? distinctBrands : ['Generic'];

    const productTitles = [...new Set(masterProducts.map(p => p.name).filter(Boolean))];
    const titleList = productTitles.length > 0 ? productTitles : ['Sample Product'];

    // Collect all variants across master products
    const allVariants = new Set(['Default']);
    masterProducts.forEach(mp => {
      if (Array.isArray(mp.variants)) {
        mp.variants.forEach(v => {
          if (v.name) allVariants.add(v.name);
        });
      }
    });
    const variantList = [...allVariants];

    // Helper for excel named range identifier
    const getExcelName = (name, index) => "_" + String(name).replace(/[^a-zA-Z0-9]/g, "") + "_" + index;

    // 3. Create Lists Sheet (very hidden)
    const listSheet = workbook.addWorksheet('Lists', { state: 'veryHidden' });
    listSheet.getCell('A1').value = 'Parent Name';
    listSheet.getCell('B1').value = 'Named Range';
    let mappingRowIndex = 2;
    let listColIndex = 8; // start from Column H for category mapping lists

    const addListAndMapping = (parentName, items, indexCounter) => {
      if (!items || items.length === 0) return;
      const rangeName = getExcelName(parentName, indexCounter);
      listSheet.getColumn(listColIndex).values = [parentName, ...items.map(i => i.name)];
      const colLetter = listSheet.getColumn(listColIndex).letter;

      workbook.definedNames.add(`Lists!$${colLetter}$2:$${colLetter}$${items.length + 1}`, rangeName);

      listSheet.getCell(`A${mappingRowIndex}`).value = parentName;
      listSheet.getCell(`B${mappingRowIndex}`).value = rangeName;
      mappingRowIndex++;
      listColIndex++;
    };

    // Main Categories (Header Categories) in Col C (3)
    const catList = categories.length > 0 ? categories : [{ name: 'Electronics', children: [] }];
    listSheet.getColumn(3).values = ['Main Categories', ...catList.map(c => c.name)];
    const mainColLetter = listSheet.getColumn(3).letter;
    const catEndRow = Math.max(2, catList.length + 1);
    workbook.definedNames.add(`Lists!$${mainColLetter}$2:$${mainColLetter}$${catEndRow}`, 'MainCategories');

    // CategoryMap for VLOOKUP
    workbook.definedNames.add('Lists!$A$2:$B$1000', 'CategoryMap');

    // Admin Brands in Col D (4)
    listSheet.getColumn(4).values = ['Admin Brands', ...brandList];
    const brandEndRow = Math.max(2, brandList.length + 1);
    workbook.definedNames.add(`Lists!$D$2:$D$${brandEndRow}`, 'AdminBrands');

    // Master Product Titles in Col E (5)
    listSheet.getColumn(5).values = ['Master Products', ...titleList];
    const titleEndRow = Math.max(2, titleList.length + 1);
    workbook.definedNames.add(`Lists!$E$2:$E$${titleEndRow}`, 'MasterProducts');

    // Admin Variants in Col F (6)
    listSheet.getColumn(6).values = ['Admin Variants', ...variantList];
    const variantEndRow = Math.max(2, variantList.length + 1);
    workbook.definedNames.add(`Lists!$F$2:$F$${variantEndRow}`, 'AdminVariants');

    // Build Dependent Category Lists
    let indexCounter = 1;
    catList.forEach(mainCat => {
      addListAndMapping(mainCat.name, mainCat.children, indexCounter++);
      if (mainCat.children) {
        mainCat.children.forEach(subCat => {
          addListAndMapping(subCat.name, subCat.children, indexCounter++);
        });
      }
    });

    // 4. Products Sheet
    const sheet = workbook.addWorksheet('Products');
    await sheet.protect('quickemart123', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      deleteColumns: false,
      deleteRows: false,
    });

    // Row 1: Instructions (LOCKED)
    sheet.mergeCells('A1:J1');
    const instCell = sheet.getCell('A1');
    instCell.value = 'INSTRUCTIONS & RULES: 1. Columns with * are required. 2. Sub Category is required if available for selected Main Category. 3. Row 3 is a sample row (Read-Only reference). Data entry starts from Row 4.';
    instCell.font = { italic: true, color: { argb: 'FF555555' } };
    instCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    instCell.protection = { locked: true };

    // Row 2: Headers (LOCKED)
    const headers = [
      'Header Category *', 'Main Category *', 'Sub Category', 'Brand Name',
      'Product Title *', 'Variant Name *', 'Pack Size / Unit', 'Price *', 'Sale Price', 'Stock *'
    ];
    sheet.addRow(headers);
    const headerRow = sheet.getRow(2);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    headerRow.eachCell(cell => { cell.protection = { locked: true }; });

    // Row 3: Sample Row (LOCKED & READ-ONLY REFERENCE)
    const sampleRowValues = [
      catList[0]?.name || 'Electronics',
      catList[0]?.children?.[0]?.name || 'Laptops',
      catList[0]?.children?.[0]?.children?.[0]?.name || '',
      brandList[0] || 'Generic',
      titleList[0] || 'Sample Product',
      variantList[0] || 'Default',
      '1 unit',
      500,
      450,
      10
    ];
    sheet.addRow(sampleRowValues);
    const sampleRow = sheet.getRow(3);
    sampleRow.font = { italic: true, color: { argb: 'FF555555' } };
    sampleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
    sampleRow.eachCell(cell => { cell.protection = { locked: true }; });

    // Adjust column widths
    sheet.columns.forEach((col, i) => {
      col.width = headers[i].length < 18 ? 18 : 25;
      if (headers[i].includes('Price') || headers[i].includes('Stock')) {
        col.numFmt = '#,##0.00';
      }
    });

    // Rows 4 to 102: Seller Data Entry Rows (UNLOCKED + DATA VALIDATION)
    for (let i = 4; i <= 102; i++) {
      const row = sheet.getRow(i);
      for (let col = 1; col <= headers.length; col++) {
        row.getCell(col).protection = { locked: false };
      }

      // Col A (Header Category)
      sheet.getCell(`A${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['MainCategories']
      };

      // Col B (Main Category)
      sheet.getCell(`B${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`INDIRECT(VLOOKUP($A${i}, CategoryMap, 2, FALSE))`]
      };

      // Col C (Sub Category)
      sheet.getCell(`C${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`INDIRECT(VLOOKUP($B${i}, CategoryMap, 2, FALSE))`]
      };

      // Col D (Brand Name)
      sheet.getCell(`D${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['AdminBrands']
      };

      // Col E (Product Title *)
      sheet.getCell(`E${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['MasterProducts']
      };

      // Col F (Variant Name *)
      sheet.getCell(`F${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['AdminVariants']
      };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Product_Bulk_Upload_Template.xlsx"');

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error("Bulk template generation error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

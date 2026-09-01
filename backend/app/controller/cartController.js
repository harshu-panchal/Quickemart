import Cart from "../models/cart.js";
import Product from "../models/product.js";
import Seller from "../models/seller.js";
import handleResponse from "../utils/helper.js";
import { getApprovedOrLegacyFilter } from "../services/productModerationService.js";

import Category from "../models/category.js";
import { calculateCustomerDisplayPrice } from "../services/finance/pricingService.js";
import { isShopCurrentlyOpen, getShopStatusMeta } from "../services/shopTimingService.js";

import {
  parseCustomerCoordinates,
  getNearbySellerIdsForCustomer,
} from "../services/customerVisibilityService.js";

const CART_POPULATE_FIELDS =
  "name slug price salePrice mainImage stock status headerId categoryId subcategoryId sellerId variants";

const CUSTOMER_VISIBLE_PRODUCT_MATCH = {
  status: "active",
  ...getApprovedOrLegacyFilter(),
};

async function sanitizeCartItems(cart) {
  if (!cart || !Array.isArray(cart.items)) return cart;
  cart.items = cart.items.filter((item) => Boolean(item?.productId));

  const categoryIds = [...new Set(cart.items.map(item => String(item.productId?.headerId || item.productId?.categoryId || "")).filter(Boolean))];
  const categoryDocs = await Category.find({ _id: { $in: categoryIds } })
    .select("_id name adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule handlingFees handlingFeeType handlingFeeValue")
    .lean();
  const categoryMap = new Map(categoryDocs.map(c => [String(c._id), c]));

  const sellerIds = [...new Set(cart.items.map(item => String(item.productId?.sellerId || "")).filter(Boolean))];
  const sellers = await Seller.find({ _id: { $in: sellerIds } })
    .select("_id shopName shopTiming manualOverride isActive applicationStatus")
    .lean();
  const sellerMap = new Map(sellers.map(s => [String(s._id), s]));

  cart.items = cart.items.map((item) => {
    const p = item.productId;
    if (!p) return item;

    const catConfig = categoryMap.get(String(p.headerId)) || categoryMap.get(String(p.categoryId)) || null;
    const rawSale = Number(p.salePrice || p.price || 0);
    const rawReg = Number(p.price || p.salePrice || 0);

    const saleDisplay = calculateCustomerDisplayPrice(rawSale, catConfig).customerDisplayPrice;
    const regDisplay = calculateCustomerDisplayPrice(rawReg, catConfig).customerDisplayPrice;

    const seller = sellerMap.get(String(p.sellerId));
    const shopMeta = seller
      ? getShopStatusMeta(seller)
      : { isOpen: false, statusLabel: "Closed", reason: "Store unavailable" };

    const updatedVariants = (p.variants || []).map((v) => {
      const vSale = Number(v.salePrice || v.price || 0);
      const vReg = Number(v.price || v.salePrice || 0);
      return {
        ...v,
        sellerBasePrice: vSale,
        salePrice: calculateCustomerDisplayPrice(vSale, catConfig).customerDisplayPrice,
        price: calculateCustomerDisplayPrice(vReg, catConfig).customerDisplayPrice,
      };
    });

    return {
      ...item,
      productId: {
        ...p,
        isStoreOpen: shopMeta.isOpen,
        storeStatusMeta: shopMeta,
        sellerBasePrice: rawSale,
        salePrice: saleDisplay,
        price: regDisplay,
        variants: updatedVariants,
      },
    };
  });

  return cart;
}

async function getCustomerVisibleProductById(productId) {
  if (!productId) return null;
  return Product.findOne({
    _id: productId,
    ...CUSTOMER_VISIBLE_PRODUCT_MATCH,
  })
    .select("_id sellerId")
    .lean();
}

async function fetchPopulatedCart(cartId) {
  const cart = await Cart.findById(cartId)
    .populate({
      path: "items.productId",
      select: CART_POPULATE_FIELDS,
      match: CUSTOMER_VISIBLE_PRODUCT_MATCH,
    })
    .lean();

  return await sanitizeCartItems(cart);
}

/* ===============================
   GET CUSTOMER CART
================================ */
export const getCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    let cart = await Cart.findOne({ customerId })
      .populate({
        path: "items.productId",
        select: CART_POPULATE_FIELDS,
        match: CUSTOMER_VISIBLE_PRODUCT_MATCH,
      })
      .lean();

    if (!cart) {
      const newCart = await Cart.create({ customerId, items: [] });
      return handleResponse(res, 200, "Cart fetched successfully", newCart);
    }

    return handleResponse(res, 200, "Cart fetched successfully", await sanitizeCartItems(cart));
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADD TO CART
================================ */
export const addToCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId, quantity = 1, variantSku = "" } = req.body;
    const normalizedVariantSku = String(variantSku || "").trim();
    const customerVisibleProduct = await getCustomerVisibleProductById(productId);
    const fullProductDoc = await Product.findById(productId).select("stock status sellerId").lean();
    if (!fullProductDoc || fullProductDoc.status !== "active" || Number(fullProductDoc.stock || 0) <= 0) {
      return handleResponse(res, 400, "This product is currently out of stock or unavailable.");
    }

    const coords = parseCustomerCoordinates(req.body.lat ? req.body : req.query);
    if (coords.valid) {
      const nearbySellerIds = await getNearbySellerIdsForCustomer(coords.lat, coords.lng);
      const sellerIdStr = String(customerVisibleProduct.sellerId?._id || customerVisibleProduct.sellerId);
      if (!nearbySellerIds.includes(sellerIdStr)) {
        return handleResponse(res, 400, "This product is not available in your delivery location.");
      }
    }

    const seller = await Seller.findById(customerVisibleProduct.sellerId)
      .select("_id shopName shopTiming manualOverride isActive applicationStatus")
      .lean();
    if (!seller || !isShopCurrentlyOpen(seller)) {
      const shopMeta = seller ? getShopStatusMeta(seller) : { reason: "Store closed" };
      return handleResponse(
        res,
        400,
        `The shop "${seller?.shopName || "Store"}" is currently offline or closed. Items cannot be added right now.`,
      );
    }

    let cart = await Cart.findOne({ customerId });

    if (!cart) {
      cart = new Cart({ customerId, items: [] });
    }

    const itemIndex = cart.items.findIndex(
      (item) =>
        item.productId.toString() === productId &&
        String(item.variantSku || "").trim() === normalizedVariantSku,
    );

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += quantity;
    } else {
      cart.items.push({ productId, variantSku: normalizedVariantSku, quantity });
    }

    await cart.save();
    const updatedCart = await fetchPopulatedCart(cart._id);

    return handleResponse(res, 200, "Item added to cart", updatedCart);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE QUANTITY
================================ */
export const updateQuantity = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId, quantity, variantSku = "" } = req.body;
    const normalizedVariantSku = String(variantSku || "").trim();

    let cart = await Cart.findOne({ customerId });

    if (!cart) {
      return handleResponse(res, 404, "Cart not found");
    }

    const itemIndex = cart.items.findIndex((item) => {
      if (!item || !item.productId) return false;
      const itemProductId = item.productId._id ? item.productId._id.toString() : item.productId.toString();
      return (
        itemProductId === productId &&
        String(item.variantSku || "").trim() === normalizedVariantSku
      );
    });

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity = quantity;
      if (cart.items[itemIndex].quantity <= 0) {
        cart.items.splice(itemIndex, 1);
      }
    } else {
      return handleResponse(res, 404, "Product not in cart");
    }

    cart.markModified("items");
    await cart.save();
    const updatedCart = await fetchPopulatedCart(cart._id);

    return handleResponse(res, 200, "Cart updated successfully", updatedCart);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REMOVE FROM CART
================================ */
export const removeFromCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId } = req.params;
    const normalizedVariantSku = String(req.query?.variantSku || "").trim();

    let cart = await Cart.findOne({ customerId });

    if (!cart) {
      return handleResponse(res, 404, "Cart not found");
    }

    console.log("Removing item from cart:", { productId, normalizedVariantSku });
    let removedCount = 0;
    
    // Iterate backwards so splice doesn't affect remaining indices
    for (let i = cart.items.length - 1; i >= 0; i--) {
      const item = cart.items[i];
      let shouldRemove = false;
      
      if (!item || !item.productId) continue;
      const itemProductId = item.productId._id ? item.productId._id.toString() : item.productId.toString();
      
      if (itemProductId === productId) {
        if (normalizedVariantSku) {
          if (String(item.variantSku || "").trim() === normalizedVariantSku) {
            shouldRemove = true;
          }
        } else {
          // If no variantSku is provided, remove all lines for that product
          shouldRemove = true;
        }
      }
      
      if (shouldRemove) {
        cart.items.splice(i, 1);
        removedCount++;
      }
    }
    
    console.log("Items removed:", removedCount);

    cart.markModified("items");
    await cart.save();
    const updatedCart = await fetchPopulatedCart(cart._id);

    return handleResponse(res, 200, "Item removed from cart", updatedCart);
  } catch (error) {
    import('fs').then(fs => fs.writeFileSync('backend_error.log', error.stack || error.message || String(error)));
    console.error("removeFromCart ERROR:", error);
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   CLEAR CART
================================ */
export const clearCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    let cart = await Cart.findOne({ customerId });

    if (cart) {
      cart.items = [];
      await cart.save();
    }

    return handleResponse(res, 200, "Cart cleared successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

import Product from "../../models/product.js";
import Category from "../../models/category.js";
import Seller from "../../models/seller.js";
import { isShopCurrentlyOpen } from "../shopTimingService.js";
import {
  PRODUCT_APPROVAL_STATUS,
  resolveProductApprovalStatus,
} from "../productModerationService.js";
import {
  COMMISSION_FIXED_RULE,
  COMMISSION_TYPE,
  DELIVERY_PRICING_MODE,
  HANDLING_FEE_STRATEGY,
  HANDLING_FEE_TYPE,
  isWalletRedemptionReducesPayableEnabled,
} from "../../constants/finance.js";
import {
  addMoney,
  ceilKm,
  clampMoney,
  percentOf,
  roundCurrency,
} from "../../utils/money.js";
import { getOrCreateFinanceSettings } from "./financeSettingsService.js";

function toObjectIdString(value) {
  if (!value) return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function normalizeLineQuantity(quantity) {
  const q = Number(quantity || 0);
  if (!Number.isFinite(q) || q <= 0) return 1;
  return Math.floor(q);
}

function normalizeLinePrice(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? clampMoney(amount, 0) : 0;
}

function resolveCommissionConfig(category) {
  if (!category) {
    return {
      type: COMMISSION_TYPE.PERCENTAGE,
      value: 0,
      fixedRule: COMMISSION_FIXED_RULE.PER_QTY,
    };
  }

  const type = category.adminCommissionType || COMMISSION_TYPE.PERCENTAGE;

  // Backward-compat: admin UI still writes legacy `adminCommission` while newer
  // pricing reads `adminCommissionValue`. Because `adminCommissionValue` has a
  // schema default of 0 and updates can bypass save hooks, we treat a zero
  // `adminCommissionValue` as "unset" when legacy is non-zero.
  const legacyAdminCommission = Number(category.adminCommission ?? 0);
  const primaryAdminCommission = Number(category.adminCommissionValue);
  const resolvedRaw =
    category.adminCommissionValue == null ||
    (!Number.isFinite(primaryAdminCommission) ||
      (primaryAdminCommission === 0 && legacyAdminCommission > 0))
      ? legacyAdminCommission
      : primaryAdminCommission;
  const value = Number(resolvedRaw ?? 0);
  const fixedRule =
    category.adminCommissionFixedRule || COMMISSION_FIXED_RULE.PER_QTY;

  return {
    type,
    value: Number.isFinite(value) ? Math.max(value, 0) : 0,
    fixedRule,
  };
}

function resolveHandlingConfig(category) {
  if (!category) {
    return { type: HANDLING_FEE_TYPE.NONE, value: 0 };
  }

  const type =
    category.handlingFeeType ||
    (Number(category.handlingFees || 0) > 0
      ? HANDLING_FEE_TYPE.FIXED
      : HANDLING_FEE_TYPE.NONE);

  // Backward-compat: admin UI writes legacy `handlingFees` while pricing reads
  // `handlingFeeValue`. Since `handlingFeeValue` defaults to 0, treat it as
  // unset when legacy is non-zero.
  const legacyHandlingFees = Number(category.handlingFees ?? 0);
  const primaryHandlingValue = Number(category.handlingFeeValue);
  const resolvedRaw =
    category.handlingFeeValue == null ||
    (!Number.isFinite(primaryHandlingValue) ||
      (primaryHandlingValue === 0 && legacyHandlingFees > 0))
      ? legacyHandlingFees
      : primaryHandlingValue;
  const value = Number(resolvedRaw ?? 0);

  return {
    type,
    value: Number.isFinite(value) ? Math.max(value, 0) : 0,
  };
}

export function calculateProductSubtotal(items = []) {
  return roundCurrency(
    items.reduce((sum, item) => {
      const quantity = normalizeLineQuantity(item.quantity);
      const unitPrice = normalizeLinePrice(item.price);
      return sum + unitPrice * quantity;
    }, 0),
  );
}

export function calculateCustomerDisplayPrice(sellerBasePrice, categoryConfig) {
  const basePrice = Math.max(0, Number(sellerBasePrice || 0));
  if (basePrice === 0) {
    return {
      sellerBasePrice: 0,
      commissionAmount: 0,
      handlingFeeAmount: 0,
      customerDisplayPrice: 0,
    };
  }

  // 1. Commission percentage on base price (default 5% if category has no custom commission)
  const { type: commType, value: commVal } = resolveCommissionConfig(categoryConfig);
  const commissionRate = (commVal && commVal > 0) ? commVal : 5;
  let commissionAmount = 0;
  if (commType === COMMISSION_TYPE.PERCENTAGE) {
    commissionAmount = percentOf(basePrice, commissionRate);
  } else {
    commissionAmount = roundCurrency(commissionRate);
  }

  // 2. Handling Fee in Rupees (₹)
  const { value: handVal } = resolveHandlingConfig(categoryConfig);
  const handlingFeeAmount = roundCurrency(handVal || 0);

  // 3. Customer Display Price = Seller Base Price + Commission (%) + Handling Fee (₹)
  const customerPrice = roundCurrency(basePrice + commissionAmount + handlingFeeAmount);
  return {
    sellerBasePrice: basePrice,
    commissionAmount,
    handlingFeeAmount,
    customerDisplayPrice: customerPrice,
  };
}

export function calculateCategoryCommission(item, categoryConfig) {
  const quantity = normalizeLineQuantity(item.quantity);
  const itemSubtotal = roundCurrency(normalizeLinePrice(item.price) * quantity);
  const { type, value, fixedRule } = resolveCommissionConfig(categoryConfig);

  let adminCommission = 0;
  if (type === COMMISSION_TYPE.PERCENTAGE) {
    adminCommission = percentOf(itemSubtotal, value);
  } else {
    const fixedBase =
      fixedRule === COMMISSION_FIXED_RULE.PER_ITEM ? value : value * quantity;
    adminCommission = roundCurrency(fixedBase);
  }

  adminCommission = clampMoney(adminCommission, 0, itemSubtotal);
  const sellerPayout = roundCurrency(itemSubtotal - adminCommission);

  return {
    itemSubtotal,
    adminCommission,
    sellerPayout,
    appliedCommissionType: type,
    appliedCommissionValue: value,
    appliedFixedRule: fixedRule,
  };
}

function calculateHandlingForCategory({ type, value }, categorySubtotal) {
  if (type === HANDLING_FEE_TYPE.NONE) return 0;
  if (type === HANDLING_FEE_TYPE.PERCENTAGE) {
    return percentOf(categorySubtotal, value);
  }
  return roundCurrency(value);
}

export function calculateHandlingFee(cartItems, options = {}) {
  const {
    handlingFeeStrategy = HANDLING_FEE_STRATEGY.HIGHEST_CATEGORY_FEE,
    categoryById = new Map(),
  } = options;

  const categorySubtotalMap = new Map();
  for (const item of cartItems) {
    const headerId = toObjectIdString(item.headerCategoryId);
    const itemSubtotal = roundCurrency(normalizeLinePrice(item.price) * normalizeLineQuantity(item.quantity));
    categorySubtotalMap.set(headerId, addMoney(categorySubtotalMap.get(headerId) || 0, itemSubtotal));
  }

  const categoryFees = [];
  for (const [headerId, subtotal] of categorySubtotalMap.entries()) {
    const category = categoryById.get(headerId);
    const handling = resolveHandlingConfig(category);
    const fee = calculateHandlingForCategory(handling, subtotal);
    categoryFees.push({
      headerCategoryId: headerId || null,
      categoryName: category?.name || "Unknown",
      subtotal,
      handlingFeeType: handling.type,
      handlingFeeValue: handling.value,
      computedFee: roundCurrency(fee),
    });
  }

  let totalHandlingFee = 0;
  let handlingCategoryUsed = null;

  if (categoryFees.length === 0) {
    totalHandlingFee = 0;
  } else if (handlingFeeStrategy === HANDLING_FEE_STRATEGY.SUM_OF_CATEGORY_FEES) {
    totalHandlingFee = categoryFees.reduce((sum, row) => addMoney(sum, row.computedFee), 0);
  } else if (handlingFeeStrategy === HANDLING_FEE_STRATEGY.PER_ITEM_FEE) {
    totalHandlingFee = cartItems.reduce((sum, item) => {
      const headerId = toObjectIdString(item.headerCategoryId);
      const category = categoryById.get(headerId);
      const handling = resolveHandlingConfig(category);
      const quantity = normalizeLineQuantity(item.quantity);
      const itemSubtotal = roundCurrency(normalizeLinePrice(item.price) * quantity);
      const perLine =
        handling.type === HANDLING_FEE_TYPE.FIXED
          ? roundCurrency(handling.value * quantity)
          : calculateHandlingForCategory(handling, itemSubtotal);
      return addMoney(sum, perLine);
    }, 0);
  } else {
    const maxCategory = categoryFees.reduce((best, row) =>
      row.computedFee > (best?.computedFee || 0) ? row : best,
    );
    totalHandlingFee = roundCurrency(maxCategory?.computedFee || 0);
    handlingCategoryUsed = maxCategory || null;
  }

  if (!handlingCategoryUsed && categoryFees.length > 0) {
    handlingCategoryUsed = categoryFees
      .slice()
      .sort((a, b) => b.computedFee - a.computedFee)[0];
  }

  return {
    handlingFeeCharged: roundCurrency(totalHandlingFee),
    handlingFeeStrategy,
    handlingCategoryUsed,
    categoryFees,
  };
}

export function determineProductGST(productName = "", categoryName = "", subcategoryName = "") {
  const name = String(productName).toLowerCase().trim();
  const cat = String(categoryName).toLowerCase().trim();
  const sub = String(subcategoryName).toLowerCase().trim();
  const text = `${name} ${cat} ${sub}`;

  if (/coca[\s-]*cola|pepsi|sprite|thums[\s-]*up|mountain[\s-]*dew|fanta|7up|seven[\s-]*up|carbonated|aerated|energy[\s-]*drink|red[\s-]*bull|monster[\s-]*energy|deodorant|perfume|cologne|body[\s-]*spray/.test(text)) return 28;
  if (/fresh[\s-]*fruit|fresh[\s-]*veg|apple|banana|mango|orange|grape|papaya|guava|potato|tomato|onion|spinach|cucumber|carrot|brinjal|cauliflower|cabbage|fresh[\s-]*milk|fresh[\s-]*curd|lassi|buttermilk|fresh[\s-]*poultry|fresh[\s-]*meat|fresh[\s-]*fish|egg|unbranded[\s-]*rice|unbranded[\s-]*atta|common[\s-]*salt/.test(text)) return 0;
  if (/rice|atta|flour|wheat|dal|pulses|besan|suji|maida|oats|poha|edible[\s-]*oil|mustard[\s-]*oil|sunflower[\s-]*oil|groundnut[\s-]*oil|olive[\s-]*oil|ghee|tea|chai|coffee|sugar|salt|turmeric|chilli|coriander|cumin|jeera|garam[\s-]*masala|spice|masala|almond|cashew|raisin|walnut|pistachio|dates|dry[\s-]*fruit|rusk|biscuit|frozen[\s-]*peas|frozen[\s-]*veg|t[\s-]*shirt|shirt|apparel|clothing/.test(text)) return 5;
  if (/juice|real|tropicana|jam|jelly|ketchup|sauce|pickle|pickle|cheese|butter|condensed[\s-]*milk|ayurvedic|chyawanprash|cough[\s-]*syrup|stationery|notebook|pen|pencil|paper|namkeen|bhujia|ready[\s-]*to[\s-]*eat/.test(text)) return 12;
  if (/soap|shampoo|conditioner|hair[\s-]*oil|face[\s-]*wash|lotion|cream|toothpaste|brush|detergent|surf|washing[\s-]*powder|dishwash|vim|harpic|cleaner|sanitary|pad|diaper|chocolate|dairy[\s-]*milk|kitkat|snickers|wafer|cake|chewing[\s-]*gum|electronic|headphone|earphone|charger|cable|battery|mobile|laptop/.test(text)) return 18;
  return 5;
}

export function calculateCustomerDeliveryFee(distanceKm, deliverySettings) {
  const mode =
    deliverySettings.deliveryPricingMode || DELIVERY_PRICING_MODE.DISTANCE_BASED;
  const actualDistance = Number(distanceKm || 0);
  const normalizedDistance = Number.isFinite(actualDistance)
    ? Math.max(actualDistance, 0)
    : 0;

  const rawBaseFee = Number(deliverySettings.customerBaseDeliveryFee ?? deliverySettings.fixedDeliveryFee ?? 0);
  const baseFee = roundCurrency(rawBaseFee > 0 ? rawBaseFee : 30);

  if (mode === DELIVERY_PRICING_MODE.FIXED_PRICE) {
    const fixedFee = baseFee;
    return {
      deliveryFeeCharged: fixedFee,
      distanceKmActual: normalizedDistance,
      distanceKmRounded: roundCurrency(normalizedDistance),
      roundedExtraKm: 0,
      mode,
      baseFee: fixedFee,
      extraFee: 0,
    };
  }

  const baseDistance = Math.max(Number(deliverySettings.baseDistanceCapacityKm || 0), 0);
  const surcharge = roundCurrency(deliverySettings.incrementalKmSurcharge ?? 0);

  if (normalizedDistance <= baseDistance) {
    return {
      deliveryFeeCharged: baseFee,
      distanceKmActual: normalizedDistance,
      distanceKmRounded: roundCurrency(baseDistance),
      roundedExtraKm: 0,
      mode,
      baseFee,
      extraFee: 0,
    };
  }

  const extraKm = normalizedDistance - baseDistance;
  const roundedExtraKm = ceilKm(extraKm);
  const extraFee = roundCurrency(roundedExtraKm * surcharge);
  const total = addMoney(baseFee, extraFee);

  return {
    deliveryFeeCharged: total,
    distanceKmActual: normalizedDistance,
    distanceKmRounded: roundCurrency(baseDistance + roundedExtraKm),
    roundedExtraKm,
    mode,
    baseFee,
    extraFee,
  };
}

export function calculateRiderPayout(distanceKm, deliverySettings) {
  const mode =
    deliverySettings.deliveryPricingMode || DELIVERY_PRICING_MODE.DISTANCE_BASED;
  const actualDistance = Number(distanceKm || 0);
  const normalizedDistance = Number.isFinite(actualDistance)
    ? Math.max(actualDistance, 0)
    : 0;

  const riderBase = roundCurrency(deliverySettings.riderBasePayout ?? deliverySettings.customerBaseDeliveryFee ?? 0);
  const baseDistance = Math.max(Number(deliverySettings.baseDistanceCapacityKm || 0), 0);
  const perExtraKm = roundCurrency(deliverySettings.deliveryPartnerRatePerKm ?? 0);

  if (mode === DELIVERY_PRICING_MODE.FIXED_PRICE || normalizedDistance <= baseDistance) {
    return {
      riderPayoutBase: riderBase,
      riderPayoutDistance: 0,
      riderPayoutBonus: 0,
      riderPayoutTotal: riderBase,
      roundedExtraKm: 0,
    };
  }

  const extraKm = normalizedDistance - baseDistance;
  const roundedExtraKm = ceilKm(extraKm);
  const riderDistance = roundCurrency(roundedExtraKm * perExtraKm);
  const riderTotal = addMoney(riderBase, riderDistance);

  return {
    riderPayoutBase: riderBase,
    riderPayoutDistance: riderDistance,
    riderPayoutBonus: 0,
    riderPayoutTotal: riderTotal,
    roundedExtraKm,
  };
}

export async function hydrateOrderItems(
  orderItems = [],
  { session = null, enforceServerPricing = true } = {},
) {
  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    return [];
  }

  const productIds = orderItems
    .map((item) => item.product || item.productId || item._id || item.id)
    .filter(Boolean);

  const productQuery = Product.find({ _id: { $in: productIds } })
    .select("_id name salePrice price mainImage headerId categoryId sellerId status approvalStatus variants gstTax")
    .lean();
  if (session) productQuery.session(session);
  const products = await productQuery;

  const productMap = new Map(products.map((product) => [String(product._id), product]));
  
  const sellerIds = [...new Set(products.map((p) => String(p.sellerId)).filter(Boolean))];
  const sellers = await Seller.find({ _id: { $in: sellerIds } }).select("_id isActive shopName shopTiming applicationStatus").lean();
  const sellerMap = new Map(sellers.map((s) => [String(s._id), s]));

  const categoryIds = [...new Set(products.map((p) => String(p.headerId || p.categoryId)).filter(Boolean))];
  const categoryDocs = await Category.find({ _id: { $in: categoryIds } })
    .select("_id name adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule handlingFees handlingFeeType handlingFeeValue")
    .lean();
  const categoryMap = new Map(categoryDocs.map((c) => [String(c._id), c]));

  return orderItems.map((item) => {
    const productId = String(item.product || item.productId || item._id || item.id);
    const product = productMap.get(productId);
    if (!product) {
      throw new Error(`Product not found for line item: ${productId}`);
    }
    const seller = sellerMap.get(String(product.sellerId));
    if (!seller || !isShopCurrentlyOpen(seller)) {
      const err = new Error(`The shop "${seller?.shopName || "Seller"}" is currently closed and not accepting orders.`);
      err.statusCode = 400;
      throw err;
    }
    if (product.status !== "active") {
      throw new Error(`Product is not available for purchase: ${product.name}`);
    }
    if (resolveProductApprovalStatus(product) !== PRODUCT_APPROVAL_STATUS.APPROVED) {
      throw new Error(`Product is not approved for purchase: ${product.name}`);
    }

    const rawVariantSku = String(item.variantSku || item.variantSlot || "").trim();
    let resolvedVariant = null;
    if (rawVariantSku) {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      resolvedVariant =
        variants.find((v) => String(v?.sku || "").trim() === rawVariantSku) ||
        variants.find((v) => String(v?.name || "").trim() === rawVariantSku) ||
        null;
      if (!resolvedVariant) {
        const err = new Error(`Invalid variant for product: ${product.name}`);
        err.statusCode = 400;
        throw err;
      }
    }

    const quantity = normalizeLineQuantity(item.quantity);
    const rawSellerUnitPrice = normalizeLinePrice(
      resolvedVariant
        ? resolvedVariant.salePrice || resolvedVariant.price || product.salePrice || product.price
        : product.salePrice || product.price,
    );

    const categoryConfig = categoryMap.get(String(product.headerId)) || categoryMap.get(String(product.categoryId)) || null;
    const customerDisplayUnitPrice = calculateCustomerDisplayPrice(rawSellerUnitPrice, categoryConfig).customerDisplayPrice;

    const inferredUnitPrice = enforceServerPricing
      ? customerDisplayUnitPrice
      : normalizeLinePrice(item.price) || customerDisplayUnitPrice;

    const resolvedGstRate = (product.gstTax !== undefined && product.gstTax !== null && Number(product.gstTax) > 0)
      ? Number(product.gstTax)
      : determineProductGST(product.name || '', categoryConfig?.name || '');

    return {
      productId,
      productName: item.name || product.name,
      quantity,
      price: inferredUnitPrice,
      sellerBasePrice: rawSellerUnitPrice,
      gstTax: resolvedGstRate,
      image: item.image || product.mainImage,
      headerCategoryId: String(product.headerId),
      sellerId: String(product.sellerId),
      variantSku: rawVariantSku || "",
      variantName: resolvedVariant ? String(resolvedVariant?.name || "").trim() : "",
    };
  });
}

export async function generateOrderPaymentBreakdown({
  items = [],
  preHydratedItems = null,
  distanceKm = 0,
  distanceSource = "haversine",
  discountTotal = 0,
  taxTotal = 0,
  tipTotal = 0,
  // Audit Phase 4 (C-1): per-seller proportionate wallet redemption. The
  // checkout-group-level walletAmount is split by subtotal-ratio in
  // `buildCheckoutPricingSnapshot` before reaching this function. When the
  // `WALLET_REDEMPTION_REDUCES_PAYABLE` env flag is on, this amount is
  // subtracted from `grandTotal` so that the customer is asked to pay
  // (online or COD) only the post-wallet amount. When the flag is off the
  // value is still persisted (for visibility) but `grandTotal` keeps the
  // legacy pre-wallet value so existing flows are bit-for-bit unchanged.
  walletAmount = 0,
  deliverySettings,
  handlingFeeStrategy,
  session = null,
}) {
  const normalizedItems = Array.isArray(preHydratedItems) && preHydratedItems.length > 0
    ? preHydratedItems
    : await hydrateOrderItems(items, { session, enforceServerPricing: true });
  if (normalizedItems.length === 0) {
    throw new Error("Cart is empty");
  }

  const sellerIds = Array.from(new Set(normalizedItems.map((item) => item.sellerId)));
  if (sellerIds.length > 1) {
    throw new Error("Multi-seller checkout is not supported in current flow");
  }

  const headerIds = Array.from(
    new Set(normalizedItems.map((item) => item.headerCategoryId).filter(Boolean)),
  );

  const categoryQuery = Category.find({ _id: { $in: headerIds } })
    .select(
      "_id name adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule handlingFees handlingFeeType handlingFeeValue",
    )
    .lean();
  if (session) categoryQuery.session(session);
  const categories = await categoryQuery;
  const categoryById = new Map(categories.map((category) => [String(category._id), category]));

  const effectiveSettings =
    deliverySettings || (await getOrCreateFinanceSettings());
  const effectiveHandlingStrategy =
    handlingFeeStrategy || effectiveSettings.handlingFeeStrategy;

  let productSubtotal = 0;
  let sellerPayoutTotal = 0;
  let adminProductCommissionTotal = 0;
  let totalGstAmount = 0;

  const lineItems = normalizedItems.map((item) => {
    const category = categoryById.get(String(item.headerCategoryId));
    const commission = calculateCategoryCommission(item, category);
    const lineGstRate = Number(item.gstTax || 0);
    const lineGstAmount = roundCurrency((commission.itemSubtotal * lineGstRate) / 100);
    totalGstAmount = addMoney(totalGstAmount, lineGstAmount);

    productSubtotal = addMoney(productSubtotal, commission.itemSubtotal);
    sellerPayoutTotal = addMoney(sellerPayoutTotal, commission.sellerPayout);
    adminProductCommissionTotal = addMoney(
      adminProductCommissionTotal,
      commission.adminCommission,
    );

    return {
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.price,
      itemSubtotal: commission.itemSubtotal,
      sellerPayout: commission.sellerPayout,
      adminProductCommission: commission.adminCommission,
      gstTax: lineGstRate,
      gstAmount: lineGstAmount,
      headerCategoryId: item.headerCategoryId,
      headerCategoryName: category?.name || "Unknown",
      appliedCommissionType: commission.appliedCommissionType,
      appliedCommissionValue: commission.appliedCommissionValue,
      appliedFixedRule: commission.appliedFixedRule,
    };
  });

  const handling = calculateHandlingFee(normalizedItems, {
    handlingFeeStrategy: effectiveHandlingStrategy,
    categoryById,
  });
  const delivery = calculateCustomerDeliveryFee(distanceKm, effectiveSettings);
  const rider = calculateRiderPayout(distanceKm, effectiveSettings);

  const normalizedDiscount = roundCurrency(discountTotal || 0);
  const normalizedTax = totalGstAmount > 0 ? roundCurrency(totalGstAmount) : roundCurrency(taxTotal || 0);
  const normalizedTip = roundCurrency(tipTotal || 0);
  const normalizedWallet = roundCurrency(walletAmount || 0);

  const grossTotal = roundCurrency(
    productSubtotal +
      delivery.deliveryFeeCharged +
      normalizedTax -
      normalizedDiscount +
      normalizedTip,
  );

  // Audit Phase 4 (C-1): subtract wallet redemption only when the flag is on.
  // The wallet amount is clamped to [0, grossTotal] so a malformed input
  // cannot drive grandTotal negative. We keep `grossTotal` for the new
  // `payableAmount` field below — clients that want the pre-wallet number
  // can still read `grossTotal` while migrating UIs.
  const walletAllocation = isWalletRedemptionReducesPayableEnabled()
    ? Math.min(normalizedWallet, grossTotal)
    : 0;
  const grandTotal = roundCurrency(grossTotal - walletAllocation);

  const riderTipAmount = normalizedTip;
  const riderPayoutTotal = roundCurrency(
    rider.riderPayoutBase +
      rider.riderPayoutDistance +
      rider.riderPayoutBonus +
      riderTipAmount,
  );

  const platformLogisticsMargin = roundCurrency(
    delivery.deliveryFeeCharged +
      handling.handlingFeeCharged -
      (rider.riderPayoutBase + rider.riderPayoutDistance + rider.riderPayoutBonus),
  );
  const platformTotalEarning = roundCurrency(
    adminProductCommissionTotal + platformLogisticsMargin,
  );

  const snapshots = {
    deliverySettings: {
      ...effectiveSettings,
      distanceSource,
    },
    categoryCommissionSettings: categories.map((category) => ({
      headerCategoryId: String(category._id),
      headerCategoryName: category.name,
      adminCommissionType:
        category.adminCommissionType || COMMISSION_TYPE.PERCENTAGE,
      adminCommissionValue: resolveCommissionConfig(category).value,
      adminCommissionFixedRule:
        category.adminCommissionFixedRule || COMMISSION_FIXED_RULE.PER_QTY,
      handlingFeeType:
        category.handlingFeeType || HANDLING_FEE_TYPE.FIXED,
      handlingFeeValue: resolveHandlingConfig(category).value,
    })),
    handlingFeeStrategy: effectiveHandlingStrategy,
    handlingCategoryUsed: handling.handlingCategoryUsed,
  };

  return {
    sellerId: sellerIds[0],
    lineItems,
    currency: "INR",
    productSubtotal,
    deliveryFeeCharged: delivery.deliveryFeeCharged,
    handlingFeeCharged: 0,
    tipTotal: normalizedTip,
    discountTotal: normalizedDiscount,
    taxTotal: normalizedTax,
    // Audit Phase 4 (C-1):
    //   - `grossTotal`: pre-wallet customer-payable amount. New field —
    //     legacy callers ignore it.
    //   - `grandTotal`: post-wallet amount when the flag is on (the actual
    //     amount PhonePe charges / rider collects); equals `grossTotal`
    //     when the flag is off (legacy behaviour preserved).
    //   - `walletAmount`: per-seller proportionate wallet redemption.
    //   - `payableAmount`: alias of `grandTotal` for the post-C-1 world,
    //     surfaced separately so the frontend can stop subtracting
    //     `walletAmount` from `grandTotal` once the flag is on.
    grossTotal,
    grandTotal,
    walletAmount: walletAllocation,
    payableAmount: grandTotal,
    sellerPayoutTotal,
    adminProductCommissionTotal,
    riderPayoutBase: rider.riderPayoutBase,
    riderPayoutDistance: rider.riderPayoutDistance,
    riderPayoutBonus: rider.riderPayoutBonus,
    riderTipAmount,
    riderPayoutTotal,
    platformLogisticsMargin,
    platformTotalEarning,
    codCollectedAmount: 0,
    codRemittedAmount: 0,
    codPendingAmount: 0,
    distanceKmActual: delivery.distanceKmActual,
    distanceKmRounded: delivery.distanceKmRounded,
    snapshots,
  };
}

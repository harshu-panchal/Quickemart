import Product from "../models/product.js";
import Category from "../models/category.js";

const ELECTRONICS_KEYWORDS_REGEX =
  /electronic|electrical|gadget|laptop|mobile|smartphone|computer|appliance|headphone|earphone|camera|smart\s*watch|power\s*bank|charger|television|\btv\b|refrigerator|air\s*conditioner|microwave|oven|\biron\b|\bkettle\b/i;

/**
 * Checks if a collection of order items contains any electronic products.
 *
 * @param {Array} items - Array of items from cart or order (having productId or product or _id)
 * @param {Object} options - Optional parameters { session }
 * @returns {Promise<{ hasElectronics: boolean, electronicsCount: number, electronicsItems: Array }>}
 */
export async function checkOrderHasElectronics(items = [], options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return { hasElectronics: false, electronicsCount: 0, electronicsItems: [] };
  }

  const productIds = [
    ...new Set(
      items
        .map((it) => it?.productId || it?.product || it?.id || it?._id)
        .filter(Boolean)
        .map((id) => String(id))
    ),
  ];

  if (productIds.length === 0) {
    return { hasElectronics: false, electronicsCount: 0, electronicsItems: [] };
  }

  const productsQuery = Product.find({ _id: { $in: productIds } })
    .select("name tags headerId categoryId subcategoryId")
    .lean();

  if (options.session) {
    productsQuery.session(options.session);
  }

  const products = await productsQuery;
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  // Collect category IDs to inspect
  const categoryIds = new Set();
  products.forEach((p) => {
    if (p.headerId) categoryIds.add(String(p.headerId));
    if (p.categoryId) categoryIds.add(String(p.categoryId));
    if (p.subcategoryId) categoryIds.add(String(p.subcategoryId));
  });

  const categoriesQuery = Category.find({
    $or: [
      { _id: { $in: Array.from(categoryIds) } },
      { slug: "electronics" },
      { name: /electronics/i },
    ],
  })
    .select("_id name slug parentId")
    .lean();

  if (options.session) {
    categoriesQuery.session(options.session);
  }

  const categories = await categoriesQuery;
  const categoryMap = new Map(categories.map((c) => [String(c._id), c]));

  // Find root electronics category IDs
  const electronicsCategoryIds = new Set();
  categories.forEach((cat) => {
    const isElec =
      cat.slug === "electronics" ||
      ELECTRONICS_KEYWORDS_REGEX.test(cat.name || "") ||
      ELECTRONICS_KEYWORDS_REGEX.test(cat.slug || "");

    if (isElec) {
      electronicsCategoryIds.add(String(cat._id));
    }
  });

  // Also include any subcategories whose parent is an electronics category
  categories.forEach((cat) => {
    if (cat.parentId && electronicsCategoryIds.has(String(cat.parentId))) {
      electronicsCategoryIds.add(String(cat._id));
    }
  });

  const electronicsItems = [];

  for (const item of items) {
    const pid = String(item?.productId || item?.product || item?.id || item?._id || "");
    const prod = productMap.get(pid);
    if (!prod) continue;

    const header = prod.headerId ? categoryMap.get(String(prod.headerId)) : null;
    const cat = prod.categoryId ? categoryMap.get(String(prod.categoryId)) : null;
    const subcat = prod.subcategoryId ? categoryMap.get(String(prod.subcategoryId)) : null;

    const isMatch =
      (prod.headerId && electronicsCategoryIds.has(String(prod.headerId))) ||
      (prod.categoryId && electronicsCategoryIds.has(String(prod.categoryId))) ||
      (prod.subcategoryId && electronicsCategoryIds.has(String(prod.subcategoryId))) ||
      (header && (ELECTRONICS_KEYWORDS_REGEX.test(header.name || "") || ELECTRONICS_KEYWORDS_REGEX.test(header.slug || ""))) ||
      (cat && (ELECTRONICS_KEYWORDS_REGEX.test(cat.name || "") || ELECTRONICS_KEYWORDS_REGEX.test(cat.slug || ""))) ||
      (subcat && (ELECTRONICS_KEYWORDS_REGEX.test(subcat.name || "") || ELECTRONICS_KEYWORDS_REGEX.test(subcat.slug || ""))) ||
      (Array.isArray(prod.tags) && prod.tags.some((t) => ELECTRONICS_KEYWORDS_REGEX.test(t))) ||
      ELECTRONICS_KEYWORDS_REGEX.test(prod.name || "");

    if (isMatch) {
      electronicsItems.push({
        productId: prod._id,
        name: prod.name,
        categoryName: cat?.name || header?.name || "Electronics",
      });
    }
  }

  const hasElectronics = electronicsItems.length > 0;

  return {
    hasElectronics,
    electronicsCount: electronicsItems.length,
    electronicsItems,
  };
}

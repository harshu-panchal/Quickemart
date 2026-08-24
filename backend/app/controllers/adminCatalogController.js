import MasterProduct from "../models/masterProduct.js";
import Product from "../models/product.js";
import Category from "../models/category.js";
import CatalogImportTask from "../models/catalogImportTask.js";
import xlsx from "xlsx";
import ExcelJS from "exceljs";
import axios from "axios";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { downloadExternalImage } from "../utils/localStorage.js";
import { slugify } from "../utils/slugify.js"; // assumes standard slugify exists
import { invalidate, buildKey } from "../services/cacheService.js";

// Downloads an image from an external URL (Excel row) and persists it to
// local storage. Throws with a descriptive message on failure so callers
// can attach a row-specific error instead of silently swallowing it.
const uploadImageFromUrl = async (imageUrl) => {
    if (!imageUrl) return null;
    return downloadExternalImage(imageUrl, 'master-catalog');
};

const generateUniqueCategorySlug = async (baseName) => {
    let baseSlug = slugify(baseName);
    let slug = baseSlug;
    let count = 1;
    while (await Category.findOne({ slug })) {
        slug = `${baseSlug}-${count}`;
        count++;
    }
    return slug;
};

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Simple concurrency-limited pool runner: processes `items` with up to `limit`
// workers running `handler` concurrently.
const runWithConcurrency = async (items, limit, handler) => {
    let cursor = 0;
    const worker = async () => {
        while (cursor < items.length) {
            const index = cursor++;
            await handler(items[index], index);
        }
    };
    const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
    await Promise.all(workers);
};

export const deleteMasterProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedProduct = await MasterProduct.findByIdAndDelete(id);
        if (!deletedProduct) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        res.status(200).json({ success: true, message: "Master product deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

async function resolveCategoryHierarchy(headerId, categoryId, subcategoryId) {
    let hId = headerId || null;
    let cId = categoryId || null;
    let sId = subcategoryId || null;

    const targetId = sId || cId || hId;
    if (targetId) {
        try {
            const cat = await Category.findById(targetId).lean();
            if (cat) {
                if (cat.type === 'subcategory') {
                    sId = cat._id;
                    if (cat.parentId) {
                        const pCat = await Category.findById(cat.parentId).lean();
                        if (pCat) {
                            cId = pCat._id;
                            if (pCat.parentId) {
                                hId = pCat.parentId;
                            }
                        }
                    }
                } else if (cat.type === 'category') {
                    cId = cat._id;
                    if (cat.parentId) {
                        hId = cat.parentId;
                    }
                } else if (cat.type === 'header') {
                    hId = cat._id;
                }
            }
        } catch (e) {
            // preserve existing IDs on error
        }
    }

    if (!cId && hId) cId = hId;
    if (!hId && cId) hId = cId;

    return { headerId: hId, categoryId: cId, subcategoryId: sId };
}

export const syncUnlinkedSellerProductsToMasterCatalog = async () => {
    try {
        const unlinked = await Product.find({ masterProductId: null }).lean();
        if (!unlinked || unlinked.length === 0) return;

        for (const product of unlinked) {
            const productName = String(product.name || '').trim();
            if (!productName) continue;

            const catHierarchy = await resolveCategoryHierarchy(product.headerId, product.categoryId, product.subcategoryId);

            const nameRegex = new RegExp(`^${productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
            let masterProduct = await MasterProduct.findOne({ name: nameRegex });

            if (!masterProduct) {
                const productBrand = (product.brand && String(product.brand).trim()) ? String(product.brand).trim() : 'App';
                const prefix = productName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'item';
                const productSku = (product.sku && String(product.sku).trim()) ? String(product.sku).trim() : `QM-${prefix.toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

                const masterVariants = (product.variants || []).map((v, idx) => ({
                    name: v.name || `Variant ${idx + 1}`,
                    unit: v.unit || '',
                    packSize: v.packSize || product.weight || '',
                    sku: v.sku || '',
                }));

                let baseSlug = slugify(`${productName}-${productBrand}`) || slugify(productName);
                let uniqueSlug = baseSlug;
                let count = 1;
                while (await MasterProduct.exists({ slug: uniqueSlug })) {
                    uniqueSlug = `${baseSlug}-${count}`;
                    count++;
                }

                masterProduct = await MasterProduct.create({
                    name: productName,
                    slug: uniqueSlug,
                    brand: productBrand,
                    description: product.description || '',
                    mainImage: product.mainImage || '',
                    galleryImages: product.galleryImages || [],
                    galleryLabels: product.galleryLabels || [],
                    headerId: catHierarchy.headerId,
                    categoryId: catHierarchy.categoryId,
                    subcategoryId: catHierarchy.subcategoryId || undefined,
                    unit: product.weight || '',
                    packSize: product.weight || '',
                    searchTags: product.tags || [],
                    variants: masterVariants,
                    sku: productSku,
                    status: 'active',
                });
            }

            const updateFields = {
                masterProductId: masterProduct._id,
                headerId: catHierarchy.headerId,
                categoryId: catHierarchy.categoryId,
            };
            if (catHierarchy.subcategoryId) {
                updateFields.subcategoryId = catHierarchy.subcategoryId;
            }
            if (!product.brand || !String(product.brand).trim()) {
                updateFields.brand = 'App';
            }
            await Product.updateOne({ _id: product._id }, { $set: updateFields });
        }
    } catch (err) {
        console.error("Failed to sync unlinked seller products to master catalog:", err);
    }
};

export function determineProductGST(productName = "", categoryName = "", subcategoryName = "") {
  const name = String(productName).toLowerCase().trim();
  const cat = String(categoryName).toLowerCase().trim();
  const sub = String(subcategoryName).toLowerCase().trim();
  const text = `${name} ${cat} ${sub}`;

  if (/coca[\s-]*cola|pepsi|sprite|thums[\s-]*up|mountain[\s-]*dew|fanta|7up|seven[\s-]*up|carbonated|aerated|energy[\s-]*drink|red[\s-]*bull|monster[\s-]*energy|deodorant|perfume|cologne|body[\s-]*spray/.test(text)) {
    return 28;
  }
  if (/fresh[\s-]*fruit|fresh[\s-]*veg|apple|banana|mango|orange|grape|papaya|guava|potato|tomato|onion|spinach|cucumber|carrot|brinjal|cauliflower|cabbage|fresh[\s-]*milk|fresh[\s-]*curd|lassi|buttermilk|fresh[\s-]*poultry|fresh[\s-]*meat|fresh[\s-]*fish|egg|unbranded[\s-]*rice|unbranded[\s-]*atta|common[\s-]*salt/.test(text)) {
    return 0;
  }
  if (/rice|atta|flour|wheat|dal|pulses|besan|suji|maida|oats|poha|edible[\s-]*oil|mustard[\s-]*oil|sunflower[\s-]*oil|groundnut[\s-]*oil|olive[\s-]*oil|ghee|tea|chai|coffee|sugar|salt|turmeric|chilli|coriander|cumin|jeera|garam[\s-]*masala|spice|masala|almond|cashew|raisin|walnut|pistachio|dates|dry[\s-]*fruit|rusk|biscuit|frozen[\s-]*peas|frozen[\s-]*veg/.test(text)) {
    return 5;
  }
  if (/juice|real|tropicana|jam|jelly|ketchup|sauce|pickle|pickle|cheese|butter|condensed[\s-]*milk|ayurvedic|chyawanprash|cough[\s-]*syrup|stationery|notebook|pen|pencil|paper|namkeen|bhujia|ready[\s-]*to[\s-]*eat/.test(text)) {
    return 12;
  }
  if (/soap|shampoo|conditioner|hair[\s-]*oil|face[\s-]*wash|lotion|cream|toothpaste|brush|detergent|surf|washing[\s-]*powder|dishwash|vim|harpic|cleaner|sanitary|pad|diaper|chocolate|dairy[\s-]*milk|kitkat|snickers|wafer|cake|chewing[\s-]*gum|electronic|headphone|earphone|charger|cable|battery|mobile|t[\s-]*shirt|shirt|pant|shoe|cloth/.test(text)) {
    return 18;
  }
  if (/fruit|veg|dairy|milk|staple|grain|pulse|oil|spice|tea|coffee/.test(cat)) return 5;
  if (/personal|beauty|care|clean|household|home|electronic|fashion|apparel/.test(cat)) return 18;
  if (/beverage|drink|snack|bakery|packaged/.test(cat)) return 12;

  return 5;
}

export const syncGSTTaxForExistingProducts = async () => {
    try {
        const unmigratedMaster = await MasterProduct.find({
            $or: [{ gstTax: { $exists: false } }, { gstTax: null }, { gstTax: 0 }]
        }).populate("categoryId subcategoryId", "name");

        for (const mp of unmigratedMaster) {
            const catName = mp.categoryId?.name || "";
            const subCatName = mp.subcategoryId?.name || "";
            const rate = determineProductGST(mp.name, catName, subCatName);
            await MasterProduct.updateOne({ _id: mp._id }, { $set: { gstTax: rate } });
        }

        const unmigratedProducts = await Product.find({
            $or: [{ gstTax: { $exists: false } }, { gstTax: null }, { gstTax: 0 }]
        }).populate("categoryId subcategoryId", "name");

        for (const p of unmigratedProducts) {
            const catName = p.categoryId?.name || "";
            const subCatName = p.subcategoryId?.name || "";
            const rate = determineProductGST(p.name, catName, subCatName);
            await Product.updateOne({ _id: p._id }, { $set: { gstTax: rate } });
        }
    } catch (err) {
        console.error("Auto GST Tax sync error:", err);
    }
};

export const getMasterProducts = async (req, res) => {
    try {
        // Auto-sync any unlinked seller products into master catalog first
        await syncUnlinkedSellerProductsToMasterCatalog();
        await syncGSTTaxForExistingProducts();

        const { search, category, status, page = 1, limit = 25 } = req.query;
        let query = {};

        if (search) {
            const term = String(search).trim();
            const regex = new RegExp(term, 'i');
            query.$or = [
                { name: regex },
                { brand: regex },
                { sku: regex },
                { searchTags: regex }
            ];
        }
        if (category && category !== 'all') {
            const categoryCond = [{ headerId: category }, { categoryId: category }, { subcategoryId: category }];
            if (query.$or) {
                query.$and = [{ $or: query.$or }, { $or: categoryCond }];
                delete query.$or;
            } else {
                query.$or = categoryCond;
            }
        }
        if (status && status !== 'all') {
            query.status = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Base query for counts (ignores status filter, but includes search and category)
        const baseStatsQuery = { ...query };
        delete baseStatsQuery.status;

        const [products, total, allCount, activeCount, inactiveCount] = await Promise.all([
            MasterProduct.find(query)
                .populate('headerId categoryId subcategoryId', 'name')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            MasterProduct.countDocuments(query),
            MasterProduct.countDocuments(baseStatsQuery),
            MasterProduct.countDocuments({ ...baseStatsQuery, status: 'active' }),
            MasterProduct.countDocuments({ ...baseStatsQuery, status: 'inactive' })
        ]);

        res.status(200).json({
            success: true,
            results: products,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit),
            counts: {
                all: allCount,
                active: activeCount,
                inactive: inactiveCount
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

function makeMasterProductSku(name) {
    const prefix = String(name || "item")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 5) || "item";
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `QM-${prefix.toUpperCase()}-${randomSuffix}`;
}

export const addMasterProduct = async (req, res) => {
    try {
        const productData = req.body;
        if (!productData.brand || !String(productData.brand).trim()) {
            productData.brand = "App";
        }
        
        // Handle images if uploaded directly
        if (req.files) {
            if (req.files.mainImage) {
                productData.mainImage = await uploadToCloudinary(req.files.mainImage[0].buffer, 'master-catalog');
            }
            if (req.files.galleryImages) {
                productData.galleryImages = [];
                for (let file of req.files.galleryImages) {
                    const url = await uploadToCloudinary(file.buffer, 'master-catalog');
                    productData.galleryImages.push(url);
                }
            }
        }
        
        if (productData.galleryLabels && typeof productData.galleryLabels === 'string') {
            try {
                productData.galleryLabels = JSON.parse(productData.galleryLabels);
            } catch (e) {
                productData.galleryLabels = productData.galleryLabels.split(',').map(s => s.trim());
            }
        }

        if (productData.variants && typeof productData.variants === 'string') {
            productData.variants = JSON.parse(productData.variants);
        }
        if (productData.keyFeatures && typeof productData.keyFeatures === 'string') {
            productData.keyFeatures = JSON.parse(productData.keyFeatures);
        }
        
        if (productData.gstTax !== undefined) {
            productData.gstTax = Math.max(0, Math.min(28, Number(productData.gstTax) || 0));
        }

        productData.slug = slugify(productData.name + '-' + (productData.brand || ''));

        if (!productData.sku || !String(productData.sku).trim()) {
            productData.sku = makeMasterProductSku(productData.name);
        }

        if (Array.isArray(productData.variants)) {
            productData.variants = productData.variants.map((v, idx) => ({
                ...v,
                sku: v?.sku && String(v.sku).trim() ? String(v.sku).trim() : `${productData.sku}-V${idx + 1}`
            }));
        }

        const newProduct = new MasterProduct(productData);
        await newProduct.save();

        res.status(201).json({ success: true, result: newProduct });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateMasterProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const productData = req.body;

        // Parse list of existing gallery image URLs that were preserved/kept in UI
        let galleryImages = [];
        if (productData.existingGalleryImages) {
            try {
                galleryImages = JSON.parse(productData.existingGalleryImages);
            } catch (err) {
                galleryImages = [];
            }
        }

        if (productData.galleryLabels && typeof productData.galleryLabels === 'string') {
            try {
                productData.galleryLabels = JSON.parse(productData.galleryLabels);
            } catch (e) {
                productData.galleryLabels = productData.galleryLabels.split(',').map(s => s.trim());
            }
        }

        // Handle cover image
        if (req.files && req.files.mainImage) {
            productData.mainImage = await uploadToCloudinary(req.files.mainImage[0].buffer, 'master-catalog');
        } else if (productData.mainImageUrl) {
            productData.mainImage = productData.mainImageUrl;
        }

        // Handle gallery images uploads and merge them
        if (req.files && req.files.galleryImages) {
            for (let file of req.files.galleryImages) {
                const url = await uploadToCloudinary(file.buffer, 'master-catalog');
                galleryImages.push(url);
            }
        }
        productData.galleryImages = galleryImages;

        if (productData.variants && typeof productData.variants === 'string') {
            productData.variants = JSON.parse(productData.variants);
        }

        if (productData.gstTax !== undefined) {
            productData.gstTax = Math.max(0, Math.min(28, Number(productData.gstTax) || 0));
        }

        if (Array.isArray(productData.variants)) {
            const baseSku = productData.sku || makeMasterProductSku(productData.name || 'item');
            productData.variants = productData.variants.map((v, idx) => ({
                ...v,
                sku: v?.sku && String(v.sku).trim() ? String(v.sku).trim() : `${baseSku}-V${idx + 1}`
            }));
        }

        if (productData.slug && String(productData.slug).trim() !== "") {
            const baseSlug = slugify(productData.slug);
            let uniqueSlug = baseSlug;
            let counter = 1;
            while (await MasterProduct.exists({ slug: uniqueSlug, _id: { $ne: id } })) {
                uniqueSlug = `${baseSlug}-${counter}`;
                counter++;
            }
            productData.slug = uniqueSlug;
        } else if (productData.name) {
            const baseSlug = slugify(productData.name + '-' + (productData.brand || ''));
            let uniqueSlug = baseSlug;
            let counter = 1;
            while (await MasterProduct.exists({ slug: uniqueSlug, _id: { $ne: id } })) {
                uniqueSlug = `${baseSlug}-${counter}`;
                counter++;
            }
            productData.slug = uniqueSlug;
        } else {
            delete productData.slug;
        }

        const updatedProduct = await MasterProduct.findByIdAndUpdate(id, { $set: productData }, { new: true });
        
        if (!updatedProduct) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        // Propagate image & metadata updates to all linked seller Product documents
        const syncUpdate = {};
        if (updatedProduct.mainImage) syncUpdate.mainImage = updatedProduct.mainImage;
        if (updatedProduct.galleryImages) syncUpdate.galleryImages = updatedProduct.galleryImages;
        if (updatedProduct.galleryLabels) syncUpdate.galleryLabels = updatedProduct.galleryLabels;
        if (updatedProduct.name) syncUpdate.name = updatedProduct.name;
        if (updatedProduct.brand) syncUpdate.brand = updatedProduct.brand;
        if (updatedProduct.description) syncUpdate.description = updatedProduct.description;
        if (updatedProduct.headerId) syncUpdate.headerId = updatedProduct.headerId;
        if (updatedProduct.categoryId) syncUpdate.categoryId = updatedProduct.categoryId;
        if (updatedProduct.subcategoryId) syncUpdate.subcategoryId = updatedProduct.subcategoryId;

        if (Object.keys(syncUpdate).length > 0) {
            await Product.updateMany(
                { masterProductId: id },
                { $set: syncUpdate }
            );
        }

        // Full Multi-Portal Cache Invalidation (Master UI, Seller UI, User UI)
        try {
            await invalidate(`cache:catalog:product:${id}`);
            if (updatedProduct.slug) {
                await invalidate(`cache:catalog:product:slug-${updatedProduct.slug.toLowerCase()}`);
            }
            await invalidate("cache:catalog:productList:*");
            await invalidate(buildKey("catalog", "productList", "*"));
            await invalidate("cache:sellers:nearby:*");
            await invalidate(buildKey("sellers", "nearby", "*"));
        } catch (_cacheErr) {
            // Log silently
        }

        res.status(200).json({ success: true, result: updatedProduct });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getImportTemplate = async (req, res) => {
    try {
        // Fetch existing categories from DB
        const categories = await Category.find().lean();
        const headerList = categories.filter(c => c.type === 'header').map(c => c.name);
        const mainList = categories.filter(c => c.type === 'category').map(c => c.name);
        const subList = categories.filter(c => c.type === 'subcategory').map(c => c.name);

        const workbook = new ExcelJS.Workbook();
        
        // 1. Create main template sheet
        const ws = workbook.addWorksheet("Template", {
            views: [{ showGridLines: true }]
        });

        // 2. Create lists sheet for dropdown references (can be hidden or visible, let's keep it hidden)
        const listWs = workbook.addWorksheet("Lists", {
            state: "hidden"
        });

        // Populate lookup lists in Lists sheet
        listWs.getCell("A1").value = "Header Categories";
        listWs.getCell("B1").value = "Main Categories";
        listWs.getCell("C1").value = "Sub Categories";

        headerList.forEach((h, idx) => { listWs.getCell(`A${idx + 2}`).value = h; });
        mainList.forEach((m, idx) => { listWs.getCell(`B${idx + 2}`).value = m; });
        subList.forEach((s, idx) => { listWs.getCell(`C${idx + 2}`).value = s; });

        // Define columns on the main template sheet
        const columns = [
            { header: "Header Category", key: "headerCategory", width: 25 },
            { header: "Main Category", key: "mainCategory", width: 25 },
            { header: "Sub Category", key: "subCategory", width: 25 },
            { header: "Brand", key: "brand", width: 15 },
            { header: "Product Name", key: "productName", width: 25 },
            { header: "Variant Name", key: "variantName", width: 15 },
            { header: "Unit", key: "unit", width: 10 },
            { header: "Pack Size", key: "packSize", width: 15 },
            { header: "Product Description", key: "description", width: 30 },
            { header: "Specifications", key: "specifications", width: 30 },
            { header: "Search Tags", key: "searchTags", width: 25 },
            { header: "Primary Image URL", key: "primaryImage", width: 35 },
            { header: "Front Image URL", key: "frontImage", width: 35 },
            { header: "Back Image URL", key: "backImage", width: 35 },
            { header: "Details Image URL", key: "detailsImage", width: 35 },
            { header: "Right Side Image URL", key: "rightSideImage", width: 35 },
            { header: "Left Side Image URL", key: "leftSideImage", width: 35 },
            { header: "GST Tax (%)", key: "gstTax", width: 15 },
            { header: "Status", key: "status", width: 12 }
        ];
        ws.columns = columns;

        // Apply formatting & locking to the header row (Row 1)
        ws.getRow(1).eachCell((cell) => {
            cell.protection = { locked: true };
            cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
            cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF4F46E5" } // Clean indigo header background
            };
        });

        // Add a sample row to guide the user
        const sampleRow = {
            headerCategory: "Grocery & Staples",
            mainCategory: "Dairy & Eggs",
            subCategory: "Milk",
            brand: "Amul",
            productName: "Gold Milk 500ml",
            variantName: "500ml",
            unit: "ml",
            packSize: "500",
            description: "Fresh Pasteurised Milk",
            specifications: "Fat: 4.5% | SNF: 8.5%",
            searchTags: "milk, amul, dairy, fresh milk",
            primaryImage: "https://example.com/amul-milk.jpg",
            frontImage: "https://example.com/amul-milk-front.jpg",
            backImage: "https://example.com/amul-milk-back.jpg",
            detailsImage: "https://example.com/amul-milk-details.jpg",
            rightSideImage: "https://example.com/amul-milk-right.jpg",
            leftSideImage: "https://example.com/amul-milk-left.jpg",
            gstTax: 5,
            status: "Active"
        };
        const sampleRowInstance = ws.addRow(sampleRow);
        
        // Lock and style sample row so it is read-only reference data
        sampleRowInstance.eachCell((cell) => {
            cell.protection = { locked: true };
            cell.font = { italic: true, color: { argb: "FF94A3B8" } }; // Slate-400 color
        });

        // Unlock all input cells for rows 3 to 500 (19 columns now)
        for (let r = 3; r <= 500; r++) {
            for (let c = 1; c <= 19; c++) {
                const cell = ws.getCell(r, c);
                cell.protection = { locked: false };
            }
        }

        // Apply dropdown validations dynamically linking to the Lists sheet
        const headerMax = headerList.length > 0 ? headerList.length + 1 : 2;
        const mainMax = mainList.length > 0 ? mainList.length + 1 : 2;
        const subMax = subList.length > 0 ? subList.length + 1 : 2;

        for (let r = 2; r <= 500; r++) {
            // Col A: Header Category Validation
            ws.getCell(`A${r}`).dataValidation = {
                type: "list",
                allowBlank: true,
                formulae: [`=Lists!$A$2:$A$${headerMax}`],
                showErrorMessage: true,
                errorTitle: "Invalid Option",
                error: "Please select a header category from the dropdown list."
            };

            // Col B: Main Category Validation
            ws.getCell(`B${r}`).dataValidation = {
                type: "list",
                allowBlank: true,
                formulae: [`=Lists!$B$2:$B$${mainMax}`],
                showErrorMessage: true,
                errorTitle: "Invalid Option",
                error: "Please select a main category from the dropdown list."
            };

            // Col C: Sub Category Validation
            ws.getCell(`C${r}`).dataValidation = {
                type: "list",
                allowBlank: true,
                formulae: [`=Lists!$C$2:$C$${subMax}`],
                showErrorMessage: true,
                errorTitle: "Invalid Option",
                error: "Please select a sub category from the dropdown list."
            };

            // Col R (Column 18): GST Tax Validation
            ws.getCell(`R${r}`).dataValidation = {
                type: "list",
                allowBlank: true,
                formulae: ['"0,5,12,18,28"'],
                showErrorMessage: true,
                errorTitle: "Invalid Option",
                error: "Please select a standard GST tax rate (0%, 5%, 12%, 18%, 28%)."
            };

            // Col S (Column 19): Status Validation
            ws.getCell(`S${r}`).dataValidation = {
                type: "list",
                allowBlank: true,
                formulae: ['"Active,Inactive"'],
                showErrorMessage: true,
                errorTitle: "Invalid Option",
                error: "Please select either Active or Inactive from the dropdown."
            };
        }

        // Enable sheet protection. Note: default settings will lock locked cells (like header row)
        // and allow editing unlocked cells (data rows).
        await ws.protect("quickemart-admin", {
            selectLockedCells: true,
            selectUnlockedCells: true,
            formatCells: true,
            formatColumns: true,
            formatRows: true
        });

        res.setHeader("Content-Disposition", "attachment; filename=catalog_import_template.xlsx");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        const buffer = await workbook.xlsx.writeBuffer();
        res.status(200).send(buffer);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const IMAGE_UPLOAD_CONCURRENCY = 5;
const DB_INSERT_BATCH_SIZE = 50;

export const bulkImportMasterProducts = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Excel file is required" });
        }

        const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (!data || data.length === 0) {
            return res.status(400).json({ success: false, message: "Excel file is empty" });
        }

        // Filter down to valid, non-empty rows (skip the locked sample row at rowNum 2)
        const validRows = [];
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowNum = i + 2;
            if (rowNum === 2) continue;
            const hasNoProductDetails = !row['Product Name'] && !row['Header Category'] && !row['Main Category'] && !row['Brand'];
            if (hasNoProductDetails) continue;
            validRows.push({ rowNum, row });
        }

        // Create background import task
        const task = new CatalogImportTask({
            excelBuffer: req.file.buffer,
            status: "PENDING",
            total: validRows.length
        });
        await task.save();

        // Respond immediately with 202 Accepted and taskId
        res.status(202).json({
            success: true,
            message: "Import task created successfully. Processing in background.",
            taskId: task._id
        });

        // Background processing execution
        setImmediate(async () => {
            try {
                task.status = "PROCESSING";
                await task.save();

                // ---- PHASE 1: sequential column validation + category resolution ----
                // Run strictly sequentially (no concurrency) so that two rows introducing
                // the same brand-new category never race each other into creating duplicates.
                const categoryCache = new Map(); // lowercased category name -> Category doc
                const resolveCategory = async (name, type, parentId, slugSuffix) => {
                    const key = name.toLowerCase();
                    if (categoryCache.has(key)) return categoryCache.get(key);
                    let cat = await Category.findOne({ name: { $regex: new RegExp("^" + escapeRegex(name) + "$", "i") } });
                    if (!cat) {
                        const uniqueSlug = await generateUniqueCategorySlug(slugSuffix ? `${name}${slugSuffix}` : name);
                        cat = new Category({
                            name,
                            slug: uniqueSlug,
                            type,
                            ...(parentId ? { parentId } : {}),
                            status: "active"
                        });
                        await cat.save();
                    }
                    categoryCache.set(key, cat);
                    return cat;
                };

                const preparedRows = [];
                for (const { rowNum, row } of validRows) {
                    try {
                        if (!row['Header Category']) throw { col: 'Header Category', message: 'Header Category is required' };
                        if (!row['Main Category']) throw { col: 'Main Category', message: 'Main Category is required' };
                        if (!row['Brand']) throw { col: 'Brand', message: 'Brand is required' };
                        if (!row['Product Name']) throw { col: 'Product Name', message: 'Product Name is required' };
                        if (!row['Unit']) throw { col: 'Unit', message: 'Unit is required' };
                        if (!row['Primary Image URL']) throw { col: 'Primary Image URL', message: 'Primary Image URL is required' };

                        const headerName = String(row['Header Category']).trim();
                        const headerCat = await resolveCategory(headerName, 'header', null);

                        const mainName = String(row['Main Category']).trim();
                        const mainCat = await resolveCategory(mainName, 'category', headerCat._id, '-cat');

                        let subCat = null;
                        if (row['Sub Category']) {
                            const subName = String(row['Sub Category']).trim();
                            subCat = await resolveCategory(subName, 'subcategory', mainCat._id, '-sub');
                        }

                        preparedRows.push({ rowNum, row, headerCat, mainCat, subCat });
                    } catch (err) {
                        task.failed++;
                        task.processed++;
                        task.errors.push({
                            row: rowNum,
                            col: err.col || 'General',
                            message: err.message || String(err)
                        });
                    }
                }
                await task.save();

                // ---- PHASE 2: concurrency-limited image upload + batched DB inserts ----
                const seenSlugs = new Set();
                let pendingDocs = [];
                let pendingMeta = [];
                let itemsSinceSave = 0;

                const flushBatch = async () => {
                    const batchDocs = pendingDocs;
                    const batchMeta = pendingMeta;
                    pendingDocs = [];
                    pendingMeta = [];
                    itemsSinceSave = 0;

                    if (batchDocs.length > 0) {
                        task.processed += batchDocs.length;
                        try {
                            const inserted = await MasterProduct.insertMany(batchDocs, { ordered: false });
                            task.success += inserted.length;
                        } catch (bulkErr) {
                            const insertedCount = Array.isArray(bulkErr.insertedDocs) ? bulkErr.insertedDocs.length : 0;
                            task.success += insertedCount;
                            const writeErrors = bulkErr.writeErrors || [];
                            for (const we of writeErrors) {
                                const idx = typeof we.index === 'number' ? we.index : we.err?.index;
                                const meta = batchMeta[idx] || {};
                                const code = we.code ?? we.err?.code;
                                if (code === 11000) {
                                    task.skipped++;
                                } else {
                                    task.failed++;
                                    task.errors.push({
                                        row: meta.rowNum || 0,
                                        col: 'General',
                                        message: we.errmsg || we.err?.errmsg || 'Failed to insert product'
                                    });
                                }
                            }
                        }
                    }

                    await task.save();
                };

                const getRowVal = (row, keys) => {
                    for (const key of keys) {
                        if (row[key] !== undefined) return row[key];
                    }
                    return null;
                };

                const processRow = async ({ rowNum, row, headerCat, mainCat, subCat }) => {
                    try {
                        const slug = slugify(String(row['Product Name']).trim() + '-' + String(row['Brand']).trim());

                        // Duplicate check: against already-imported catalog and against rows
                        // staged earlier in this same run (not yet flushed to the DB).
                        if (seenSlugs.has(slug)) {
                            task.skipped++;
                            task.processed++;
                            itemsSinceSave++;
                        } else {
                            const existing = await MasterProduct.findOne({ slug });
                            if (existing) {
                                seenSlugs.add(slug);
                                task.skipped++;
                                task.processed++;
                                itemsSinceSave++;
                            } else {
                                seenSlugs.add(slug);

                                let mainImage = null;
                                try {
                                    mainImage = await uploadImageFromUrl(row['Primary Image URL']);
                                    if (!mainImage) {
                                        throw new Error('Unable to download image from provided URL');
                                    }
                                } catch (imgErr) {
                                    throw { col: 'Primary Image URL', message: imgErr.message || 'Unable to download image from provided URL' };
                                }

                                let galleryImages = [];
                                let galleryLabels = [];
                                const addImage = async (url, label) => {
                                    if (url) {
                                        try {
                                            const uploaded = await uploadImageFromUrl(String(url).trim());
                                            if (uploaded) {
                                                galleryImages.push(uploaded);
                                                galleryLabels.push(label);
                                            }
                                        } catch (imgErr) {
                                            console.error(`Failed to upload ${label} image:`, imgErr);
                                        }
                                    }
                                };

                                await addImage(getRowVal(row, ['Front Image URL', 'Front Image', 'frontImage', 'FrontImageUrl']), 'Front');
                                await addImage(getRowVal(row, ['Back Image URL', 'Back Image', 'backImage', 'BackImageUrl']), 'Back');
                                await addImage(getRowVal(row, ['Details Image URL', 'Details Image', 'detailsImage', 'DetailsImageUrl']), 'Product details image');
                                await addImage(getRowVal(row, ['Right Side Image URL', 'Right Side Image', 'rightSideImage', 'RightSideImageUrl']), 'Right side');
                                await addImage(getRowVal(row, ['Left Side Image URL', 'Left Side Image', 'leftSideImage', 'LeftSideImageUrl']), 'Left side');

                                let specifications = [];
                                if (row['Specifications']) {
                                    specifications = String(row['Specifications']).split('|').map(spec => {
                                        const parts = spec.split(':');
                                        if (parts.length >= 2) {
                                            return { key: parts[0].trim(), value: parts[1].trim() };
                                        }
                                        return null;
                                    }).filter(Boolean);
                                }

                                const productData = {
                                    name: String(row['Product Name']).trim(),
                                    slug,
                                    brand: String(row['Brand']).trim(),
                                    description: row['Product Description'] ? String(row['Product Description']).trim() : '',
                                    headerId: headerCat._id,
                                    categoryId: mainCat._id,
                                    subcategoryId: subCat ? subCat._id : null,
                                    unit: String(row['Unit']).trim(),
                                    packSize: row['Pack Size'] ? String(row['Pack Size']).trim() : (row['Variant Name'] ? String(row['Variant Name']).trim() : ''),
                                    keyFeatures: row['Key Features'] ? String(row['Key Features']).split('|').map(f => f.trim()) : [],
                                    specifications,
                                    searchTags: row['Search Tags'] ? String(row['Search Tags']).split(',').map(t => t.trim()) : [],
                                    mainImage,
                                    galleryImages,
                                    galleryLabels,
                                    gstTax: Number(row['GST Tax (%)'] ?? row['GST Tax'] ?? row['GST'] ?? 0) || 0,
                                    status: row['Status'] ? String(row['Status']).trim().toLowerCase() : 'active',
                                    variants: []
                                };

                                if (row['Variant Name']) {
                                    productData.variants.push({
                                        name: String(row['Variant Name']).trim(),
                                        unit: String(row['Unit']).trim(),
                                        packSize: row['Pack Size'] ? String(row['Pack Size']).trim() : String(row['Variant Name']).trim(),
                                        price: 0,
                                        stock: 0
                                    });
                                }

                                pendingDocs.push(productData);
                                pendingMeta.push({ rowNum });
                                itemsSinceSave++;
                            }
                        }
                    } catch (err) {
                        task.failed++;
                        task.processed++;
                        itemsSinceSave++;
                        task.errors.push({
                            row: rowNum,
                            col: err.col || 'General',
                            message: err.message || String(err)
                        });
                    }

                    if (itemsSinceSave >= DB_INSERT_BATCH_SIZE) {
                        await flushBatch();
                    }
                };

                await runWithConcurrency(preparedRows, IMAGE_UPLOAD_CONCURRENCY, processRow);
                await flushBatch(); // flush remainder (< batch size)

                task.status = "COMPLETED";
                await task.save();
            } catch (taskErr) {
                console.error("Bulk Import Background Task Error:", taskErr);
                task.status = "FAILED";
                task.errors.push({
                    row: 0,
                    col: "General",
                    message: taskErr.message || String(taskErr)
                });
                await task.save();
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getCatalogImportStatus = async (req, res) => {
    try {
        const { taskId } = req.params;
        const task = await CatalogImportTask.findById(taskId).select("-excelBuffer").lean();
        if (!task) {
            return res.status(404).json({ success: false, message: "Import task not found" });
        }
        res.status(200).json({ success: true, task });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

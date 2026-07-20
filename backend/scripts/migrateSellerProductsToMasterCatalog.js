/**
 * Migration Script: Migrate Seller Products to Master Catalog
 *
 * Purpose:
 *   For every Product document where `masterProductId == null`,
 *   this script creates a MasterProduct entry using the seller product's
 *   metadata (name, brand, images, description, categories, variants structure).
 *   Then it links the Product back via `masterProductId`.
 *
 * SAFE TO RUN MULTIPLE TIMES — already-linked products are skipped.
 * NEVER modifies price, stock, or salePrice on any Product document.
 *
 * Usage:
 *   cd backend
 *   node scripts/migrateSellerProductsToMasterCatalog.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Product from '../app/models/product.js';
import MasterProduct from '../app/models/masterProduct.js';

dotenv.config();

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function makeMasterSku(name) {
  const prefix = String(name || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 5) || 'item';
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `QM-${prefix.toUpperCase()}-${suffix}`;
}

async function generateUniqueSlug(baseSlug) {
  let slug = baseSlug;
  let attempt = 0;
  while (await MasterProduct.exists({ slug })) {
    attempt++;
    slug = `${baseSlug}-${Math.random().toString(36).substring(2, 5)}`;
    if (attempt > 20) {
      slug = `${baseSlug}-${Date.now()}`;
      break;
    }
  }
  return slug;
}

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✓ Connected to MongoDB\n');

  // Fetch all products that are NOT yet linked to a master product
  const unlinkedProducts = await Product.find({ masterProductId: null }).lean();
  console.log(`Found ${unlinkedProducts.length} unlinked seller products to migrate.\n`);

  let created = 0;
  let linked = 0;
  let skipped = 0;
  let errors = 0;

  for (const product of unlinkedProducts) {
    try {
      const productName = String(product.name || '').trim();
      if (!productName) {
        console.warn(`  ⚠ Skipping product ${product._id} — no name`);
        skipped++;
        continue;
      }

      // Check if a MasterProduct with same name already exists (case-insensitive)
      const nameRegex = new RegExp(`^${productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      let masterProduct = await MasterProduct.findOne({ name: nameRegex });

      if (!masterProduct) {
        // Build variant structure (metadata only — no price/stock)
        const masterVariants = (product.variants || []).map((v, idx) => ({
          name: v.name || `Variant ${idx + 1}`,
          unit: v.unit || '',
          packSize: v.packSize || product.weight || '',
          sku: v.sku || '',
        }));

        const productBrand = (product.brand && String(product.brand).trim()) ? String(product.brand).trim() : 'App';
        const productSku = (product.sku && String(product.sku).trim()) ? String(product.sku).trim() : makeMasterSku(productName);

        const baseSlug = slugify(`${productName}-${productBrand}`) || slugify(productName);
        const uniqueSlug = await generateUniqueSlug(baseSlug);

        // Create MasterProduct from seller product metadata
        masterProduct = await MasterProduct.create({
          name: productName,
          slug: uniqueSlug,
          brand: productBrand,
          description: product.description || '',
          mainImage: product.mainImage || '',
          galleryImages: product.galleryImages || [],
          galleryLabels: product.galleryLabels || [],
          headerId: product.headerId,
          categoryId: product.categoryId,
          subcategoryId: product.subcategoryId || undefined,
          unit: product.weight || '',
          packSize: product.weight || '',
          searchTags: product.tags || [],
          variants: masterVariants,
          sku: productSku,
          status: 'active',
        });

        created++;
        console.log(`  ✅ Created MasterProduct: "${productName}" (${masterProduct._id}) [Brand: ${productBrand}, SKU: ${productSku}]`);
      } else {
        console.log(`  🔗 Found existing MasterProduct: "${masterProduct.name}" (${masterProduct._id})`);
        linked++;
      }

      // Link seller product to master product and ensure brand is updated if it was empty
      const productUpdate = { masterProductId: masterProduct._id };
      if (!product.brand || !String(product.brand).trim()) {
        productUpdate.brand = 'App';
      }

      await Product.updateOne(
        { _id: product._id },
        { $set: productUpdate }
      );

      console.log(`     ↳ Linked Product ${product._id} → MasterProduct ${masterProduct._id}`);
    } catch (err) {
      errors++;
      console.error(`  ❌ Error processing Product ${product._id}:`, err.message);
    }
  }

  console.log('\n========================================');
  console.log('Migration Summary:');
  console.log(`  New MasterProducts Created : ${created}`);
  console.log(`  Linked to Existing Masters : ${linked}`);
  console.log(`  Skipped (no name)          : ${skipped}`);
  console.log(`  Errors                     : ${errors}`);
  console.log('========================================\n');
  console.log('✓ Migration complete. Price and stock values were NOT modified.');

  process.exit(0);
}

migrate().catch((err) => {
  console.error('Fatal error during migration:', err);
  process.exit(1);
});

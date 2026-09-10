import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dns from 'dns';
import MasterProduct from '../app/models/masterProduct.js';

// Configure DNS for MongoDB Atlas SRV lookup on Windows
dns.setServers(['8.8.8.8', '1.1.1.1']);

dotenv.config({ path: './.env' });

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

function generateMasterSku(name) {
  const prefix = String(name || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 5) || 'item';
  const randomHash = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `QM-${prefix.toUpperCase()}-${randomHash}`;
}

async function backfillMasterSkus() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected successfully.\n');

    const unassignedProducts = await MasterProduct.find({
      $or: [
        { sku: { $exists: false } },
        { sku: null },
        { sku: '' },
      ],
    });

    console.log(`Found ${unassignedProducts.length} Master Products without SKU.`);

    if (unassignedProducts.length === 0) {
      console.log('All Master Products already have SKUs assigned!');
      await mongoose.disconnect();
      return;
    }

    const existingSkus = new Set(
      (await MasterProduct.find({ sku: { $ne: null } }).select('sku').lean())
        .map((p) => p.sku)
        .filter(Boolean)
    );

    let updatedCount = 0;
    for (const product of unassignedProducts) {
      let newSku = generateMasterSku(product.name);
      let attempts = 0;
      while (existingSkus.has(newSku) && attempts < 50) {
        newSku = generateMasterSku(product.name);
        attempts++;
      }
      existingSkus.add(newSku);

      // Update root SKU
      product.sku = newSku;

      // Also ensure variants have SKUs if empty
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        product.variants = product.variants.map((v, idx) => {
          const varSku = v.sku && String(v.sku).trim() 
            ? String(v.sku).trim() 
            : `${newSku}-V${idx + 1}`;
          return {
            ...v,
            sku: varSku,
          };
        });
      }

      await product.save();
      updatedCount++;
    }

    console.log(`\n✅ Successfully backfilled SKUs for ${updatedCount} Master Products!`);

    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB.');
  } catch (error) {
    console.error('Error during SKU backfill:', error);
    process.exit(1);
  }
}

backfillMasterSkus();

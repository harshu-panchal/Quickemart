/**
 * One-Time Migration Script: Backfill Seller IDs
 * ------------------------------------------------
 * Assigns a unique SLR-XXXXX ID to every approved seller that doesn't have one.
 *
 * Usage:
 *   node scripts/backfillSellerIds.js
 *
 * Safe to re-run — already-assigned sellers are skipped.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";
import { fileURLToPath } from "url";
import path from "path";

// Load .env from backend root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

// Use the same public DNS servers as the main backend (needed for MongoDB Atlas SRV lookups)
const dnsServers = (process.env.PUBLIC_DNS_SERVERS || "8.8.8.8,8.8.4.4,1.1.1.1")
  .split(",").map((s) => s.trim()).filter(Boolean);
if (dnsServers.length > 0) dns.setServers(dnsServers);

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL;

if (!MONGO_URI) {
  console.error("❌  No MONGO_URI found in environment. Check your .env file.");
  process.exit(1);
}

// Inline minimal Seller schema to avoid importing the full app
const sellerSchema = new mongoose.Schema(
  {
    sellerId: { type: String, unique: true, sparse: true, trim: true },
    applicationStatus: { type: String },
    isVerified: { type: Boolean },
    name: { type: String },
    email: { type: String },
    shopName: { type: String },
  },
  { strict: false },
);

const Seller = mongoose.models.Seller || mongoose.model("Seller", sellerSchema);

async function getNextSellerId() {
  const last = await Seller.findOne(
    { sellerId: { $regex: /^SLR-\d{5}$/ } },
    { sellerId: 1 },
  )
    .sort({ sellerId: -1 })
    .lean();

  let nextNum = 1;
  if (last?.sellerId) {
    const current = parseInt(last.sellerId.replace("SLR-", ""), 10);
    if (!isNaN(current)) nextNum = current + 1;
  }
  return nextNum;
}

async function run() {
  console.log("🔗  Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("✅  Connected.\n");

  // Find ALL verified/active sellers WITHOUT a sellerId
  // Catches both: applicationStatus:"approved" sellers AND legacy sellers
  // who were verified before the applicationStatus field existed
  const sellers = await Seller.find({
    $or: [
      { applicationStatus: "approved" },
      { isVerified: true },
      { isActive: true },
    ],
    $and: [
      { $or: [{ sellerId: { $exists: false } }, { sellerId: null }, { sellerId: "" }] },
    ],
  })
    .select("_id name email shopName sellerId")
    .sort({ createdAt: 1 })
    .lean();

  if (sellers.length === 0) {
    console.log("✅  All approved sellers already have Seller IDs. Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  console.log(`📋  Found ${sellers.length} approved seller(s) without a Seller ID.\n`);

  let counter = await getNextSellerId();
  let assigned = 0;
  let failed = 0;

  for (const seller of sellers) {
    const newId = `SLR-${String(counter).padStart(5, "0")}`;
    try {
      await Seller.findByIdAndUpdate(seller._id, { $set: { sellerId: newId } });
      console.log(`  ✔  ${newId}  →  ${seller.shopName || seller.name} (${seller.email})`);
      counter++;
      assigned++;
    } catch (err) {
      console.error(`  ✘  Failed for ${seller.email}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n🎉  Done! Assigned: ${assigned}, Failed: ${failed}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";
import path from "path";
import { fileURLToPath } from "url";
import MasterProduct from "../app/models/masterProduct.js";
import Product from "../app/models/product.js";

dns.setDefaultResultOrder("ipv4first");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

/**
 * Determine Indian GST Tax rate (%) product-wise based on item name and category context.
 * Indian GST Slabs: 0%, 5%, 12%, 18%, 28%.
 */
function determineProductGST(productName = "", categoryName = "", subcategoryName = "") {
  const name = String(productName).toLowerCase().trim();
  const cat = String(categoryName).toLowerCase().trim();
  const sub = String(subcategoryName).toLowerCase().trim();
  const text = `${name} ${cat} ${sub}`;

  // 1. 28% GST — Aerated Drinks, Energy Drinks, Deodorants & Perfumes
  if (
    /coca[\s-]*cola|pepsi|sprite|thums[\s-]*up|mountain[\s-]*dew|fanta|7up|seven[\s-]*up|carbonated|aerated|energy[\s-]*drink|red[\s-]*bull|monster[\s-]*energy|deodorant|perfume|cologne|body[\s-]*spray/.test(text)
  ) {
    return 28;
  }

  // 2. 0% GST — Fresh Unprocessed Goods, Fresh Fruits/Veg, Milk & Unbranded Staples
  if (
    /fresh[\s-]*fruit|fresh[\s-]*veg|apple|banana|mango|orange|grape|papaya|guava|potato|tomato|onion|spinach|cucumber|carrot|brinjal|cauliflower|cabbage|fresh[\s-]*milk|fresh[\s-]*curd|lassi|buttermilk|fresh[\s-]*poultry|fresh[\s-]*meat|fresh[\s-]*fish|egg|unbranded[\s-]*rice|unbranded[\s-]*atta|common[\s-]*salt/.test(text)
  ) {
    return 0;
  }

  // 3. 5% GST — Packaged Staples, Rice, Atta, Edible Oil, Ghee, Spices, Tea, Coffee, Sugar, Dry Fruits & Bakery
  if (
    /rice|atta|flour|wheat|dal|pulses|besan|suji|maida|oats|poha|edible[\s-]*oil|mustard[\s-]*oil|sunflower[\s-]*oil|groundnut[\s-]*oil|olive[\s-]*oil|ghee|tea|chai|coffee|sugar|salt|turmeric|chilli|coriander|cumin|jeera|garam[\s-]*masala|spice|masala|almond|cashew|raisin|walnut|pistachio|dates|dry[\s-]*fruit|rusk|biscuit|frozen[\s-]*peas|frozen[\s-]*veg/.test(text)
  ) {
    return 5;
  }

  // 4. 12% GST — Processed Juices, Jam, Ketchup, Sauce, Pickle, Cheese, Butter, Ayurvedic, Stationery
  if (
    /juice|real|tropicana|jam|jelly|ketchup|sauce|pickle|pickle|cheese|butter|condensed[\s-]*milk|ayurvedic|chyawanprash|cough[\s-]*syrup|stationery|notebook|pen|pencil|paper|namkeen|bhujia|ready[\s-]*to[\s-]*eat/.test(text)
  ) {
    return 12;
  }

  // 5. 18% GST — Personal Care, Soaps, Shampoos, Detergents, Electronics, Apparel, Chocolates
  if (
    /soap|shampoo|conditioner|hair[\s-]*oil|face[\s-]*wash|lotion|cream|toothpaste|brush|detergent|surf|washing[\s-]*powder|dishwash|vim|harpic|cleaner|sanitary|pad|diaper|chocolate|dairy[\s-]*milk|kitkat|snickers|wafer|cake|chewing[\s-]*gum|electronic|headphone|earphone|charger|cable|battery|mobile|t[\s-]*shirt|shirt|pant|shoe|cloth/.test(text)
  ) {
    return 18;
  }

  // 6. Category-level fallbacks if name keyword was unmapped
  if (/fruit|veg|dairy|milk|staple|grain|pulse|oil|spice|tea|coffee/.test(cat)) {
    return 5;
  }
  if (/personal|beauty|care|clean|household|home|electronic|fashion|apparel/.test(cat)) {
    return 18;
  }
  if (/beverage|drink|snack|bakery|packaged/.test(cat)) {
    return 12;
  }

  // Default fallback for any remaining product
  return 5;
}

async function runGSTMigration() {
  const connectionStrings = [
    process.env.MONGO_URI,
    "mongodb+srv://playeronline4076_db_user:3e6Kc6Ikodz6vXGs@cluster0.yau7gwg.mongodb.net/Quick_commerce?retryWrites=true&w=majority",
    "mongodb://127.0.0.1:27017/quickcommerce",
    "mongodb://127.0.0.1:27017/zoogno"
  ].filter(Boolean);

  let isConnected = false;

  for (const uri of connectionStrings) {
    try {
      console.log(`Connecting to MongoDB: ${uri.replace(/:[^:@]+@/, ":***@")}`);
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      console.log("✓ Connection successful");
      isConnected = true;
      break;
    } catch (err) {
      console.warn(`⚠ Connection failed for ${uri.split("@")[1] || uri}: ${err.message}`);
    }
  }

  if (!isConnected) {
    console.error("❌ Could not connect to any MongoDB instance. Exiting.");
    process.exit(1);
  }

  console.log("\n========================================================");
  console.log("  POPULATING GST TAX RATES (INDIAN GST COMPLIANCE)     ");
  console.log("========================================================\n");

  // 1. Update MasterProduct records
  const masterProducts = await MasterProduct.find({}).populate("categoryId subcategoryId", "name");
  let masterUpdated = 0;

  for (const mp of masterProducts) {
    const catName = mp.categoryId?.name || "";
    const subCatName = mp.subcategoryId?.name || "";
    const gstRate = determineProductGST(mp.name, catName, subCatName);

    mp.gstTax = gstRate;
    await mp.save();
    masterUpdated++;
    console.log(`[MasterProduct] "${mp.name}" -> GST ${gstRate}%`);
  }

  // 2. Update Product (Seller Listing) records
  const products = await Product.find({}).populate("categoryId subcategoryId", "name");
  let productsUpdated = 0;

  for (const p of products) {
    const catName = p.categoryId?.name || "";
    const subCatName = p.subcategoryId?.name || "";
    const gstRate = determineProductGST(p.name, catName, subCatName);

    p.gstTax = gstRate;
    await p.save();
    productsUpdated++;
    console.log(`[Product] "${p.name}" (ID: ${p._id}) -> GST ${gstRate}%`);
  }

  console.log("\n========================================================");
  console.log(`MIGRATION COMPLETE!`);
  console.log(`- MasterProducts updated: ${masterUpdated}`);
  console.log(`- Products updated: ${productsUpdated}`);
  console.log("========================================================\n");

  await mongoose.disconnect();
  process.exit(0);
}

runGSTMigration().catch((err) => {
  console.error("Migration Error:", err);
  process.exit(1);
});

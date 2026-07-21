import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const urisToTry = [
  process.env.MONGO_URI,
  process.env.MONGODB_URI,
  "mongodb://127.0.0.1:27017/quickcommerce",
  "mongodb://127.0.0.1:27017/quickemart",
].filter(Boolean);

async function runMigration() {
  console.log("=== POPULATING DEFAULT SELLER SHOP TIMINGS (08:00 AM - 08:00 PM) ===");
  
  let connected = false;
  for (const uri of urisToTry) {
    try {
      console.log(`Connecting to MongoDB...`);
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, family: 4 });
      connected = true;
      console.log(`Successfully connected.`);
      break;
    } catch (err) {
      console.warn(`Connection failed for URI: ${err.message}`);
    }
  }

  if (!connected) {
    console.error("Could not connect to any MongoDB instance.");
    process.exit(1);
  }

  try {
    const db = mongoose.connection.db;
    const sellersCol = db.collection("sellers");

    const totalSellers = await sellersCol.countDocuments();
    console.log(`Total sellers found in database: ${totalSellers}`);

    const result = await sellersCol.updateMany(
      {
        $or: [
          { shopTiming: { $exists: false } },
          { "shopTiming.openingTime": { $exists: false } },
          { "shopTiming.closingTime": { $exists: false } },
          { shopTiming: null },
        ],
      },
      {
        $set: {
          shopTiming: {
            openingTime: "08:00",
            closingTime: "20:00",
            isTimingEnabled: true,
            manualOverride: "auto",
          },
        },
      }
    );

    console.log(`Successfully updated ${result.modifiedCount} seller records with default 08:00 AM - 08:00 PM shop timing.`);
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB. Migration completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

runMigration();

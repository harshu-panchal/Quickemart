import dns from "dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const orderId = "ORD-261009-QK2Z0V";

async function main() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error("No MONGO_URI in .env");
      process.exit(1);
    }
    
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    const order = await db.collection("orders").findOne({ orderId });
    console.log("Current Order State:", JSON.stringify(order, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();

import mongoose from "mongoose";
import dotenv from "dotenv";
import Payout from "../app/models/payout.js";
import Order from "../app/models/order.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/quickmart";

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to DB");

  const pendingPayouts = await Payout.find({ status: "PENDING" }).lean();
  console.log(`Found ${pendingPayouts.length} PENDING payouts:`);

  const now = new Date();

  for (const p of pendingPayouts) {
    console.log(`\nPayout ID: ${p._id}, Type: ${p.payoutType}, Amount: ${p.amount}, Beneficiary: ${p.beneficiaryId}`);
    if (p.relatedOrderIds && p.relatedOrderIds.length > 0) {
      for (const orderId of p.relatedOrderIds) {
        const order = await Order.findById(orderId).lean();
        if (order) {
          const expiresAt = order.returnWindowExpiresAt ? new Date(order.returnWindowExpiresAt) : null;
          const isWithinWindow = expiresAt ? expiresAt > now : false;
          console.log(`  Order ID: ${order.orderId} (${order._id})`);
          console.log(`  Status: ${order.status} / ${order.orderStatus}`);
          console.log(`  Settlement Status: ${JSON.stringify(order.settlementStatus)}`);
          console.log(`  ReturnWindowExpiresAt: ${order.returnWindowExpiresAt}`);
          console.log(`  Is Return Window Active Now? -> ${isWithinWindow}`);
        } else {
          console.log(`  Order ${orderId} not found`);
        }
      }
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);

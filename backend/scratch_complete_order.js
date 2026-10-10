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
    console.log("Connected to Mongo.");

    const db = mongoose.connection.db;
    const now = new Date();

    const result = await db.collection("orders").findOneAndUpdate(
      { orderId },
      {
        $set: {
          workflowStatus: "DELIVERED",
          status: "delivered",
          orderStatus: "delivered",
          deliveryRiderStep: 4,
          deliveredAt: now,
          isDelivered: true,
          "payment.status": "success",
          paymentStatus: "PAID",
          "paymentBreakdown.codCollectedAmount": 217,
          "paymentBreakdown.codRemittedAmount": 217,
          "financeFlags.codMarkedCollected": true,
          "financeFlags.deliveredSettlementApplied": true,
          "financeFlags.onlinePaymentCaptured": true,
          "settlementStatus.overall": "COMPLETED",
          updatedAt: now
        }
      },
      { returnDocument: "after" }
    );

    console.log("Order updated successfully to DELIVERED:", !!result);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const orderId = "ORD-261008-4ZCYAV";

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
    const result = await db.collection("orders").findOneAndUpdate(
      { orderId },
      {
        $set: {
          workflowStatus: "DELIVERED",
          status: "delivered",
          deliveryRiderStep: 4,
          deliveredAt: new Date(),
          isDelivered: true,
          "payment.status": "success",
          "paymentBreakdown.isPaid": true
        }
      },
      { returnDocument: "after" }
    );

    console.log("Order updated:", !!result);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();

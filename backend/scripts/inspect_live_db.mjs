import mongoose from "mongoose";
import PushToken from "../app/modules/notifications/token.model.js";

const prodUri = "mongodb+srv://playeronline4076_db_user:3e6Kc6Ikodz6vXGs@cluster0.yau7gwg.mongodb.net/Quick_commerce?retryWrites=true&w=majority&appName=Cluster0";
await mongoose.connect(prodUri);

const total = await PushToken.countDocuments({ isActive: true });
console.log("LIVE PROD DB (Quick_commerce) Active Tokens:", total);

// Find tokens that match localhost or don't have quickemartcom.com
const recent = await PushToken.find({ isActive: true }).sort({ updatedAt: -1 }).limit(10).lean();
console.log("\nLast 10 active tokens in Quick_commerce:");
recent.forEach((t, i) => {
  console.log(`[${i+1}] id=${t._id} role=${t.role} origin=${t.origin || 'NONE'} updatedAt=${t.updatedAt} token=${String(t.token).substring(0, 25)}...`);
});

await mongoose.disconnect();

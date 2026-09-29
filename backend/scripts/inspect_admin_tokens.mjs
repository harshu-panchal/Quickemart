import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function inspect(uri, dbName) {
  console.log(`\n================ Inspecting ${dbName} ================`);
  const conn = await mongoose.createConnection(uri).asPromise();
  const db = conn.db;

  const admins = await db.collection("admins").find({}).toArray();
  console.log(`Admins found (${admins.length}):`);
  admins.forEach(a => console.log(`  - _id=${a._id} email=${a.email} role=${a.role}`));

  const adminIds = admins.map(a => a._id);
  const tokens = await db.collection("pushtokens").find({
    $or: [
      { userId: { $in: adminIds } },
      { role: "admin" }
    ]
  }).toArray();

  console.log(`Admin tokens found (${tokens.length}):`);
  tokens.forEach(t => {
    console.log(`  - id=${t._id} userId=${t.userId} role=${t.role} origin=${t.origin || 'NONE'} isActive=${t.isActive} token=${String(t.token).substring(0, 15)}... updatedAt=${t.updatedAt}`);
  });

  const allActiveTokens = await db.collection("pushtokens").find({ isActive: true }).toArray();
  console.log(`Total ALL active tokens (${allActiveTokens.length}):`);
  allActiveTokens.forEach(t => {
    console.log(`  - id=${t._id} userId=${t.userId} role=${t.role} origin=${t.origin || 'NONE'} token=${String(t.token).substring(0, 15)}...`);
  });

  await conn.close();
}

const zoognoUri = process.env.MONGO_URI;
await inspect(zoognoUri, "ZOOGNO DB");

const prodUri = "mongodb+srv://playeronline4076_db_user:3e6Kc6Ikodz6vXGs@cluster0.yau7gwg.mongodb.net/Quick_commerce?retryWrites=true&w=majority&appName=Cluster0";
await inspect(prodUri, "QUICK_COMMERCE PROD DB");

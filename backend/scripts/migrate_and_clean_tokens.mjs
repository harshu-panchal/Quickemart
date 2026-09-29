import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const isDevOrigin = (origin) => /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(origin || "");

async function migrateDatabase(uri, label) {
  console.log(`\n================ Running Token Migration on [${label}] ================`);
  const conn = await mongoose.createConnection(uri).asPromise();
  const collection = conn.db.collection("pushtokens");

  const totalTokens = await collection.countDocuments({});
  console.log(`Total tokens in database: ${totalTokens}`);

  // 1. Identify and deactivate stale localhost / development tokens
  const devFilter = {
    $or: [
      { origin: /localhost|127\.0\.0\.1|0\.0\.0\.0/i },
      { environment: "development" },
    ],
  };

  const devResult = await collection.updateMany(devFilter, {
    $set: {
      environment: "development",
      isActive: false,
      invalidReason: "STALE_DEVELOPMENT_TOKEN",
      invalidatedAt: new Date(),
    },
  });
  console.log(`Deactivated development/localhost tokens: ${devResult.modifiedCount}`);

  // 2. Backfill environment='production' for tokens from production origin
  const prodResult = await collection.updateMany(
    {
      $or: [
        { origin: /quickemartcom\.com/i },
        { origin: { $exists: false } },
        { origin: "" },
      ],
      environment: { $ne: "development" },
    },
    {
      $set: {
        environment: "production",
      },
    }
  );
  console.log(`Backfilled production environment tokens: ${prodResult.modifiedCount}`);

  // 3. Inspect active admin tokens
  const activeAdminTokens = await collection.find({ role: "admin", isActive: true }).toArray();
  console.log(`Active Admin Tokens (${activeAdminTokens.length}):`);
  activeAdminTokens.forEach((t, i) => {
    const masked = t.token ? `${t.token.substring(0, 10)}...` : "none";
    console.log(`  [${i + 1}] id=${t._id} userId=${t.userId} origin=${t.origin} env=${t.environment} token=${masked} lastUsedAt=${t.lastUsedAt}`);
  });

  // 4. Ensure optimal compound indexes
  try {
    await collection.createIndex(
      { userId: 1, role: 1, isActive: 1, environment: 1, lastUsedAt: -1 },
      { name: "user_role_active_env_lastused" }
    );
    console.log("Compound index 'user_role_active_env_lastused' verified.");
  } catch (idxErr) {
    console.log(`Index note: ${idxErr.message}`);
  }

  await conn.close();
}

const mainUri = process.env.MONGO_URI;
await migrateDatabase(mainUri, "ACTIVE MONGO_URI");

const prodUri = "mongodb+srv://playeronline4076_db_user:3e6Kc6Ikodz6vXGs@cluster0.yau7gwg.mongodb.net/Quick_commerce?retryWrites=true&w=majority&appName=Cluster0";
try {
  await migrateDatabase(prodUri, "QUICK_COMMERCE CLUSTER");
} catch (e) {
  console.warn("Could not connect to Quick_commerce cluster:", e.message);
}

console.log("\nMigration completed successfully.");

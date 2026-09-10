import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dns from 'dns';

dns.setServers(['8.8.8.8', '1.1.1.1']);
dotenv.config({ path: './.env' });

async function checkSellerLocation() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    const seller = await db.collection('sellers').findOne({ _id: new mongoose.Types.ObjectId('6a8d5c8680a7c31f43b4e7d4') });
    console.log('--- SELLER DETAILS ---');
    console.log('Shop Name:', seller.shopName || seller.name);
    console.log('Location:', JSON.stringify(seller.location));
    console.log('Service Radius:', seller.serviceRadius);
    console.log('IsActive:', seller.isActive);
    console.log('ApplicationStatus:', seller.applicationStatus);

    await mongoose.disconnect();
  } catch (e) {
    console.error(e);
  }
}

checkSellerLocation();

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

async function check() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    
    const product = await db.collection('products').findOne({ slug: 'turba-001' });
    console.log('--- PRODUCT ---');
    console.log(JSON.stringify(product, null, 2));

    if (product) {
      const seller = await db.collection('sellers').findOne({ _id: product.sellerId });
      console.log('--- SELLER ---');
      console.log(JSON.stringify(seller, null, 2));
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

check();

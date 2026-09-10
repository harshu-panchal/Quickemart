import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dns from 'dns';

dns.setServers(['8.8.8.8', '1.1.1.1']);
dotenv.config({ path: './.env' });

async function testMatch() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    const slugs = ['aashirvaad-multigrain-atta-aashirvaad'];

    // 1. Find master products matching slugs
    const masterProducts = await db.collection('masterproducts').find({ slug: { $in: slugs } }).toArray();
    const masterIds = masterProducts.map((mp) => mp._id);

    console.log('Master products found:', masterProducts.map((mp) => ({ id: mp._id, name: mp.name, slug: mp.slug })));

    // 2. Find seller products matching masterProductId or slug
    const sellerProducts = await db.collection('products').find({
      $or: [
        { slug: { $in: slugs } },
        { masterProductId: { $in: masterIds } },
      ],
      status: 'active',
    }).toArray();

    console.log('\nSeller products matched:', sellerProducts.map((p) => ({
      id: p._id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      salePrice: p.salePrice,
      stock: p.stock,
      sellerId: p.sellerId,
    })));

    await mongoose.disconnect();
  } catch (e) {
    console.error(e);
  }
}

testMatch();

import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://garvit_db_user:GARVIT123@cluster0.uqyzn1e.mongodb.net/zoogno?retryWrites=true&w=majority&appName=Cluster0';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  // Find seller named Sonu Kumari (case-insensitive)
  const sellers = await db.collection('sellers').find(
    { name: { $regex: 'sonu', $options: 'i' } },
    {
      projection: {
        _id: 1, name: 1, shopName: 1, email: 1,
        serviceRadius: 1, isActive: 1, applicationStatus: 1,
        'location.coordinates': 1
      }
    }
  ).toArray();

  console.log('=== 🏪 SELLERS FOUND (name contains "sonu") ===');
  if (sellers.length === 0) {
    console.log('❌ No seller found with name containing "sonu"');
    // Try shopName
    const byShop = await db.collection('sellers').find(
      { shopName: { $regex: 'sonu', $options: 'i' } },
      { projection: { _id: 1, name: 1, shopName: 1, email: 1, serviceRadius: 1, isActive: 1 } }
    ).toArray();
    console.log('\n=== 🏪 SELLERS FOUND (shopName contains "sonu") ===');
    console.log(JSON.stringify(byShop, null, 2));
  } else {
    sellers.forEach((s, i) => {
      console.log(`\n[${i + 1}] Seller:`);
      console.log(`   ID        : ${s._id}`);
      console.log(`   Name      : ${s.name}`);
      console.log(`   Shop Name : ${s.shopName}`);
      console.log(`   Email     : ${s.email}`);
      console.log(`   Active    : ${s.isActive}`);
      console.log(`   Status    : ${s.applicationStatus}`);
      console.log(`   Radius    : ${s.serviceRadius || 5} km`);
      console.log(`   Location  : ${JSON.stringify(s.location?.coordinates)}`);
    });
  }

  if (sellers.length > 0) {
    const sellerIds = sellers.map(s => s._id);

    const products = await db.collection('products').find(
      { sellerId: { $in: sellerIds } },
      {
        projection: {
          _id: 1, name: 1, price: 1, salePrice: 1,
          stock: 1, status: 1, approvalStatus: 1, sellerId: 1
        }
      }
    ).toArray();

    console.log('\n=== 📦 PRODUCTS BY SONU KUMARI ===');
    console.log(`Total products: ${products.length}`);

    if (products.length === 0) {
      console.log('❌ No products found for this seller.');
    } else {
      products.forEach((p, i) => {
        console.log(`\n[${i + 1}] Product:`);
        console.log(`   ID             : ${p._id}`);
        console.log(`   Name           : ${p.name}`);
        console.log(`   Price          : ₹${p.price}`);
        console.log(`   Sale Price     : ₹${p.salePrice || '-'}`);
        console.log(`   Stock          : ${p.stock}`);
        console.log(`   Status         : ${p.status}`);
        console.log(`   Approval Status: ${p.approvalStatus}`);
      });
    }
  }

  await mongoose.disconnect();
  console.log('\n✅ Done. Disconnected.');
}

main().catch(console.error);

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dns from 'dns';
import '../app/core/modelRegistry.js';
import { getPublicOfferSections } from '../app/controller/offerSectionController.js';

dns.setServers(['8.8.8.8', '1.1.1.1']);
dotenv.config({ path: './.env' });

async function testOfferResolution() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Simulate customer request with seller location (lat 22.7174, lng 75.8717)
    const req = { query: { lat: '22.7174', lng: '75.8717' } };
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        console.log(`\n--- PUBLIC OFFER SECTIONS RESPONSE (${this.statusCode}) ---`);
        console.log(`Success: ${data.success}, Message: "${data.message}"`);
        const sections = data.result || data.results || [];
        console.log(`Sections count: ${sections.length}`);
        sections.forEach((sec, idx) => {
          console.log(`\n[Section ${idx + 1}] Title: "${sec.title}"`);
          console.log(`- Configured productSlugs: ${JSON.stringify(sec.productSlugs)}`);
          console.log(`- Resolved products count: ${sec.productIds?.length || 0}`);
          (sec.productIds || []).forEach((prod, pIdx) => {
            console.log(
              `  ${pIdx + 1}. "${prod.name}" (Slug: ${prod.slug}, Price: ₹${prod.salePrice || prod.price}, Stock: ${prod.stock}, OutOfStock: ${!!prod.isOutOfStock})`
            );
          });
        });
      },
    };

    await getPublicOfferSections(req, res);
    await mongoose.disconnect();
  } catch (e) {
    console.error(e);
  }
}

testOfferResolution();

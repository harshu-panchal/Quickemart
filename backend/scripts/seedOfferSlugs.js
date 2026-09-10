import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dns from 'dns';
import OfferSection from '../app/models/offerSection.js';

dns.setServers(['8.8.8.8', '1.1.1.1']);
dotenv.config({ path: './.env' });

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const result = await OfferSection.updateMany(
      { title: 'todays' },
      {
        $set: {
          productSlugs: [
            'aashirvaad-multigrain-atta-aashirvaad',
            'fortune-multigrain-atta-fortune',
            'small-medium-large-babyhug-babyblanket',
            'aashirvaad-coriander-powder-aashirvaad-100g',
          ],
        },
      }
    );
    console.log('✅ Successfully updated OfferSection productSlugs:', result.modifiedCount);
    await mongoose.disconnect();
  } catch (e) {
    console.error(e);
  }
}
seed();

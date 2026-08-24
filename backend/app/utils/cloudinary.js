import dotenv from 'dotenv';
import { saveFileBufferToDisk } from './localStorage.js';

dotenv.config();

// Kept as a global interceptor: every existing caller imports
// `uploadToCloudinary` from this file, so routing it to local disk here
// migrates the whole app off Cloudinary without touching call sites.
// Cloudinary-hosted URLs already stored on existing records keep working
// unchanged (they're rendered as absolute URLs, same as local ones now are).
export const uploadToCloudinary = async (fileBuffer, folder = 'categories', options = {}) => {
    const mimeType = String(options.mimeType || '').trim().toLowerCase();
    return saveFileBufferToDisk(fileBuffer, folder, { mimeType });
};

export default uploadToCloudinary;

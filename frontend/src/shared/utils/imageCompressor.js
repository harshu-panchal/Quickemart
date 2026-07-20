/**
 * Compresses an image file on the client side using Canvas.
 * 
 * @param {File} file - The original file object.
 * @param {Object} options - Compression options.
 * @param {number} options.maxWidth - Maximum width of the compressed image. Default is 1600.
 * @param {number} options.maxHeight - Maximum height of the compressed image. Default is 1600.
 * @param {number} options.quality - Quality factor between 0 and 1. Default is 0.7.
 * @returns {Promise<File>} A promise that resolves to the compressed File object.
 */
export const compressImage = (file, options = {}) => {
  const { maxWidth = 1600, maxHeight = 1600, quality = 0.7 } = options;

  // Don't compress non-image files (e.g., PDF)
  if (!file || !file.type.startsWith("image/")) {
    return Promise.resolve(file);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions keeping the aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file); // fallback to original file if canvas context is not supported
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert compressed images to image/jpeg for max compression benefits
        const outputType = "image/jpeg";
        
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file); // fallback
              return;
            }
            
            // Adjust filename to have .jpg extension if it isn't already jpg/jpeg
            let newName = file.name;
            const lastDot = newName.lastIndexOf('.');
            if (lastDot !== -1) {
              const ext = newName.substring(lastDot + 1).toLowerCase();
              if (ext !== 'jpg' && ext !== 'jpeg') {
                newName = newName.substring(0, lastDot) + '.jpg';
              }
            } else {
              newName = newName + '.jpg';
            }

            // Create a new File object from the blob
            const compressedFile = new File([blob], newName, {
              type: outputType,
              lastModified: Date.now(),
            });
            
            // Only return compressed file if it's actually smaller than the original
            if (compressedFile.size < file.size) {
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          outputType,
          quality
        );
      };

      img.onerror = (err) => {
        reject(err);
      };
    };

    reader.onerror = (err) => {
      reject(err);
    };
  });
};

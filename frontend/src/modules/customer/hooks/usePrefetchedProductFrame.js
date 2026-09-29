import { useState, useEffect, useMemo, useCallback, useRef } from "react";

// Global cache to avoid redundant image preloading across mounts
const preloadedImagesCache = new Set();

/**
 * Preload and decode an image in the background.
 */
export function preloadProductImage(src) {
  if (!src || typeof src !== "string" || preloadedImagesCache.has(src)) return;
  preloadedImagesCache.add(src);

  try {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  } catch (_) {
    // Ignore preloading failures silently
  }
}

/**
 * Hook to manage smooth product frame slicing and background prefetching.
 * Ensures the next frame of products and their media are pre-loaded into memory
 * so clicking 'See More' instantly renders them without image pop-in or waiting spinners.
 *
 * @param {Array} products - All available products for the section.
 * @param {Object} options
 * @param {number} [options.frameSize=12] - Number of items to reveal per 'See More' step.
 * @param {number} [options.initialCount=12] - Initial number of items to display.
 */
export function usePrefetchedProductFrame(products = [], { frameSize = 12, initialCount = 12 } = {}) {
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const isPreloadingRef = useRef(false);

  // Reset visible count when underlying product list or category changes
  useEffect(() => {
    setVisibleCount(initialCount);
  }, [products, initialCount]);

  const totalProducts = Array.isArray(products) ? products : [];
  const totalCount = totalProducts.length;

  const hasMore = visibleCount < totalCount;
  const visibleProducts = useMemo(() => {
    return totalProducts.slice(0, visibleCount);
  }, [totalProducts, visibleCount]);

  const nextFrameProducts = useMemo(() => {
    if (!hasMore) return [];
    return totalProducts.slice(visibleCount, visibleCount + frameSize);
  }, [totalProducts, visibleCount, frameSize, hasMore]);

  // Preload next frame's images in the background
  useEffect(() => {
    if (!hasMore || nextFrameProducts.length === 0) return;

    const schedulePreload = () => {
      // Preload next frame plus an extra buffer
      const upcoming = totalProducts.slice(visibleCount, visibleCount + frameSize * 2);
      upcoming.forEach((product) => {
        const imgUrl =
          product?.image ||
          product?.mainImage ||
          (Array.isArray(product?.galleryImages) ? product.galleryImages[0] : null) ||
          (Array.isArray(product?.images) ? product.images[0] : null);

        if (imgUrl) {
          preloadProductImage(imgUrl);
        }
      });
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(schedulePreload, { timeout: 1500 });
      return () => window.cancelIdleCallback(handle);
    } else {
      const timer = setTimeout(schedulePreload, 150);
      return () => clearTimeout(timer);
    }
  }, [totalProducts, visibleCount, frameSize, hasMore, nextFrameProducts]);

  const showNextFrame = useCallback(() => {
    if (!hasMore) return false;
    setVisibleCount((prev) => Math.min(totalCount, prev + frameSize));
    return true;
  }, [hasMore, totalCount, frameSize]);

  return {
    visibleProducts,
    visibleCount,
    totalCount,
    hasMore,
    showNextFrame,
    nextFrameCount: nextFrameProducts.length,
  };
}

export default usePrefetchedProductFrame;

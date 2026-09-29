import React from "react";
import ProductCardSkeleton from "./ProductCardSkeleton";

const SearchPageSkeleton = ({ count = 6 }) => {
  return (
    <div className="w-full px-4 md:px-8 py-4 select-none" aria-hidden="true">
      {/* Category Suggestion Pills Skeleton */}
      <div className="flex items-center gap-2 overflow-hidden mb-6">
        <div className="h-8 w-24 rounded-full ds-skeleton" />
        <div className="h-8 w-28 rounded-full ds-skeleton" />
        <div className="h-8 w-20 rounded-full ds-skeleton" />
        <div className="h-8 w-32 rounded-full ds-skeleton opacity-60" />
      </div>

      {/* Results Header Skeleton */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-32 rounded ds-skeleton" />
        <div className="h-4 w-20 rounded ds-skeleton opacity-50" />
      </div>

      {/* Product Results Grid Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 md:gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <ProductCardSkeleton key={i} compact={true} />
        ))}
      </div>
    </div>
  );
};

export default React.memo(SearchPageSkeleton);

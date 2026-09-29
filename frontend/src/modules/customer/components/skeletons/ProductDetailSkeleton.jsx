import React from "react";

const ProductDetailSkeleton = () => {
  return (
    <div className="w-full max-w-5xl mx-auto p-4 md:p-8 select-none" aria-hidden="true">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12">
        {/* Left: Product Media Gallery Skeleton */}
        <div className="flex flex-col gap-3">
          <div className="aspect-square w-full rounded-3xl ds-skeleton" />
          <div className="flex items-center gap-2">
            <div className="h-16 w-16 rounded-xl ds-skeleton" />
            <div className="h-16 w-16 rounded-xl ds-skeleton" />
            <div className="h-16 w-16 rounded-xl ds-skeleton opacity-60" />
          </div>
        </div>

        {/* Right: Product Details Skeleton */}
        <div className="flex flex-col gap-4">
          {/* Brand & Category breadcrumb */}
          <div className="h-4 w-32 rounded ds-skeleton" />

          {/* Title */}
          <div className="space-y-2">
            <div className="h-7 md:h-9 w-full rounded-lg ds-skeleton" />
            <div className="h-7 md:h-9 w-3/4 rounded-lg ds-skeleton" />
          </div>

          {/* Weight / Unit */}
          <div className="h-5 w-20 rounded-md ds-skeleton" />

          {/* Price & MRP */}
          <div className="flex items-center gap-3 pt-2">
            <div className="h-8 md:h-10 w-28 rounded-lg ds-skeleton" />
            <div className="h-5 w-16 rounded ds-skeleton opacity-50" />
            <div className="h-6 w-16 rounded-full ds-skeleton opacity-70" />
          </div>

          {/* Variants row */}
          <div className="space-y-2 pt-2">
            <div className="h-4 w-24 rounded ds-skeleton" />
            <div className="flex gap-2">
              <div className="h-10 w-24 rounded-xl ds-skeleton" />
              <div className="h-10 w-24 rounded-xl ds-skeleton" />
            </div>
          </div>

          {/* Add to Cart button */}
          <div className="pt-4">
            <div className="h-12 md:h-14 w-full rounded-2xl ds-skeleton" />
          </div>

          {/* Highlights / Description */}
          <div className="space-y-2 pt-4 border-t border-slate-100">
            <div className="h-4 w-32 rounded ds-skeleton" />
            <div className="h-3.5 w-full rounded ds-skeleton" />
            <div className="h-3.5 w-5/6 rounded ds-skeleton" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ProductDetailSkeleton);

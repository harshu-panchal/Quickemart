import React from "react";
import { cn } from "@/lib/utils";

const ProductCardSkeleton = ({ compact = false, className = "" }) => {
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between rounded-xl md:rounded-2xl border border-slate-100 bg-white p-1.5 sm:p-2 md:p-3 shadow-xs select-none pointer-events-none",
        compact ? "h-[200px] sm:h-[220px]" : "h-[220px] sm:h-[250px] md:h-[280px]",
        className,
      )}
      aria-hidden="true"
    >
      <div>
        {/* Product Image Placeholder */}
        <div className="relative aspect-square w-full rounded-lg md:rounded-xl overflow-hidden mb-1.5 md:mb-2 ds-skeleton" />

        {/* Weight Tag Skeleton */}
        <div className="flex items-center justify-between mb-1">
          <div className="h-2.5 sm:h-3 w-12 rounded ds-skeleton" />
          <div className="h-2.5 sm:h-3 w-6 rounded ds-skeleton opacity-60" />
        </div>

        {/* Title Placeholder (2 lines) */}
        <div className="space-y-1 mb-1.5">
          <div className="h-2.5 sm:h-3.5 w-full rounded ds-skeleton" />
          <div className="h-2.5 sm:h-3.5 w-3/4 rounded ds-skeleton" />
        </div>

        {/* Delivery Time Badge */}
        <div className="flex items-center gap-1 mb-2">
          <div className="h-2 sm:h-2.5 w-2 sm:w-2.5 rounded-full ds-skeleton" />
          <div className="h-2 sm:h-2.5 w-14 rounded ds-skeleton" />
        </div>
      </div>

      {/* Price & Add Button Row */}
      <div className="mt-auto flex items-center justify-between pt-1 border-t border-slate-50 min-h-[28px] sm:min-h-[32px]">
        <div className="flex flex-col gap-0.5">
          <div className="h-3 sm:h-4 w-10 sm:w-12 rounded ds-skeleton" />
          <div className="h-2 w-7 rounded ds-skeleton opacity-50" />
        </div>
        <div className="h-6 sm:h-7 w-12 sm:w-16 rounded-lg md:rounded-xl ds-skeleton" />
      </div>
    </div>
  );
};

export default React.memo(ProductCardSkeleton);

import React from "react";
import ProductCardSkeleton from "./ProductCardSkeleton";

const OfferSectionSkeleton = ({ count = 4 }) => {
  return (
    <div className="w-full mb-4 overflow-hidden bg-white border-y border-slate-100 shadow-xs select-none" aria-hidden="true">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 md:px-8 py-4 bg-slate-50 border-b border-slate-100">
        <div className="space-y-1.5">
          <div className="h-5 sm:h-6 w-36 sm:w-48 rounded ds-skeleton" />
          <div className="h-3 w-24 sm:w-32 rounded ds-skeleton opacity-60" />
        </div>
        <div className="h-7 w-20 rounded-full ds-skeleton" />
      </div>

      {/* Products Row */}
      <div className="p-3 sm:p-4 md:p-6 overflow-x-hidden flex gap-2.5 sm:gap-4">
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="w-[140px] sm:w-[160px] md:w-[180px] shrink-0">
            <ProductCardSkeleton compact={true} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(OfferSectionSkeleton);

import React from "react";
import ProductCardSkeleton from "./ProductCardSkeleton";

const CategoryPageSkeleton = () => {
  return (
    <div className="flex flex-1 relative items-start select-none w-full" aria-hidden="true">
      {/* Sidebar Skeleton */}
      <aside className="w-[70px] sm:w-[85px] border-r border-slate-100 flex flex-col gap-4 py-4 sticky top-[60px] h-[calc(100vh-60px)] shrink-0 bg-white">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 px-1">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl ds-skeleton" />
            <div className="w-8 sm:w-10 h-2 rounded-full ds-skeleton opacity-60" />
          </div>
        ))}
      </aside>

      {/* Main Content Grid Skeleton */}
      <main className="flex-1 p-2 sm:p-4 pb-24">
        {/* Subcategory Filter Pills */}
        <div className="flex items-center gap-2 overflow-hidden pb-3 mb-3 border-b border-slate-100">
          <div className="h-7 w-16 rounded-full ds-skeleton shrink-0" />
          <div className="h-7 w-20 rounded-full ds-skeleton shrink-0" />
          <div className="h-7 w-24 rounded-full ds-skeleton shrink-0" />
          <div className="h-7 w-16 rounded-full ds-skeleton shrink-0 opacity-50" />
        </div>

        {/* Product Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCardSkeleton key={i} compact={true} />
          ))}
        </div>
      </main>
    </div>
  );
};

export default React.memo(CategoryPageSkeleton);

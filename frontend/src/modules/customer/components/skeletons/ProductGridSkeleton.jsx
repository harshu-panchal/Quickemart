import React from "react";
import ProductCardSkeleton from "./ProductCardSkeleton";
import { cn } from "@/lib/utils";

const ProductGridSkeleton = ({ count = 6, compact = true, className = "" }) => {
  return (
    <div
      className={cn(
        "grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 md:gap-6",
        className
      )}
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <ProductCardSkeleton key={idx} compact={compact} />
      ))}
    </div>
  );
};

export default React.memo(ProductGridSkeleton);

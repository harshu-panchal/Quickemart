import React from "react";
import { cn } from "@/lib/utils";

const BannerCarouselSkeleton = ({ className = "", edgeToEdge = false }) => {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden select-none",
        edgeToEdge ? "rounded-none" : "container mx-auto px-4 md:px-8 py-2 md:py-4",
        className
      )}
      aria-hidden="true"
    >
      <div
        className={cn(
          "w-full ds-skeleton",
          edgeToEdge
            ? "h-[180px] sm:h-[220px] md:h-[300px] rounded-none"
            : "h-[160px] sm:h-[200px] md:h-[280px] rounded-2xl md:rounded-3xl"
        )}
      />
      {/* Slide dots placeholder */}
      <div className="flex justify-center items-center gap-1.5 mt-2.5">
        <div className="h-1.5 w-6 rounded-full ds-skeleton bg-primary/40" />
        <div className="h-1.5 w-2 rounded-full ds-skeleton opacity-60" />
        <div className="h-1.5 w-2 rounded-full ds-skeleton opacity-60" />
      </div>
    </div>
  );
};

export default React.memo(BannerCarouselSkeleton);

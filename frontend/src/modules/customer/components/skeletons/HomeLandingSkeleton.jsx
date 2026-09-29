import React from "react";
import BannerCarouselSkeleton from "./BannerCarouselSkeleton";
import QuickCategorySliderSkeleton from "./QuickCategorySliderSkeleton";
import ProductGridSkeleton from "./ProductGridSkeleton";
import OfferSectionSkeleton from "./OfferSectionSkeleton";

const HomeLandingSkeleton = () => {
  return (
    <div className="w-full min-h-screen bg-[#F5F7F8] pb-16 select-none" aria-hidden="true">
      {/* Top Banner Skeleton */}
      <div className="block md:hidden">
        <BannerCarouselSkeleton edgeToEdge={true} />
      </div>

      <div className="hidden md:block container mx-auto px-4 md:px-8 pt-4">
        <BannerCarouselSkeleton edgeToEdge={false} />
      </div>

      {/* Promo Marquee Placeholder */}
      <div className="w-full h-8 bg-slate-100 border-y border-slate-200/60 my-2 ds-skeleton opacity-75" />

      {/* Quick Category Slider Skeleton */}
      <QuickCategorySliderSkeleton />

      {/* Lowest Price Section Skeleton */}
      <div className="container mx-auto px-4 md:px-8 lg:px-[50px] my-6 md:my-10">
        <div className="bg-white rounded-3xl p-4 sm:p-6 md:p-8 border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <div className="space-y-2">
              <div className="h-5 sm:h-7 w-40 sm:w-56 rounded-lg ds-skeleton" />
              <div className="h-3 sm:h-4 w-28 sm:w-40 rounded ds-skeleton opacity-70" />
            </div>
            <div className="h-8 w-24 rounded-full ds-skeleton opacity-60" />
          </div>

          <ProductGridSkeleton count={6} compact={true} />
        </div>
      </div>

      {/* Dynamic Offer Section Skeleton */}
      <div className="container mx-auto px-4 md:px-8 lg:px-[50px]">
        <OfferSectionSkeleton count={5} />
      </div>
    </div>
  );
};

export default React.memo(HomeLandingSkeleton);

import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import ProductCard from "../shared/ProductCard";

const LowestPriceSection = ({ products, isLoading, onSeeAll }) => {
  const [visibleCount, setVisibleCount] = useState(12);

  // Reset visibleCount whenever products list changes (e.g. category switch)
  useEffect(() => {
    setVisibleCount(12);
  }, [products]);

  const handleSeeMore = () => {
    if (products && visibleCount < products.length) {
      setVisibleCount((prev) => prev + 12);
    } else if (onSeeAll) {
      onSeeAll();
    }
  };

  const hasMoreLocal = products && visibleCount < products.length;

  return (
    <div className="-mt-[40px] mb-4 md:-mt-[40px] md:mb-8">
      <div className="relative overflow-hidden bg-linear-to-br from-primary/10 via-primary/5 to-transparent pt-7 pb-2 md:pt-16 md:pb-4 border-y border-primary/10 shadow-sm md:shadow-[inset_0_-10px_40px_rgba(0,0,0,0.02)]">
        {/* Background Decoration */}
        <div className="absolute -top-10 -right-10 h-40 w-40 md:h-80 md:w-80 bg-primary/10 rounded-full blur-3xl opacity-60" />
        <div className="absolute -bottom-10 -left-10 h-40 w-40 md:h-80 md:w-80 bg-yellow-400/10 rounded-full blur-3xl opacity-60" />

        <div className="container mx-auto px-4 md:px-8 lg:px-[50px] relative z-10">
          <div className="flex justify-between items-center mb-6 md:mb-10 px-1">
            <div className="flex flex-col">
              <h3 className="text-base md:text-xl font-black text-[#1A1A1A] tracking-tight uppercase leading-none pt-[25px]">
                Lowest Price <span className="text-primary">ever</span>
              </h3>
              <div className="flex items-center gap-1.5 md:gap-2 mt-1.5 md:mt-3">
                <div className="h-1 w-1 md:h-2 md:w-2 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(12,131,31,0.5)]" />
                <span className="text-[10px] md:text-xs font-bold text-primary uppercase tracking-wide opacity-80">
                  Unbeatable Savings • Updated hourly
                </span>
              </div>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 md:gap-6 pb-2 md:pb-4">
            {isLoading ? (
              Array.from({ length: 12 }).map((_, idx) => (
                <div key={idx} className="animate-pulse">
                  <div className="bg-slate-200/80 rounded-2xl h-44 w-full border border-slate-100" />
                </div>
              ))
            ) : products && products.length > 0 ? (
              products.slice(0, visibleCount).map((product) => (
                <div key={product.id} className="smooth-transform">
                  <ProductCard
                    product={product}
                    className="bg-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.1)] md:shadow-[0_15px_30px_rgba(0,0,0,0.05)] border-brand-50/50 md:border-slate-100 transition-all"
                    compact={true}
                  />
                </div>
              ))
            ) : (
              <div className="col-span-full py-8 text-center text-slate-400 font-bold text-xs md:text-sm tracking-wide">
                No products found in this category at the moment. Check back soon!
              </div>
            )}
          </div>

          {/* See More Button below the 6 product cards */}
          {products && products.length > 0 && !isLoading && (
            <div className="flex justify-center mt-2 mb-4 md:mt-4 md:mb-6">
              <button
                onClick={handleSeeMore}
                className="flex items-center gap-1.5 bg-white px-5 py-2 md:px-7 md:py-2.5 rounded-full text-primary font-black text-[12px] md:text-sm cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:shadow-lg border border-primary/20 transition-all hover:scale-105 active:scale-95 uppercase tracking-wide">
                {hasMoreLocal ? "See More" : "See All Products"}
                {hasMoreLocal ? (
                  <ChevronDown size={14} strokeWidth={3} className="ml-0.5 animate-bounce" />
                ) : (
                  <ChevronRight size={14} strokeWidth={3} className="ml-0.5" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(LowestPriceSection);

import React from "react";

const QuickCategorySliderSkeleton = () => {
  return (
    <div className="relative w-full overflow-hidden bg-slate-50/70 border-y border-slate-100 py-3 md:py-4 select-none" aria-hidden="true">
      <div className="flex justify-center mb-3">
        <div className="h-4 sm:h-5 w-32 sm:w-40 rounded-full ds-skeleton" />
      </div>

      <div className="flex items-center gap-2.5 md:gap-4 overflow-x-hidden px-4 md:px-8">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div
            key={idx}
            className="flex flex-col items-center gap-1.5 min-w-[100px] sm:min-w-[120px] md:min-w-[140px] flex-shrink-0"
          >
            <div className="w-[88px] h-[88px] sm:w-[104px] sm:h-[104px] md:w-[120px] md:h-[120px] rounded-2xl ds-skeleton" />
            <div className="h-3 w-16 sm:w-20 rounded ds-skeleton mt-1" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(QuickCategorySliderSkeleton);

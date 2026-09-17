import React, { useRef, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { QUICK_CATEGORY_PALETTES } from "../../constants/homeConstants";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";
import QuickCategoriesBg from "@/assets/Catagorysection_bg.png";

const QuickCategorySlider = ({ categories, onCategoryClick }) => {
  const scrollRef = useRef(null);
  const isInteractingRef = useRef(false);
  const resumeTimeoutRef = useRef(null);
  const animFrameRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -250 : 250;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  const handleUserInteractionStart = () => {
    isInteractingRef.current = true;
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
  };

  const handleUserInteractionEnd = () => {
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => {
      isInteractingRef.current = false;
    }, 2000);
  };

  // Duplicate items for infinite seamless scroll
  const displayCategories = useMemo(() => {
    if (!categories || categories.length === 0) return [];
    if (categories.length < 8) {
      return [...categories, ...categories, ...categories, ...categories];
    }
    return [...categories, ...categories];
  }, [categories]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || displayCategories.length === 0) return;

    // Slow and smooth auto-scroll speed (pixels per frame)
    const speed = 0.5;

    const animate = () => {
      if (el && !isInteractingRef.current) {
        el.scrollLeft += speed;

        // Loop seamlessly when half of doubled content is scrolled
        const halfWidth = el.scrollWidth / 2;
        if (halfWidth > 0 && el.scrollLeft >= halfWidth) {
          el.scrollLeft -= halfWidth;
        }
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    };
  }, [displayCategories]);

  if (!categories || categories.length === 0) return null;

  return (
    <div className="w-full mb-5 -mt-[24px] md:mt-3 overflow-hidden relative group z-20">
      <div
        className="relative overflow-hidden bg-white shadow-[0_14px_28px_rgba(15,23,42,0.09)]"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.65) 100%), url(${QuickCategoriesBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}>
        <div className="absolute inset-0 bg-white/10 pointer-events-none" />

        <div className="relative z-10 px-4 pt-2.5 pb-0.5 md:px-8 md:pt-4">
          <h2 className="text-center text-[17px] md:text-[20px] font-bold tracking-tight text-[#132018] leading-none">
            Quick categories
          </h2>
        </div>

        {/* Left Scroll Button */}
        <div className="absolute left-4 lg:left-10 top-[58%] -translate-y-1/2 z-20 hidden md:flex">
          <button
            onClick={() => {
              handleUserInteractionStart();
              scroll("left");
              handleUserInteractionEnd();
            }}
            className="h-10 w-10 bg-white/90 backdrop-blur-md shadow-xl rounded-full flex items-center justify-center border border-gray-100 cursor-pointer hover:bg-white text-primary transition-all active:scale-90">
            <ChevronLeft size={22} strokeWidth={3} />
          </button>
        </div>

        <div
          ref={scrollRef}
          onTouchStart={handleUserInteractionStart}
          onTouchEnd={handleUserInteractionEnd}
          onMouseDown={handleUserInteractionStart}
          onMouseUp={handleUserInteractionEnd}
          onWheel={() => {
            handleUserInteractionStart();
            handleUserInteractionEnd();
          }}
          onMouseEnter={handleUserInteractionStart}
          onMouseLeave={handleUserInteractionEnd}
          className="relative z-10 flex items-start gap-2 md:gap-3 lg:gap-4 overflow-x-auto no-scrollbar px-4 pb-2 pt-1 md:px-8 md:pb-4 select-none">
          {displayCategories.map((cat, idx) => {
            const palette = QUICK_CATEGORY_PALETTES[idx % QUICK_CATEGORY_PALETTES.length];
            return (
              <div
                key={`${cat.id || cat._id}-${idx}`}
                onClick={() => onCategoryClick(cat.id || cat._id)}
                className="flex flex-col items-center gap-0.5 min-w-[114px] md:min-w-[150px] lg:min-w-[168px] cursor-pointer group/item transition-transform active:scale-95 flex-shrink-0">
                <div
                  className="relative w-[114px] h-[128px] md:w-[150px] md:h-[168px] lg:w-[168px] lg:h-[186px] rounded-[24px] md:rounded-[28px] shadow-[0_12px_26px_rgba(15,23,42,0.14)] border flex items-start justify-center p-1.5 md:p-2 transition-all duration-300 group-hover/item:-translate-y-1 group-hover/item:shadow-[0_20px_38px_rgba(15,23,42,0.18)] overflow-hidden smooth-transform"
                  style={{
                    backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.6) 24%, rgba(255,255,255,0.15) 100%), linear-gradient(135deg, ${palette.bgFrom}, ${palette.bgVia}, ${palette.bgTo})`,
                    borderColor: palette.frameColor,
                  }}>
                  <div
                    className="absolute inset-0 opacity-40 pointer-events-none"
                    style={{ backgroundColor: palette.glowColor }}
                  />
                  <img
                    src={applyCloudinaryTransform(cat.image, "f_auto,q_auto,w_350")}
                    alt={cat.name}
                    loading="lazy"
                    className="absolute left-1/2 top-1 md:top-1 z-10 h-[102px] w-[102px] md:h-[128px] md:w-[128px] lg:h-[142px] lg:w-[142px] -translate-x-1/2 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.14)] mix-blend-multiply group-hover/item:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-x-1.5 md:inset-x-2 bottom-2 md:bottom-2.5 z-20 text-center">
                    <span className="block text-[12px] md:text-[14px] lg:text-[15px] font-black text-[#1f2b20] leading-tight whitespace-nowrap overflow-hidden text-ellipsis drop-shadow-[0_1px_0_rgba(255,255,255,0.85)] group-hover/item:text-primary transition-colors">
                      {cat.name}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Scroll Button */}
        <div className="absolute right-4 lg:right-10 top-[58%] -translate-y-1/2 z-20 hidden md:flex">
          <button
            onClick={() => {
              handleUserInteractionStart();
              scroll("right");
              handleUserInteractionEnd();
            }}
            className="h-10 w-10 bg-white/90 backdrop-blur-md shadow-xl rounded-full flex items-center justify-center border border-gray-100 cursor-pointer hover:bg-white text-primary transition-all active:scale-90">
            <ChevronRight size={22} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(QuickCategorySlider);

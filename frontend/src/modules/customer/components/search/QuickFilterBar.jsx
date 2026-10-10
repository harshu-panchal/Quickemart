import React from 'react';
import { SlidersHorizontal, ArrowUpDown, Star, Percent, ChevronDown } from 'lucide-react';
import { SORT_OPTIONS } from './SortByModal';

const QuickFilterBar = ({
    selectedSort,
    onOpenSortModal,
    activeFilters,
    onToggleRatingPill,
    onToggleOffersPill,
    onOpenFilterDrawer,
}) => {
    const scrollRef = React.useRef(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [startX, setStartX] = React.useState(0);
    const [scrollLeft, setScrollLeft] = React.useState(0);

    const handleMouseDown = (e) => {
        setIsDragging(true);
        setStartX(e.pageX - (scrollRef.current?.offsetLeft || 0));
        setScrollLeft(scrollRef.current?.scrollLeft || 0);
    };

    const handleMouseLeaveOrUp = () => {
        setIsDragging(false);
    };

    const handleMouseMove = (e) => {
        if (!isDragging || !scrollRef.current) return;
        e.preventDefault();
        const x = e.pageX - scrollRef.current.offsetLeft;
        const walk = (x - startX) * 1.5;
        scrollRef.current.scrollLeft = scrollLeft - walk;
    };

    // Count active filters (excluding default sort)
    const activeFilterCount =
        (activeFilters.minRating ? 1 : 0) +
        (activeFilters.onlyOffers ? 1 : 0) +
        (activeFilters.onlyInStock ? 1 : 0) +
        (activeFilters.brands?.length || 0) +
        (activeFilters.categories?.length || 0);

    const activeSortLabel = SORT_OPTIONS.find((s) => s.id === selectedSort && s.id !== 'relevance')?.label;

    return (
        <div className="w-full bg-white border-b border-slate-100 py-2.5 sticky top-[72px] z-40 shadow-xs select-none">
            <div
                ref={scrollRef}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeaveOrUp}
                onMouseUp={handleMouseLeaveOrUp}
                onMouseMove={handleMouseMove}
                className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 px-4 pr-8 cursor-grab active:cursor-grabbing touch-pan-x"
            >
                {/* 1. All Filters Pill */}
                <button
                    type="button"
                    onClick={onOpenFilterDrawer}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                        activeFilterCount > 0
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                >
                    <SlidersHorizontal size={14} strokeWidth={2.5} className="text-slate-600" />
                    <span>Filters</span>
                    {activeFilterCount > 0 && (
                        <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center">
                            {activeFilterCount}
                        </span>
                    )}
                    <ChevronDown size={12} strokeWidth={3} className="text-slate-400" />
                </button>

                {/* 2. Sort Pill */}
                <button
                    type="button"
                    onClick={onOpenSortModal}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                        selectedSort !== 'relevance'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                >
                    <ArrowUpDown size={14} strokeWidth={2.5} className="text-slate-600" />
                    <span>{activeSortLabel ? `Sort: ${activeSortLabel.split(' ')[0]}` : 'Sort'}</span>
                    <ChevronDown size={12} strokeWidth={3} className="text-slate-400" />
                </button>

                {/* 3. Rating 4+ Pill */}
                <button
                    type="button"
                    onClick={onToggleRatingPill}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                        activeFilters.minRating === 4
                            ? 'bg-amber-50 border-amber-400 text-amber-800 shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                >
                    <Star
                        size={14}
                        className={activeFilters.minRating === 4 ? 'fill-amber-400 text-amber-400' : 'text-amber-400'}
                    />
                    <span>Rating 4+</span>
                </button>

                {/* 4. Offers Pill */}
                <button
                    type="button"
                    onClick={onToggleOffersPill}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                        activeFilters.onlyOffers
                            ? 'bg-blue-50 border-blue-400 text-blue-800 shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                >
                    <Percent size={14} strokeWidth={2.5} className="text-blue-500" />
                    <span>Offers</span>
                </button>
            </div>
        </div>
    );
};

export default QuickFilterBar;

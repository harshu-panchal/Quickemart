import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, Percent, Check, RefreshCw } from 'lucide-react';

const FilterDrawer = ({
    isOpen,
    onClose,
    availableBrands = [],
    availableCategories = [],
    activeFilters,
    onApplyFilters,
    onResetFilters,
}) => {
    const [localFilters, setLocalFilters] = useState(activeFilters);

    useEffect(() => {
        setLocalFilters(activeFilters);
    }, [activeFilters, isOpen]);

    if (!isOpen) return null;

    const handleBrandToggle = (brandName) => {
        setLocalFilters((prev) => {
            const current = prev.brands || [];
            const updated = current.includes(brandName)
                ? current.filter((b) => b !== brandName)
                : [...current, brandName];
            return { ...prev, brands: updated };
        });
    };

    const handleCategoryToggle = (catId) => {
        setLocalFilters((prev) => {
            const current = prev.categories || [];
            const updated = current.includes(catId)
                ? current.filter((id) => id !== catId)
                : [...current, catId];
            return { ...prev, categories: updated };
        });
    };

    const handleRatingSelect = (rating) => {
        setLocalFilters((prev) => ({
            ...prev,
            minRating: prev.minRating === rating ? null : rating,
        }));
    };

    const handleToggleOffers = () => {
        setLocalFilters((prev) => ({ ...prev, onlyOffers: !prev.onlyOffers }));
    };

    const handleToggleInStock = () => {
        setLocalFilters((prev) => ({ ...prev, onlyInStock: !prev.onlyInStock }));
    };

    const handleApply = () => {
        onApplyFilters(localFilters);
        onClose();
    };

    const handleReset = () => {
        const resetState = {
            minRating: null,
            onlyOffers: false,
            onlyInStock: false,
            brands: [],
            categories: [],
        };
        setLocalFilters(resetState);
        onResetFilters();
        onClose();
    };

    const displayBrands = availableBrands.length > 0 
        ? availableBrands 
        : (availableCategories || []).map(c => typeof c === 'string' ? { name: c, count: null } : { name: c.name, count: null });

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 z-[200] backdrop-blur-xs"
                    />

                    {/* Drawer Container */}
                    <motion.div
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                        className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:left-1/2 md:-translate-x-1/2 md:max-w-lg w-full bg-white rounded-t-3xl md:rounded-3xl shadow-2xl z-[201] overflow-hidden flex flex-col max-h-[85vh]"
                    >
                        {/* Mobile Drag Handle */}
                        <div className="md:hidden pt-3 pb-1 flex justify-center">
                            <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
                        </div>

                        {/* Drawer Header */}
                        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-black text-slate-800 tracking-tight">
                                    Filters
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleReset}
                                    className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1 px-2 py-1 rounded-lg"
                                >
                                    <RefreshCw size={12} /> Clear all
                                </button>
                                <button
                                    onClick={onClose}
                                    className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Filter Content */}
                        <div className="p-6 space-y-6 overflow-y-auto no-scrollbar flex-1">
                            {/* Rating Section */}
                            <div>
                                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-3">
                                    Customer Rating
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    {[4, 3].map((r) => {
                                        const isSelected = localFilters.minRating === r;
                                        return (
                                            <button
                                                key={r}
                                                type="button"
                                                onClick={() => handleRatingSelect(r)}
                                                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold border transition-all ${
                                                    isSelected
                                                        ? 'bg-amber-50 border-amber-400 text-amber-700 shadow-xs'
                                                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                                }`}
                                            >
                                                <Star size={14} className={isSelected ? 'fill-amber-400 text-amber-400' : 'text-amber-400'} />
                                                Rating {r}+
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Quick Offers & Availability Toggles */}
                            <div>
                                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-3">
                                    Preferences
                                </h4>
                                <div className="space-y-3">
                                    <label
                                        onClick={handleToggleOffers}
                                        className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-slate-100/80 cursor-pointer transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                                <Percent size={16} strokeWidth={2.5} />
                                            </div>
                                            <span className="text-xs font-bold text-slate-700">Offers & Discounts</span>
                                        </div>
                                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${localFilters.onlyOffers ? 'bg-primary border-primary text-white' : 'border-slate-300'}`}>
                                            {localFilters.onlyOffers && <Check size={14} strokeWidth={3} />}
                                        </div>
                                    </label>

                                    <label
                                        onClick={handleToggleInStock}
                                        className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-slate-100/80 cursor-pointer transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-xs">
                                                ✓
                                            </div>
                                            <span className="text-xs font-bold text-slate-700">In Stock Only</span>
                                        </div>
                                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${localFilters.onlyInStock ? 'bg-primary border-primary text-white' : 'border-slate-300'}`}>
                                            {localFilters.onlyInStock && <Check size={14} strokeWidth={3} />}
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Brand Filter */}
                            {displayBrands.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-3">
                                        Brands
                                    </h4>
                                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1 no-scrollbar">
                                        {displayBrands.map((b) => {
                                            const brandName = typeof b === 'string' ? b : b.name;
                                            const count = typeof b === 'object' ? b.count : null;
                                            const isSelected = (localFilters.brands || []).includes(brandName);
                                            return (
                                                <button
                                                    key={brandName}
                                                    type="button"
                                                    onClick={() => handleBrandToggle(brandName)}
                                                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                                                        isSelected
                                                            ? 'bg-brand-50 border-primary text-primary shadow-xs font-extrabold'
                                                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                                    }`}
                                                >
                                                    <span>{brandName}</span>
                                                    {count && (
                                                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-primary text-white' : 'bg-slate-200 text-slate-500'}`}>
                                                            {count}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer Action Buttons */}
                        <div className="p-4 border-t border-slate-100 bg-white flex items-center gap-3">
                            <button
                                onClick={handleApply}
                                className="w-full py-3.5 bg-primary hover:opacity-95 text-white font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-brand-100 transition-all active:scale-[0.99]"
                            >
                                Apply Filters
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default FilterDrawer;

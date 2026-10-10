import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export const SORT_OPTIONS = [
    { id: 'relevance', label: 'Relevance (default)' },
    { id: 'price_asc', label: 'Price (low to high)' },
    { id: 'price_desc', label: 'Price (high to low)' },
    { id: 'rating_desc', label: 'Rating (high to low)' },
    { id: 'discount_desc', label: 'Discount (high to low)' },
];

const SortByModal = ({ isOpen, onClose, selectedSort, onSelectSort }) => {
    // Prevent background page scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            const originalStyle = window.getComputedStyle(document.body).overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = originalStyle || '';
            };
        }
    }, [isOpen]);

    if (!isOpen) return null;

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

                    {/* Bottom Sheet / Modal Container */}
                    <motion.div
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                        className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:left-1/2 md:-translate-x-1/2 md:max-w-md w-full bg-white rounded-t-3xl md:rounded-3xl shadow-2xl z-[201] overflow-hidden"
                    >
                        {/* Mobile Drag Handle */}
                        <div className="md:hidden pt-3 pb-1 flex justify-center">
                            <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
                        </div>

                        {/* Modal Header */}
                        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
                            <h3 className="text-lg font-black text-slate-800 tracking-tight">
                                Sort by
                            </h3>
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Options List */}
                        <div className="p-4 space-y-1">
                            {SORT_OPTIONS.map((option) => {
                                const isSelected = selectedSort === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        onClick={() => {
                                            onSelectSort(option.id);
                                            onClose();
                                        }}
                                        className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-slate-50 transition-all text-left group"
                                    >
                                        {/* Custom Radio Icon matching Image 2 */}
                                        <div
                                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                                isSelected
                                                    ? 'border-emerald-600 bg-white'
                                                    : 'border-slate-300 group-hover:border-slate-400'
                                            }`}
                                        >
                                            {isSelected && (
                                                <div className="w-3 h-3 rounded-full bg-emerald-600" />
                                            )}
                                        </div>

                                        {/* Option Label */}
                                        <span
                                            className={`text-sm md:text-base font-bold transition-colors ${
                                                isSelected ? 'text-slate-900 font-extrabold' : 'text-slate-700'
                                            }`}
                                        >
                                            {option.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default SortByModal;

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2 } from 'lucide-react';

const SlideToPay = ({
    onSuccess,
    amount,
    isLoading = false,
    disabled = false,
    text = "Pay Now"
}) => {
    const [localLoading, setLocalLoading] = useState(false);

    const handleClick = async () => {
        if (disabled || isLoading || localLoading) return;
        if (onSuccess) {
            try {
                setLocalLoading(true);
                await onSuccess();
            } finally {
                setLocalLoading(false);
            }
        }
    };

    const isProcessing = isLoading || localLoading;

    return (
        <button
            onClick={handleClick}
            disabled={disabled || isProcessing}
            className={`relative h-16 w-full rounded-full overflow-hidden select-none shadow-xl transition-all duration-300 flex items-center justify-center border border-white/10 ${
                disabled
                    ? "bg-gradient-to-r from-slate-300 via-slate-400 to-slate-500 border-slate-200 cursor-not-allowed opacity-60"
                    : "bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-700 shadow-purple-500/30 active:scale-[0.98] cursor-pointer"
            }`}
        >
            {/* Shimmer Effect Background */}
            {!disabled && !isProcessing && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <motion.div
                        className="absolute inset-y-0 -inset-x-1 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg]"
                        initial={{ x: "-100%" }}
                        animate={{ x: "100%" }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
                    />
                </div>
            )}

            <div className="flex items-center gap-3 text-white font-black text-sm md:text-[14px] tracking-[0.25em] uppercase">
                {isProcessing ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Processing...</span>
                    </>
                ) : (
                    <>
                        <span>{text === "Slide to Pay" ? "PAY NOW" : text}</span>
                        <span className="text-white/40">|</span>
                        <span className="text-brand-50 font-extrabold">₹{amount}</span>
                        <ArrowRight size={18} strokeWidth={3} className="ml-1" />
                    </>
                )}
            </div>
        </button>
    );
};

export default SlideToPay;

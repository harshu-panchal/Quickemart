import React from "react";
import StarRating from "./StarRating";
import { CheckCircle2 } from "lucide-react";

export const RatingSummary = ({ averageRating = 0, reviewCount = 0, ratingDistribution = {} }) => {
    const total = reviewCount || 0;

    return (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-8">
            {/* Overall Score */}
            <div className="flex flex-col items-center justify-center text-center md:border-r md:border-slate-100 md:pr-8 min-w-[160px]">
                <div className="text-5xl font-black text-slate-900 tracking-tight mb-2">
                    {averageRating > 0 ? averageRating.toFixed(1) : "0.0"}
                </div>
                <StarRating value={Math.round(averageRating)} readOnly size={22} className="mb-2" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {total} {total === 1 ? "Rating" : "Ratings"}
                </p>
                <div className="mt-3 flex items-center gap-1 text-[11px] font-extrabold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                    <CheckCircle2 size={13} />
                    <span>Verified Purchases</span>
                </div>
            </div>

            {/* Rating Bars */}
            <div className="flex-1 w-full space-y-2.5">
                {[5, 4, 3, 2, 1].map((star) => {
                    const count = ratingDistribution[star] || 0;
                    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;

                    return (
                        <div key={star} className="flex items-center gap-3 text-xs font-bold text-slate-600">
                            <span className="w-8 flex items-center gap-1 text-slate-700">
                                {star} <span className="text-amber-400">★</span>
                            </span>
                            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-amber-400 rounded-full transition-all duration-500"
                                    style={{ width: `${percentage}%` }}
                                />
                            </div>
                            <span className="w-10 text-right text-slate-400 font-mono text-[11px]">
                                {percentage}%
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default RatingSummary;

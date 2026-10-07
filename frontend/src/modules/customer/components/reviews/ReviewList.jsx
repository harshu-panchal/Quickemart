import React, { useState } from "react";
import StarRating from "./StarRating";
import { CheckCircle2, Image as ImageIcon, Trash2, Edit2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@shared/components/ui/Toast";
import { customerApi } from "../../services/customerApi";

export const ReviewList = ({
    reviews = [],
    totalReviews = 0,
    currentPage = 1,
    totalPages = 1,
    onPageChange,
    selectedFilter = "all",
    onFilterChange,
    currentUserId,
    onEditReview,
    onReviewDeleted,
}) => {
    const { showToast } = useToast();
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [deletingId, setDeletingId] = useState(null);

    const handleDelete = async (reviewId) => {
        if (!window.confirm("Are you sure you want to delete your review?")) return;

        try {
            setDeletingId(reviewId);
            const res = await customerApi.deleteReview(reviewId);
            if (res.data?.success) {
                showToast("Review deleted successfully", "info");
                if (onReviewDeleted) onReviewDeleted(reviewId);
            }
        } catch (err) {
            showToast(err.response?.data?.message || "Failed to delete review", "error");
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="space-y-6">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-slate-100">
                {[
                    { id: "all", label: "All Reviews" },
                    { id: "5", label: "5 Stars ★" },
                    { id: "4", label: "4 Stars ★" },
                    { id: "3", label: "3 Stars ★" },
                    { id: "photos", label: "With Photos 📷" },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => onFilterChange && onFilterChange(tab.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            selectedFilter === tab.id
                                ? "bg-slate-900 text-white shadow-sm"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Review Cards */}
            {reviews.length > 0 ? (
                <div className="space-y-4">
                    {reviews.map((review) => {
                        const isAuthor =
                            currentUserId &&
                            (review.user?._id === currentUserId ||
                                review.userId === currentUserId ||
                                review.userId?._id === currentUserId);

                        return (
                            <div
                                key={review._id}
                                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md space-y-4"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold overflow-hidden border border-slate-200">
                                            {review.user?.image ? (
                                                <img
                                                    src={review.user.image}
                                                    alt={review.user.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <User size={18} />
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-black text-slate-800">
                                                    {review.user?.name || "QuickeMart Shopper"}
                                                </h4>
                                                {review.isVerifiedPurchase && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                                        <CheckCircle2 size={11} /> Verified Purchase
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <StarRating value={review.rating} readOnly size={14} />
                                                <span className="text-[11px] font-semibold text-slate-400">
                                                    {new Date(review.createdAt).toLocaleDateString("en-US", {
                                                        year: "numeric",
                                                        month: "short",
                                                        day: "numeric",
                                                    })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Author Actions */}
                                    {isAuthor && (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => onEditReview && onEditReview(review)}
                                                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                                title="Edit Review"
                                            >
                                                <Edit2 size={15} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(review._id)}
                                                disabled={deletingId === review._id}
                                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                title="Delete Review"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {review.comment && (
                                    <p className="text-sm text-slate-700 font-medium leading-relaxed">
                                        {review.comment}
                                    </p>
                                )}

                                {/* Review Photos */}
                                {review.photos && review.photos.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {review.photos.map((photo, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setSelectedPhoto(photo)}
                                                className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 hover:opacity-90 transition-opacity focus:outline-none"
                                            >
                                                <img
                                                    src={photo}
                                                    alt={`Review photo ${idx + 1}`}
                                                    className="w-full h-full object-cover"
                                                />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
                    <p className="text-sm font-bold text-slate-500">
                        No reviews found for this selection.
                    </p>
                </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <span className="text-xs font-bold text-slate-400">
                        Page {currentPage} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage <= 1}
                            onClick={() => onPageChange && onPageChange(currentPage - 1)}
                            className="rounded-xl font-bold"
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage >= totalPages}
                            onClick={() => onPageChange && onPageChange(currentPage + 1)}
                            className="rounded-xl font-bold"
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            {/* Photo Lightbox Modal */}
            {selectedPhoto && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setSelectedPhoto(null)}
                >
                    <div className="relative max-w-3xl max-h-[90vh]">
                        <img
                            src={selectedPhoto}
                            alt="Full size review photo"
                            className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReviewList;

import React, { useState } from "react";
import { Star, X, Check, ThumbsUp, ShieldCheck, Heart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@shared/components/ui/Toast";
import api from "@core/api/axios";

const TAG_OPTIONS = [
  { id: "ON_TIME", label: "⚡ On Time" },
  { id: "POLITE", label: "😊 Polite" },
  { id: "PROFESSIONAL", label: "💼 Professional" },
  { id: "GOOD_COMMUNICATION", label: "💬 Good Communication" },
  { id: "CAREFUL_HANDLING", label: "📦 Handled Package Carefully" },
];

export default function DeliveryRatingModal({
  isOpen,
  onClose,
  orderId,
  deliveryPartner,
  onSuccess,
}) {
  const { showToast } = useToast();
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [review, setReview] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const toggleTag = (tagId) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orderId) {
      showToast("Order ID missing", "error");
      return;
    }
    if (!rating || rating < 1 || rating > 5) {
      showToast("Please select a rating between 1 and 5 stars", "error");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.post("/delivery-ratings", {
        orderId,
        rating,
        review: review.trim(),
        tags: selectedTags,
      });

      if (res.data?.success) {
        showToast("Thank you! Your delivery rating has been submitted.", "success");
        if (onSuccess) {
          onSuccess(res.data.result?.rating);
        }
        onClose();
      } else {
        showToast(res.data?.message || "Failed to submit rating", "error");
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.message || "Failed to submit rating";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg overflow-hidden rounded-[2.5rem] bg-white p-6 md:p-8 shadow-2xl border border-slate-100"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-6 top-6 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>

          {/* Header */}
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 shadow-inner">
              <Heart size={32} className="fill-brand-500 text-brand-500 animate-pulse" />
            </div>
            <h2 className="text-2xl font-[1000] tracking-tight text-slate-900">
              Rate Your Delivery
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Help us recognize great service from your delivery partner
            </p>
          </div>

          {/* Delivery Partner Info */}
          {deliveryPartner && (
            <div className="mt-5 flex items-center gap-4 rounded-2xl bg-slate-50 p-4 border border-slate-100">
              <div className="h-12 w-12 overflow-hidden rounded-full bg-slate-200 border-2 border-white shadow-sm shrink-0">
                <img
                  src={
                    deliveryPartner.profileImage ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                      deliveryPartner.name || "Partner"
                    )}`
                  }
                  alt={deliveryPartner.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-900 text-base truncate">
                  {deliveryPartner.name || "Delivery Partner"}
                </h4>
                <p className="text-xs font-medium text-slate-500 capitalize flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-500 inline" />
                  Verified QuickeMart Partner
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            {/* Interactive Star Rating */}
            <div className="text-center">
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => {
                  const isFilled = star <= (hoverRating || rating);
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-1 transition-transform hover:scale-125 focus:outline-none"
                    >
                      <Star
                        size={38}
                        className={
                          isFilled
                            ? "fill-amber-400 text-amber-400 drop-shadow-md"
                            : "text-slate-200 fill-slate-50"
                        }
                      />
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs font-bold text-slate-600 uppercase tracking-widest">
                {rating === 5 && "⭐ Outstanding Service"}
                {rating === 4 && "👍 Very Good Delivery"}
                {rating === 3 && "👌 Satisfactory"}
                {rating === 2 && "👎 Could Be Better"}
                {rating === 1 && "⚠️ Disappointing"}
              </p>
            </div>

            {/* Quick Feedback Tags */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                What went well? (Optional)
              </label>
              <div className="flex flex-wrap gap-2">
                {TAG_OPTIONS.map((tag) => {
                  const isSelected = selectedTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                        isSelected
                          ? "bg-brand-50 border-brand-200 text-brand-700 shadow-sm"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional Comment */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                Share details (Optional)
              </label>
              <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Write a compliment or feedback for your delivery partner..."
                className="w-full rounded-2xl border border-slate-200 p-4 text-sm font-medium text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/10 placeholder:text-slate-400"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-[2] rounded-2xl bg-brand-500 py-3.5 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-brand-400 shadow-lg shadow-brand-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <div className="h-4 w-4 rounded-full border-2 border-slate-950/30 border-t-slate-950 animate-spin" />
                ) : (
                  <>
                    Submit Rating <ThumbsUp size={14} />
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

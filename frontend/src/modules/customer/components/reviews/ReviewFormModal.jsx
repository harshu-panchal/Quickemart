import React, { useState, useEffect } from "react";
import { X, Upload, Trash2, Camera, ShieldCheck } from "lucide-react";
import StarRating from "./StarRating";
import { Button } from "@/components/ui/button";
import { customerApi } from "../../services/customerApi";
import { useToast } from "@shared/components/ui/Toast";

export const ReviewFormModal = ({
    isOpen,
    onClose,
    productId,
    existingReview = null,
    onSuccess,
}) => {
    const { showToast } = useToast();
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState("");
    const [photos, setPhotos] = useState([]);
    const [uploadingPhotos, setUploadingPhotos] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (existingReview) {
            setRating(existingReview.rating || 5);
            setComment(existingReview.comment || "");
            setPhotos(existingReview.photos || []);
        } else {
            setRating(5);
            setComment("");
            setPhotos([]);
        }
    }, [existingReview, isOpen]);

    if (!isOpen) return null;

    const handlePhotoUpload = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        if (photos.length + files.length > 5) {
            showToast("Maximum 5 photos allowed per review", "error");
            return;
        }

        setUploadingPhotos(true);

        files.forEach((file) => {
            if (file.size > 5 * 1024 * 1024) {
                showToast(`File ${file.name} exceeds 5MB size limit`, "error");
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                setPhotos((prev) => [...prev, reader.result]);
            };
            reader.readAsDataURL(file);
        });

        setUploadingPhotos(false);
    };

    const handleRemovePhoto = (index) => {
        setPhotos((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!rating) {
            showToast("Please select a star rating", "error");
            return;
        }

        try {
            setIsSubmitting(true);
            const payload = {
                productId,
                rating,
                comment,
                photos,
            };

            const res = await customerApi.submitReview(payload);
            if (res.data?.success) {
                showToast(
                    existingReview ? "Review updated successfully!" : "Review posted successfully!",
                    "success"
                );
                if (onSuccess) onSuccess(res.data.result);
                onClose();
            }
        } catch (err) {
            showToast(err.response?.data?.message || "Failed to submit review", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-3xl p-6 md:p-8 shadow-2xl relative border border-slate-100 max-h-[90vh] overflow-y-auto">
                <button
                    onClick={onClose}
                    className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="mb-6">
                    <div className="flex items-center gap-2 text-xs font-black text-emerald-600 uppercase tracking-wider mb-1">
                        <ShieldCheck size={16} /> Verified Purchase Review
                    </div>
                    <h3 className="text-2xl font-black text-slate-800">
                        {existingReview ? "Edit Your Review" : "Write a Product Review"}
                    </h3>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
                            Select Rating <span className="text-rose-500">*</span>
                        </label>
                        <div className="p-4 bg-slate-50 rounded-2xl flex justify-center border border-slate-100">
                            <StarRating value={rating} onChange={setRating} size={32} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
                            Review Comment (Optional)
                        </label>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Share your thoughts about quality, packaging, freshness, or delivery..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all min-h-[100px]"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
                            Add Photos (Optional, max 5)
                        </label>
                        <div className="flex flex-wrap gap-3">
                            {photos.map((url, idx) => (
                                <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 group">
                                    <img src={url} alt={`Upload ${idx}`} className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => handleRemovePhoto(idx)}
                                        className="absolute top-1 right-1 p-1 bg-rose-500 text-white rounded-full opacity-90 hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}

                            {photos.length < 5 && (
                                <label className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 hover:border-primary flex flex-col items-center justify-center text-slate-400 hover:text-primary cursor-pointer transition-colors bg-slate-50">
                                    <Camera size={22} className="mb-1" />
                                    <span className="text-[10px] font-bold uppercase">Add Photo</span>
                                    <input
                                        type="file"
                                        accept="image/png, image/jpeg, image/webp"
                                        multiple
                                        onChange={handlePhotoUpload}
                                        className="hidden"
                                    />
                                </label>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            className="flex-1 h-12 rounded-2xl font-bold border-slate-200"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 h-12 bg-primary hover:bg-primary/90 text-white font-bold rounded-2xl shadow-lg shadow-primary/20"
                        >
                            {isSubmitting ? "Submitting..." : existingReview ? "Save Changes" : "Submit Review"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ReviewFormModal;

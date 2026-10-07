import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Heart, Plus, Minus, Star, ShieldCheck, Clock, ArrowLeft, MessageSquare, Edit3 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '@shared/components/ui/Toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { customerApi } from '../services/customerApi';
import { useLocation as useAppLocation } from '../context/LocationContext';
import { applyCloudinaryTransform } from '@/core/utils/imageUtils';
import { useSettings } from '@core/context/SettingsContext';
import { useAuth } from '@core/context/AuthContext';
import Lottie from 'lottie-react';
import { ProductDetailSkeleton } from '../components/skeletons';

import StarRating from '../components/reviews/StarRating';
import RatingSummary from '../components/reviews/RatingSummary';
import ReviewList from '../components/reviews/ReviewList';
import ReviewFormModal from '../components/reviews/ReviewFormModal';

const ProductDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { cart, addToCart, updateQuantity } = useCart();
    const { toggleWishlist: toggleWishlistGlobal, isInWishlist } = useWishlist();
    const { showToast } = useToast();
    const { currentLocation } = useAppLocation();
    const { settings } = useSettings();
    const { user, isAuthenticated } = useAuth();

    const [product, setProduct] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeImage, setActiveImage] = useState('');
    
    // Reviews state
    const [reviewsData, setReviewsData] = useState({
        reviews: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
    });
    const [reviewLoading, setReviewLoading] = useState(false);
    const [reviewFilter, setReviewFilter] = useState("all");
    const [reviewPage, setReviewPage] = useState(1);
    
    // Eligibility & Form Modal
    const [eligibility, setEligibility] = useState({ isEligible: false, reason: null, existingReview: null });
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [editingReview, setEditingReview] = useState(null);
    const [noServiceData, setNoServiceData] = useState(null);

    // Dynamically load no-service Lottie on mount
    useEffect(() => {
        import('@/assets/lottie/animation.json')
            .then((m) => setNoServiceData(m.default))
            .catch(() => {});
    }, []);

    const fetchData = async (showLoader = true) => {
        if (showLoader) setIsLoading(true);
        setError(null);
        try {
            const hasValidLocation =
                Number.isFinite(currentLocation?.latitude) &&
                Number.isFinite(currentLocation?.longitude);

            const params = hasValidLocation ? {
                lat: currentLocation.latitude,
                lng: currentLocation.longitude
            } : {};

            const res = await customerApi.getProductById(id, params);
            if (res.data.success) {
                const p = res.data.result;
                const primary = p.mainImage || p.image || null;
                const gallery = (p.galleryImages && Array.isArray(p.galleryImages))
                    ? p.galleryImages.filter(Boolean)
                    : [];
                let filteredGallery = [];
                if (primary && gallery.length > 0) {
                    filteredGallery = gallery.filter((img) => img !== primary);
                }
                const galleryImgs = filteredGallery.length > 0
                    ? filteredGallery
                    : (gallery.length > 0 ? gallery : [primary].filter(Boolean));

                const formatted = {
                    ...p,
                    id: p._id,
                    images: galleryImgs
                };
                setProduct(formatted);
                setActiveImage(formatted.images[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=600&auto=format&fit=crop');
                
                fetchReviews(1, reviewFilter);
                if (isAuthenticated) {
                    checkUserEligibility();
                }
            }
        } catch (err) {
            console.error("Fetch product error:", err);
            setError(err.response?.data?.message || "Failed to load product");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchReviews = async (page = 1, filter = "all") => {
        try {
            setReviewLoading(true);
            const params = { page, limit: 10 };
            if (filter === "5" || filter === "4" || filter === "3" || filter === "2" || filter === "1") {
                params.rating = filter;
            } else if (filter === "photos") {
                params.hasPhotos = "true";
            }

            const res = await customerApi.getProductReviews(id, params);
            if (res.data.success) {
                setReviewsData({
                    reviews: res.data.result?.reviews || res.data.results || [],
                    pagination: res.data.result?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 },
                });
            }
        } catch (error) {
            console.error("Fetch reviews error:", error);
        } finally {
            setReviewLoading(false);
        }
    };

    const checkUserEligibility = async () => {
        try {
            const res = await customerApi.checkEligibility(id);
            if (res.data.success) {
                setEligibility({
                    isEligible: res.data.result?.isEligible || false,
                    reason: res.data.result?.reason || null,
                    existingReview: res.data.result?.existingReview || null,
                });
            }
        } catch (err) {
            console.error("Check eligibility error:", err);
        }
    };

    useEffect(() => {
        if (id) {
            fetchData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, isAuthenticated]);

    useEffect(() => {
        if (id && product) {
            fetchData(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentLocation?.latitude, currentLocation?.longitude]);

    const handleFilterChange = (newFilter) => {
        setReviewFilter(newFilter);
        setReviewPage(1);
        fetchReviews(1, newFilter);
    };

    const handlePageChange = (newPage) => {
        setReviewPage(newPage);
        fetchReviews(newPage, reviewFilter);
    };

    const handleOpenReviewModal = (existing = null) => {
        setEditingReview(existing || eligibility.existingReview);
        setIsReviewModalOpen(true);
    };

    const handleReviewSuccess = () => {
        fetchReviews(1, reviewFilter);
        checkUserEligibility();
        fetchData(false); // Refresh rating aggregates on product
    };

    const handleToggleWishlist = () => {
        if (!product) return;
        toggleWishlistGlobal(product);
        const isWishlisted = isInWishlist(product.id);
        showToast(
            isWishlisted ? `${product.name} removed from wishlist` : `${product.name} added to wishlist`,
            isWishlisted ? 'info' : 'success'
        );
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50/50 pb-20">
                <div className="bg-white border-b border-slate-100 p-4 sticky top-0 z-10 flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors">
                        <ArrowLeft size={20} className="text-slate-600" />
                    </button>
                    <div className="h-5 w-40 rounded-lg ds-skeleton" />
                </div>
                <ProductDetailSkeleton />
            </div>
        );
    }

    if (error || !product) {
        return (
            <div className="min-h-screen bg-white py-20 px-8 flex flex-col items-center justify-center text-center">
                <div className="w-64 h-64 mb-6">
                    {noServiceData ? (
                        <Lottie animationData={noServiceData} loop={true} />
                    ) : (
                        <div className="w-64 h-64" />
                    )}
                </div>
                <h3 className="text-3xl font-[1000] text-slate-800 tracking-tighter mb-4 uppercase">
                    Item <span className="text-primary">Unavailable</span>
                </h3>
                <p className="text-slate-500 font-bold text-sm max-w-[280px] mb-8 leading-relaxed">
                    {error === "Product not available in your area" 
                        ? "This item is not available at your current location yet." 
                        : "We couldn't load this product details. Try again later!"}
                </p>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button 
                        onClick={() => navigate('/')}
                        className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 active:scale-95 transition-all shadow-xl shadow-black/10"
                    >
                        Go to Home
                    </button>
                    <button 
                        onClick={() => navigate(-1)}
                        className="px-10 py-4 bg-white text-slate-900 border border-slate-200 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    const cartItem = cart.find(item => item.id === product.id);
    const quantity = cartItem ? cartItem.quantity : 0;
    const isWishlisted = isInWishlist(product.id);

    const avgRating = Number(product.averageRating || 0);
    const totalReviewCount = Number(product.reviewCount || reviewsData.pagination.total || 0);
    const distribution = product.ratingDistribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    return (
        <div className="relative z-10 py-8 w-full max-w-[1920px] mx-auto px-4 md:px-[50px] animate-in fade-in duration-700 mt-24">
            <Link to={-1} className="inline-flex items-center gap-2 text-slate-500 hover:text-primary font-bold mb-6 transition-colors group">
                <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" /> Back
            </Link>

            <div className="flex flex-col lg:flex-row gap-10 xl:gap-16">
                <div className="lg:w-[45%] xl:w-[40%] space-y-4">
                    <div className="relative aspect-square rounded-[2rem] overflow-hidden bg-white border border-slate-100 shadow-sm transition-all hover:shadow-xl group">
                        <img
                            src={applyCloudinaryTransform(activeImage, "f_auto,q_auto,w_800")}
                            alt={product.name}
                            loading="lazy"
                            className="w-full h-full object-contain p-2 md:p-4 transition-transform duration-700 group-hover:scale-105"
                        />
                        <button
                            onClick={handleToggleWishlist}
                            className={cn(
                                "absolute top-5 right-5 p-3.5 rounded-full shadow-2xl transition-all duration-300 hover:scale-110",
                                isWishlisted ? "bg-red-50 text-red-500" : "bg-white text-slate-400"
                            )}
                        >
                            <Heart size={20} className={cn(isWishlisted && "fill-current")} />
                        </button>
                    </div>

                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                        {product.images.map((img, idx) => (
                            <button
                                key={idx}
                                onClick={() => setActiveImage(img)}
                                className={cn(
                                    "relative h-20 w-20 md:h-24 md:w-24 rounded-2xl overflow-hidden flex-shrink-0 transition-all border-2",
                                    activeImage === img ? "border-primary shadow-lg scale-95" : "border-transparent opacity-70 hover:opacity-100"
                                )}
                            >
                                <img src={applyCloudinaryTransform(img, "f_auto,q_auto,w_150")} alt={`Angle ${idx}`} loading="lazy" className="w-full h-full object-contain p-1" />
                            </button>
                        ))}
                    </div>
                </div>

                <div className="lg:w-[55%] xl:w-[60%] space-y-6 md:space-y-8">
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-primary/20">
                                {product.categoryId?.name || 'Essential'}
                            </span>
                            <div className="flex items-center gap-1.5 text-amber-600 font-bold bg-amber-50 px-3 py-1 rounded-full text-xs border border-amber-100">
                                <Star size={14} className="fill-amber-400 text-amber-400" />
                                <span>{avgRating > 0 ? avgRating.toFixed(1) : "New"}</span>
                                <span className="text-slate-400 font-normal">({totalReviewCount} {totalReviewCount === 1 ? "review" : "reviews"})</span>
                            </div>
                        </div>

                        <h1 className="text-3xl md:text-4xl font-black text-slate-800 leading-tight mb-3">
                            {product.name}
                        </h1>

                        {(() => {
                            const priceVal = Number(product.salePrice || product.price || 0);
                            const stockVal = Number(product.stock || 0);
                            const totalVariantStock = Array.isArray(product?.variants) && product.variants.length > 0
                              ? product.variants.reduce((acc, v) => acc + Number(v.stock || 0), 0)
                              : stockVal;
                            const effectiveStock = Math.max(stockVal, totalVariantStock);
                            const isItemOutOfStock = product.isOutOfStock || effectiveStock <= 0 || priceVal <= 0;

                            return (
                                <div className="flex items-baseline gap-4 mb-5">
                                    {isItemOutOfStock ? (
                                        <span className="text-2xl md:text-3xl font-extrabold text-rose-500 bg-rose-50 px-4 py-1.5 rounded-2xl border border-rose-100 uppercase tracking-wide">
                                            Out of Stock
                                        </span>
                                    ) : (
                                        <>
                                            <span className="text-4xl font-black text-primary">₹{product.salePrice || product.price}</span>
                                            {(product.salePrice && product.salePrice < product.price) && (
                                                <span className="text-lg text-slate-400 line-through font-bold">₹{product.price}</span>
                                            )}
                                            {product.salePrice && product.salePrice < product.price && (
                                                <span className="text-xs bg-red-50 text-red-500 px-2 py-1 rounded-lg font-black uppercase">
                                                    {Math.round(((product.price - product.salePrice) / product.price) * 100)}% OFF
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })()}

                        <p className="text-slate-600 text-lg leading-relaxed mb-6 font-medium max-w-2xl">
                            {product.description || "Fresh and premium quality product sourced directly from local vendors."}
                        </p>
                    </div>

                    {(() => {
                        const priceVal = Number(product.salePrice || product.price || 0);
                        const stockVal = Number(product.stock || 0);
                        const totalVariantStock = Array.isArray(product?.variants) && product.variants.length > 0
                          ? product.variants.reduce((acc, v) => acc + Number(v.stock || 0), 0)
                          : stockVal;
                        const effectiveStock = Math.max(stockVal, totalVariantStock);
                        const isItemOutOfStock = product.isOutOfStock || effectiveStock <= 0 || priceVal <= 0;

                        if (isItemOutOfStock) return null;

                        return (
                            <div className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100">
                                {quantity > 0 ? (
                                    <div className="flex items-center bg-primary text-primary-foreground rounded-2xl h-16 w-full sm:w-auto px-2 shadow-xl shadow-brand-100">
                                        <button
                                            onClick={() => updateQuantity(product.id, -1, "")}
                                            className="w-12 h-12 flex items-center justify-center hover:bg-white/20 rounded-xl transition-all"
                                        >
                                            <Minus size={24} strokeWidth={3} />
                                        </button>
                                        <span className="w-16 text-center font-black text-xl">{quantity}</span>
                                        <button
                                            onClick={() => updateQuantity(product.id, 1, "")}
                                            className="w-12 h-12 flex items-center justify-center hover:bg-white/20 rounded-xl transition-all"
                                        >
                                            <Plus size={24} strokeWidth={3} />
                                        </button>
                                    </div>
                                ) : (
                                    <Button
                                        onClick={async () => {
                                            const success = await addToCart(product);
                                            if (success) {
                                                showToast(`${product.name} added to cart`, 'success');
                                            }
                                        }}
                                        className="h-16 w-full sm:w-64 bg-primary hover:bg-[var(--brand-400)] text-white text-lg font-black rounded-2xl shadow-xl transition-all hover:-translate-y-1"
                                    >
                                        <Plus className="mr-2" size={24} strokeWidth={3} /> ADD TO CART
                                    </Button>
                                )}

                                <div className="flex flex-col gap-1 text-center sm:text-left">
                                    <span className="text-xs font-black text-primary uppercase tracking-widest flex items-center justify-center sm:justify-start gap-1">
                                        <ShieldCheck size={14} /> Quality Guaranteed
                                    </span>
                                    <span className="text-sm font-bold text-slate-400 flex items-center justify-center sm:justify-start gap-1">
                                        <Clock size={14} /> Delivered in 10-30 mins
                                    </span>
                                </div>
                            </div>
                        );
                    })()}

                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 text-center shadow-sm">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Weight</p>
                            <p className="text-sm font-black text-slate-800">{product.weight || '1 unit'}</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 text-center shadow-sm">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Stock</p>
                            <p className="text-sm font-black text-slate-800">
                              {((Number(product.stock || 0) > 0) || (Array.isArray(product?.variants) && product.variants.some(v => Number(v.stock || 0) > 0))) ? 'In Stock' : 'Out of Stock'}
                            </p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 text-center shadow-sm">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Brand</p>
                            <p className="text-sm font-black text-slate-800">{product.brand || 'Premium'}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Ratings & Reviews Section */}
            <div className="mt-20 border-t border-slate-100 pt-16 space-y-10">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <h3 className="text-3xl font-black text-slate-800">Customer Ratings & Reviews</h3>
                        <p className="text-slate-500 font-medium text-sm mt-1">
                            Verified ratings submitted by customers who purchased this item
                        </p>
                    </div>

                    {isAuthenticated && (
                        <div>
                            {eligibility.existingReview ? (
                                <Button
                                    onClick={() => handleOpenReviewModal(eligibility.existingReview)}
                                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl px-6 py-3 flex items-center gap-2"
                                >
                                    <Edit3 size={18} /> Edit Your Review
                                </Button>
                            ) : eligibility.isEligible ? (
                                <Button
                                    onClick={() => handleOpenReviewModal()}
                                    className="bg-primary hover:bg-primary/90 text-white font-bold rounded-2xl px-6 py-3 flex items-center gap-2 shadow-lg shadow-primary/20"
                                >
                                    <Star size={18} className="fill-current" /> Write a Review
                                </Button>
                            ) : (
                                <div className="text-xs font-bold text-slate-400 bg-slate-100 px-4 py-2.5 rounded-2xl border border-slate-200">
                                    Verified Purchase Required to Review
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Rating Summary Header */}
                <RatingSummary
                    averageRating={avgRating}
                    reviewCount={totalReviewCount}
                    ratingDistribution={distribution}
                />

                {/* Reviews List */}
                <ReviewList
                    reviews={reviewsData.reviews}
                    totalReviews={reviewsData.pagination.total}
                    currentPage={reviewsData.pagination.page}
                    totalPages={reviewsData.pagination.totalPages}
                    onPageChange={handlePageChange}
                    selectedFilter={reviewFilter}
                    onFilterChange={handleFilterChange}
                    currentUserId={user?._id || user?.id}
                    onEditReview={handleOpenReviewModal}
                    onReviewDeleted={handleReviewSuccess}
                />
            </div>

            {/* Write/Edit Review Modal */}
            <ReviewFormModal
                isOpen={isReviewModalOpen}
                onClose={() => setIsReviewModalOpen(false)}
                productId={id}
                existingReview={editingReview}
                onSuccess={handleReviewSuccess}
            />
        </div>
    );
};

export default ProductDetailPage;

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation as useRouterLocation } from 'react-router-dom';
import { Search, Mic, ArrowLeft, X, TrendingUp, ChevronRight, History } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { customerApi } from '../services/customerApi';
import ProductCard from '../components/shared/ProductCard';
import { useProductDetail } from '../context/ProductDetailContext';
import { useSettings } from '@core/context/SettingsContext';
import { cn } from '@/lib/utils';
import { useLocation as useAppLocation } from '../context/LocationContext';
import { getJSON, setJSON, STORAGE_KEYS } from '@core/utils/storage';
import Lottie from 'lottie-react';
import { SearchPageSkeleton } from '../components/skeletons';
import SortByModal from '../components/search/SortByModal';
import QuickFilterBar from '../components/search/QuickFilterBar';
import FilterDrawer from '../components/search/FilterDrawer';

const SearchPage = () => {
    const navigate = useNavigate();
    const location = useRouterLocation();
    const { isOpen: isProductDetailOpen } = useProductDetail();
    const { settings } = useSettings();
    const { currentLocation } = useAppLocation();
    const appName = settings?.appName || 'App';

    // Get initial query from URL state or params
    const initialQuery = location.state?.query || new URLSearchParams(location.search).get('q') || '';

    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [voiceTranscript, setVoiceTranscript] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
    const [noServiceData, setNoServiceData] = useState(null);
    const recognitionRef = useRef(null);

    // Filter & Sort State
    const [sortBy, setSortBy] = useState('relevance');
    const [isSortModalOpen, setIsSortModalOpen] = useState(false);
    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState({
        minRating: null,
        onlyOffers: false,
        onlyInStock: false,
        categories: []
    });

    // Manage Recent Searches with LocalStorage
    const [pastSearches, setPastSearches] = useState(() => {
        const saved = getJSON(STORAGE_KEYS.RECENT_SEARCHES, []);
        return Array.isArray(saved) ? saved.filter((s) => typeof s === 'string') : [];
    });

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Debounce Logic
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(query);
        }, 400); 
        return () => clearTimeout(timer);
    }, [query]);

    // Cleanup recognition on unmount
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, []);

    // Check if voice trigger is requested on navigation
    useEffect(() => {
        if (location.state?.triggerVoice) {
            // Replace location state so a refresh doesn't trigger it again
            navigate(location.pathname, { replace: true, state: {} });
            handleVoiceSearch();
        }
    }, [location.state]);

    // Voice Search Logic (Enhanced with Circular UI)
    const handleVoiceSearch = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Voice search is not supported in your browser. Please try Chrome.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = 'en-IN'; 
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onstart = () => {
            setIsListening(true);
            setVoiceTranscript('');
            setQuery(''); // Clear previous search if starting fresh
        };
        
        recognition.onend = () => {
            setIsListening(false);
        };
        
        recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                transcript += event.results[i][0].transcript;
            }

            if (transcript) {
                setVoiceTranscript(transcript);
                setQuery(transcript);
                // Save to history only if it's the final result
                if (event.results[event.results.length - 1].isFinal) {
                    saveSearch(transcript);
                    setIsListening(false);
                }
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            setIsListening(false);
            if (event.error === 'not-allowed') {
                alert('Microphone access denied. Please enable it in your browser settings.');
            } else {
                console.warn('Voice recognition stopped due to error:', event.error);
            }
        };

        try {
            recognition.start();
        } catch (e) {
            console.error('Recognition start error:', e);
            setIsListening(false);
        }
    };

    const handleCancelVoiceSearch = () => {
        if (recognitionRef.current) {
            recognitionRef.current.abort();
        }
        setIsListening(false);
        setVoiceTranscript('');
    };

    // Fetch products
    useEffect(() => {
        const fetchProducts = async () => {
            const hasValidLocation =
                Number.isFinite(currentLocation?.latitude) &&
                Number.isFinite(currentLocation?.longitude);
            if (!hasValidLocation) {
                setAllProducts([]);
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            try {
                const response = await customerApi.getProducts({
                    limit: 100,
                    lat: currentLocation.latitude,
                    lng: currentLocation.longitude,
                });
                if (response.data.success) {
                    const rawResult = response.data.result;
                    const dbProds = Array.isArray(response.data.results)
                        ? response.data.results
                        : Array.isArray(rawResult?.items)
                        ? rawResult.items
                        : Array.isArray(rawResult)
                        ? rawResult
                        : [];
                    const formattedProds = dbProds.map(p => ({
                        ...p,
                        id: p._id,
                        image:
                          p.mainImage ||
                          p.image ||
                          "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400",
                        price: p.salePrice || p.price,
                        originalPrice: p.price,
                        weight: p.weight || '1 unit',
                        deliveryTime: '10-30 mins'
                    }));
                    setAllProducts(formattedProds);
                }
            } catch (error) {
                console.error('Error fetching products:', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProducts();
    }, [currentLocation?.latitude, currentLocation?.longitude]);

    // Save search term to history
    const saveSearch = (term) => {
        if (!term.trim()) return;
        const updated = [term, ...pastSearches.filter(s => s !== term)].slice(0, 10);
        setPastSearches(updated);
        setJSON(STORAGE_KEYS.RECENT_SEARCHES, updated);
    };

    // Remove specific search term
    const handleRemoveSearch = (e, term) => {
        e.stopPropagation();
        const updated = pastSearches.filter(s => s !== term);
        setPastSearches(updated);
        setJSON(STORAGE_KEYS.RECENT_SEARCHES, updated);
    };

    // Trigger save on Enter or clicking a result
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && query.trim()) {
            saveSearch(query);
        }
    };

    // Extract available categories from current product set
    const availableCategories = useMemo(() => {
        const map = new Map();
        allProducts.forEach(p => {
            if (p.categoryId?._id && p.categoryId?.name) {
                map.set(p.categoryId._id, p.categoryId.name);
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [allProducts]);

    // Real-time filtering & sorting logic pipeline
    const processedResults = useMemo(() => {
        if (!debouncedQuery.trim()) return [];

        let list = allProducts.filter(p =>
            p.name?.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
            p.categoryId?.name?.toLowerCase().includes(debouncedQuery.toLowerCase())
        );

        // Filter: Category
        if (activeFilters.categories && activeFilters.categories.length > 0) {
            list = list.filter(p => activeFilters.categories.includes(p.categoryId?._id));
        }

        // Filter: Rating 4+ / 3+
        if (activeFilters.minRating) {
            list = list.filter(p => {
                const r = p.averageRating || p.rating || 0;
                return r >= activeFilters.minRating;
            });
        }

        // Filter: Offers
        if (activeFilters.onlyOffers) {
            list = list.filter(p => p.originalPrice && p.originalPrice > p.price);
        }

        // Filter: In Stock
        if (activeFilters.onlyInStock) {
            list = list.filter(p => (p.stock > 0 || p.inStock) && p.status !== 'OUT OF STOCK');
        }

        // Sort Pipeline
        switch (sortBy) {
            case 'price_asc':
                list.sort((a, b) => (a.price || 0) - (b.price || 0));
                break;
            case 'price_desc':
                list.sort((a, b) => (b.price || 0) - (a.price || 0));
                break;
            case 'rating_desc':
                list.sort((a, b) => {
                    const rA = a.averageRating || a.rating || 0;
                    const rB = b.averageRating || b.rating || 0;
                    return rB - rA;
                });
                break;
            case 'discount_desc':
                list.sort((a, b) => {
                    const origA = a.originalPrice || a.price || 1;
                    const saleA = a.price || 0;
                    const discA = origA > saleA ? ((origA - saleA) / origA) : 0;

                    const origB = b.originalPrice || b.price || 1;
                    const saleB = b.price || 0;
                    const discB = origB > saleB ? ((origB - saleB) / origB) : 0;

                    return discB - discA;
                });
                break;
            case 'relevance':
            default:
                break;
        }

        return list;
    }, [debouncedQuery, allProducts, activeFilters, sortBy]);

    useEffect(() => {
        setResults(processedResults);
    }, [processedResults]);

    // Trigger backend search activity logging when user searches
    useEffect(() => {
        if (debouncedQuery && debouncedQuery.trim().length >= 1) {
            customerApi.getProducts({
                search: debouncedQuery.trim(),
                lat: currentLocation?.latitude,
                lng: currentLocation?.longitude,
            }).catch((err) => console.error("Search activity log error:", err));
        }
    }, [debouncedQuery, currentLocation?.latitude, currentLocation?.longitude]);

    // Dynamically load no-service Lottie when results are empty
    useEffect(() => {
        if (!isLoading) {
            import('@/assets/lottie/animation.json')
                .then((m) => setNoServiceData(m.default))
                .catch(() => {});
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Lowest Price Section
    const lowestPriceProducts = useMemo(() => {
        return [...allProducts]
            .sort((a, b) => a.price - b.price)
            .slice(0, 10);
    }, [allProducts]);

    const handleClear = () => {
        setQuery('');
        setResults([]);
    };

    return (
        <div className="min-h-screen bg-white font-outfit">
            {/* Header / Search Input */}
            <div className={cn(
                "sticky top-0 z-50 bg-gradient-to-r from-primary to-[var(--brand-400)] shadow-[0_4px_20px_rgba(0,0,0,0.12)] relative overflow-hidden",
                isProductDetailOpen && "hidden md:block"
            )}>
                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12 blur-xl pointer-events-none" />

                <div className="px-4 pt-5 pb-6 flex items-center md:justify-center gap-3 relative z-10">
                        <button
                            onClick={() => navigate(-1)}
                            className="flex items-center justify-center w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full text-white backdrop-blur-md border border-white/10 transition-all flex-shrink-0 shadow-sm active:scale-90"
                        >
                            <ArrowLeft size={22} strokeWidth={2.5} />
                        </button>

                        <div className="flex-1 relative md:flex-none md:w-[500px] lg:w-[600px]">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
                                <Search size={18} strokeWidth={3} className="text-slate-400" />
                            </div>
                            <input
                                autoFocus
                                type="text"
                                placeholder='Search items, categories...'
                                value={query}
                                onKeyDown={handleKeyDown}
                                onChange={(e) => setQuery(e.target.value)}
                                className="w-full h-12 bg-white rounded-2xl pl-11 pr-14 shadow-xl shadow-black/10 border-none outline-none text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-medium focus:ring-4 focus:ring-white/20 transition-all"
                            />
                            
                            {/* Integrated Actions inside Search Input */}
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1">
                                {query && (
                                    <button
                                        onClick={handleClear}
                                        className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors"
                                    >
                                        <X size={12} strokeWidth={3} className="text-slate-600" />
                                    </button>
                                )}
                                <div className="w-[1px] h-6 bg-slate-100 mx-1" />
                                <button 
                                    onClick={handleVoiceSearch}
                                    className={cn(
                                        "p-2 transition-all rounded-full relative",
                                        isListening ? "text-red-500 bg-red-50 scale-110" : "text-slate-400 hover:text-primary hover:bg-slate-50"
                                    )}
                                >
                                    <Mic size={20} strokeWidth={2.5} className={cn(isListening && "animate-pulse")} />
                                    {isListening && (
                                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sticky Quick Filter Bar */}
                {query && !isLoading && (
                    <QuickFilterBar
                        selectedSort={sortBy}
                        onOpenSortModal={() => setIsSortModalOpen(true)}
                        activeFilters={activeFilters}
                        onToggleRatingPill={() =>
                            setActiveFilters((prev) => ({
                                ...prev,
                                minRating: prev.minRating === 4 ? null : 4,
                            }))
                        }
                        onToggleOffersPill={() =>
                            setActiveFilters((prev) => ({
                                ...prev,
                                onlyOffers: !prev.onlyOffers,
                            }))
                        }
                        onOpenFilterDrawer={() => setIsFilterDrawerOpen(true)}
                    />
                )}

                <div className="p-5 space-y-10 pb-24">
                {/* Search Results List */}
                {isLoading || (query && query !== debouncedQuery) ? (
                    <SearchPageSkeleton />
                ) : query ? (
                    <section>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black text-slate-800 tracking-tight">
                                Search Results
                            </h2>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{results.length} found</span>
                        </div>

                        {results.length > 0 ? (
                            <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-2 md:gap-x-4 gap-y-4 md:gap-y-10">
                                {results.map((product) => (
                                    <div key={product.id} onClick={() => saveSearch(query)} className="flex justify-center">
                                        <ProductCard product={product} compact={isMobile} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-16 flex flex-col items-center text-center">
                                <div className="w-48 h-48 md:w-64 md:h-64 mb-6">
                                    {noServiceData ? (
                                        <Lottie animationData={noServiceData} loop={true} />
                                    ) : (
                                        <div className="w-48 h-48 md:w-64 md:h-64" />
                                    )}
                                </div>
                                <h3 className="text-xl font-black text-slate-800 tracking-tight mb-2">No items found</h3>
                                <p className="text-slate-500 font-medium max-w-xs">We couldn't find anything for "{query}". Try different keywords!</p>
                            </div>
                        )}
                    </section>
                ) : (
                    <>
                        {/* 1. Recently Searched Item Section */}
                        {pastSearches.length > 0 && (
                            <section>
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Recently Searched</h3>
                                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                                    {pastSearches.map((term) => (
                                        <div
                                            key={term}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 shadow-sm rounded-full whitespace-nowrap active:scale-95 transition-transform cursor-pointer"
                                            onClick={() => setQuery(term)}
                                        >
                                            <div className="h-5 w-5 rounded flex items-center justify-center" style={{ backgroundColor: (settings?.primaryColor || 'var(--primary)') + '20' }}>
                                                <History size={12} style={{ color: settings?.primaryColor || 'var(--primary)' }} />
                                            </div>
                                            <span className="text-sm font-bold text-slate-700">{term}</span>
                                            <button
                                                onClick={(e) => handleRemoveSearch(e, term)}
                                                className="ml-1 p-0.5 hover:bg-slate-100 rounded-full transition-colors"
                                            >
                                                <X size={12} className="text-slate-400 hover:text-red-500" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* 2. Lowest Price Ever Section */}
                        <section>
                            <div className="flex justify-between items-center mb-5">
                                <h2 className="text-xl font-black text-slate-800 tracking-tight">Lowest Price Ever!</h2>
                                <button 
                                    className="flex items-center gap-1 md:gap-1.5 px-3 py-1 md:px-4 md:py-1.5 bg-slate-50 hover:bg-slate-100 rounded-full text-xs md:text-sm font-black transition-all" 
                                    style={{ color: settings?.primaryColor || 'var(--primary)' }}
                                    onClick={() => navigate('/category/all')}
                                >
                                    See All <ChevronRight size={14} strokeWidth={3} />
                                </button>
                            </div>
                            <div className="flex gap-2 md:gap-4 overflow-x-auto no-scrollbar -mx-5 px-5 pb-3 snap-x">
                                {isLoading && allProducts.length === 0 ? (
                                    [...Array(4)].map((_, i) => (
                                        <div key={i} className="min-w-[126px] sm:min-w-[136px] md:min-w-[148px] h-52 md:h-64 bg-slate-50 rounded-2xl animate-pulse" />
                                    ))
                                ) : lowestPriceProducts.map((product) => (
                                    <div key={product.id} className="min-w-[126px] sm:min-w-[136px] md:min-w-[148px] snap-start">
                                        <ProductCard product={product} compact={isMobile} />
                                    </div>
                                ))}
                            </div>
                        </section>
                    </>
                )}
            </div>

            {/* Voice Search Circular Overlay Screen */}
            <AnimatePresence>
                {isListening && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/85 backdrop-blur-lg text-white p-6 font-outfit"
                    >
                        {/* Title */}
                        <motion.h2 
                            initial={{ y: -20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.1 }}
                            className="text-xl md:text-2xl font-black tracking-tight mb-2 text-center"
                        >
                            Listening for search term...
                        </motion.h2>
                        
                        <p className="text-white/60 text-sm font-semibold mb-12 text-center">
                            Try saying "chocolate", "fresh milk"
                        </p>

                        {/* Circular Waves and Pulse Circle */}
                        <div className="relative flex items-center justify-center w-64 h-64 mb-8">
                            {/* Wave Ripple 1 */}
                            <motion.div
                                animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                                transition={{ repeat: Infinity, duration: 2.5, ease: "easeOut" }}
                                className="absolute w-36 h-36 bg-[var(--primary)]/30 rounded-full"
                            />
                            
                            {/* Wave Ripple 2 */}
                            <motion.div
                                animate={{ scale: [1, 1.4], opacity: [0.8, 0] }}
                                transition={{ repeat: Infinity, duration: 2.5, delay: 0.8, ease: "easeOut" }}
                                className="absolute w-36 h-36 bg-[var(--primary)]/20 rounded-full"
                            />

                            {/* Wave Ripple 3 */}
                            <motion.div
                                animate={{ scale: [1, 1.15], opacity: [0.9, 0.4] }}
                                transition={{ repeat: Infinity, duration: 1.5, repeatType: "reverse", ease: "easeInOut" }}
                                className="absolute w-36 h-36 bg-[var(--primary)]/10 rounded-full"
                            />

                            {/* Center Inner Circle */}
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: "spring", damping: 15 }}
                                className="w-28 h-28 rounded-full bg-gradient-to-br from-primary to-[var(--brand-600)] flex items-center justify-center border-4 border-white/20 shadow-2xl relative z-10"
                            >
                                <Mic size={40} className="text-white" />
                            </motion.div>
                        </div>

                        {/* Live Transcript Display Box */}
                        <div className="h-20 flex items-center justify-center px-4 max-w-md w-full">
                            <AnimatePresence mode="wait">
                                {voiceTranscript ? (
                                    <motion.div
                                        key="transcript"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="bg-white/5 border border-white/10 px-6 py-3 rounded-2xl text-center shadow-lg backdrop-blur-sm"
                                    >
                                        <p className="text-lg md:text-xl font-extrabold text-white tracking-wide leading-tight">
                                            "{voiceTranscript}"
                                        </p>
                                    </motion.div>
                                ) : (
                                    <motion.p
                                        key="idle"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 0.5 }}
                                        className="text-white text-base font-semibold tracking-wide animate-pulse"
                                    >
                                        Go ahead, speak...
                                    </motion.p>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Cancel Button */}
                        <motion.button
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            onClick={handleCancelVoiceSearch}
                            className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full transition-all text-sm font-bold tracking-wider uppercase active:scale-95 cursor-pointer mt-8"
                        >
                            <X size={16} strokeWidth={2.5} />
                            <span>Cancel</span>
                        </motion.button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modals & Drawers */}
            <SortByModal
                isOpen={isSortModalOpen}
                onClose={() => setIsSortModalOpen(false)}
                selectedSort={sortBy}
                onSelectSort={(newSort) => setSortBy(newSort)}
            />

            <FilterDrawer
                isOpen={isFilterDrawerOpen}
                onClose={() => setIsFilterDrawerOpen(false)}
                availableCategories={availableCategories}
                activeFilters={activeFilters}
                onApplyFilters={(updatedFilters) => setActiveFilters(updatedFilters)}
                onResetFilters={() => setActiveFilters({ minRating: null, onlyOffers: false, onlyInStock: false, categories: [] })}
            />
        </div>
    );
};

export default SearchPage;

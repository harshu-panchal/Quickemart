import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { applyCloudinaryTransform } from '@/core/utils/imageUtils';
import { cn } from '@/lib/utils';

/**
 * ProductImageModal
 * Blinkit-style Fullscreen Image Viewer Lightbox.
 * Supports:
 * - Top-right circular close (X) button
 * - Double-tap / double-click zoom
 * - 2-finger touch pinch-to-zoom & panning
 * - Desktop mouse wheel zoom & drag panning
 * - Bottom gallery thumbnail strip (no price bar)
 */
export const ProductImageModal = ({
    isOpen,
    onClose,
    images = [],
    initialIndex = 0,
    alt = 'Product Image',
}) => {
    const [activeIndex, setActiveIndex] = useState(initialIndex);
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDraggingActive, setIsDraggingActive] = useState(false);
    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (isOpen) {
            setActiveIndex(initialIndex);
            setScale(1);
            setPan({ x: 0, y: 0 });
        }
    }

    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const lastTapTime = useRef(0);
    const lastTouchDoubleTapTime = useRef(0);
    const initialTouchDist = useRef(0);
    const initialTouchScale = useRef(1);
    const imageContainerRef = useRef(null);

    // Handle ESC key to close
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const resetZoom = useCallback(() => {
        setScale(1);
        setPan({ x: 0, y: 0 });
    }, []);

    const toggleDoubleTapZoom = useCallback((clientX, clientY) => {
        setScale((prevScale) => {
            if (prevScale > 1.2) {
                setPan({ x: 0, y: 0 });
                return 1;
            } else {
                if (imageContainerRef.current) {
                    const rect = imageContainerRef.current.getBoundingClientRect();
                    const offsetX = (rect.width / 2 - (clientX - rect.left)) * 1.2;
                    const offsetY = (rect.height / 2 - (clientY - rect.top)) * 1.2;
                    setPan({ x: offsetX, y: offsetY });
                }
                return 2.5;
            }
        });
    }, []);

    // Desktop Mouse Drag Panning
    const handleMouseDown = (e) => {
        if (scale <= 1) return;
        isDragging.current = true;
        setIsDraggingActive(true);
        dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    };

    const handleMouseMove = (e) => {
        if (!isDragging.current || scale <= 1) return;
        setPan({
            x: e.clientX - dragStart.current.x,
            y: e.clientY - dragStart.current.y,
        });
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        setIsDraggingActive(false);
    };

    // Desktop Double Click (Ignored if triggered by touch double-tap)
    const handleDoubleClick = (e) => {
        if (Date.now() - lastTouchDoubleTapTime.current < 600) return;
        toggleDoubleTapZoom(e.clientX, e.clientY);
    };

    // Desktop Mouse Wheel Zoom
    const handleWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.25 : -0.25;
        const newScale = Math.max(1, Math.min(3.5, scale + delta));
        setScale(newScale);
        if (newScale === 1) setPan({ x: 0, y: 0 });
    };

    // Touch Event Handlers (Pinch Zoom + Pan + Double Tap)
    const handleTouchStart = (e) => {
        const now = Date.now();

        if (e.touches.length === 2) {
            // 2-finger pinch start
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            initialTouchDist.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            initialTouchScale.current = scale;
        } else if (e.touches.length === 1) {
            const touch = e.touches[0];

            // Double-tap check (between 40ms and 300ms)
            if (now - lastTapTime.current < 300 && now - lastTapTime.current > 40) {
                lastTouchDoubleTapTime.current = now;
                lastTapTime.current = 0; // Prevent 3rd tap from immediately triggering again
                toggleDoubleTapZoom(touch.clientX, touch.clientY);
            } else {
                if (scale > 1) {
                    isDragging.current = true;
                    setIsDraggingActive(true);
                    dragStart.current = { x: touch.clientX - pan.x, y: touch.clientY - pan.y };
                }
                lastTapTime.current = now;
            }
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 2 && initialTouchDist.current > 0) {
            // 2-finger pinch move
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            const factor = currentDist / initialTouchDist.current;
            const newScale = Math.max(1, Math.min(3.5, initialTouchScale.current * factor));
            setScale(newScale);
            if (newScale === 1) setPan({ x: 0, y: 0 });
        } else if (e.touches.length === 1 && isDragging.current && scale > 1) {
            // Single finger drag pan
            const touch = e.touches[0];
            setPan({
                x: touch.clientX - dragStart.current.x,
                y: touch.clientY - dragStart.current.y,
            });
        }
    };

    const handleTouchEnd = () => {
        isDragging.current = false;
        setIsDraggingActive(false);
        initialTouchDist.current = 0;
    };


    if (!isOpen) return null;

    const currentImg = images[activeIndex] || images[0];
    const displaySrc = applyCloudinaryTransform(currentImg, 'f_auto,q_auto:best,w_1600,dpr_auto');

    return (
        <div className="contents">
            {isOpen && (
                <div
                    className="fixed inset-0 z-[300] bg-[#F8F9FA] flex flex-col justify-between overflow-hidden select-none"
                >
                    {/* Header Bar: Counter + Close Button */}
                    <div className="relative z-30 flex items-center justify-between p-4 md:p-6">
                        <div className="text-xs font-bold text-slate-500 bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm border border-slate-200/60">
                            {activeIndex + 1} / {images.length || 1}
                        </div>

                        {/* Top-Right Circular Close Button (X) */}
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-11 h-11 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-xl hover:bg-black transition-all cursor-pointer"
                        >
                            <X size={22} strokeWidth={2.5} />
                        </button>
                    </div>

                    {/* Main Image Viewport Area */}
                    <div
                        ref={imageContainerRef}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onDoubleClick={handleDoubleClick}
                        onWheel={handleWheel}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        className="flex-1 relative flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing px-4"
                    >
                        <img
                            src={displaySrc}
                            alt={alt}
                            draggable={false}
                            style={{
                                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                                transition: isDraggingActive ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                            }}
                            className="max-w-full max-h-[68vh] object-contain drop-shadow-md mix-blend-multiply pointer-events-auto"
                        />


                        {/* Zoom Floating Action Bar (Controls) */}
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-full px-3 py-1 shadow-md flex items-center gap-2 pointer-events-auto">
                            <button
                                onClick={() => setScale((s) => Math.max(1, s - 0.5))}
                                className="p-1 text-slate-600 hover:text-primary transition-colors"
                                title="Zoom Out"
                            >
                                <ZoomOut size={16} />
                            </button>
                            <span className="text-[11px] font-bold text-slate-700 min-w-[36px] text-center">
                                {Math.round(scale * 100)}%
                            </span>
                            <button
                                onClick={() => setScale((s) => Math.min(3.5, s + 0.5))}
                                className="p-1 text-slate-600 hover:text-primary transition-colors"
                                title="Zoom In"
                            >
                                <ZoomIn size={16} />
                            </button>
                            {scale > 1 && (
                                <button
                                    onClick={resetZoom}
                                    className="p-1 text-slate-400 hover:text-slate-700 border-l border-slate-200 pl-1.5 transition-colors"
                                    title="Reset"
                                >
                                    <RotateCcw size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Bottom Gallery Thumbnail Strip (Blinkit reference style - No price bar) */}
                    {images.length > 0 && (
                        <div className="relative z-30 pb-6 pt-3 px-4 flex justify-center items-center bg-gradient-to-t from-white via-white/80 to-transparent">
                            <div className="flex items-center gap-2.5 overflow-x-auto max-w-full px-2 py-1 no-scrollbar">
                                {images.map((img, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => {
                                            setActiveIndex(idx);
                                            resetZoom();
                                        }}
                                        className={cn(
                                            'w-14 h-14 md:w-16 md:h-16 rounded-2xl overflow-hidden flex-shrink-0 border-2 transition-all p-1 bg-white shadow-sm cursor-pointer hover:scale-105 active:scale-95',
                                            idx === activeIndex
                                                ? 'border-emerald-600 ring-2 ring-emerald-600/30 shadow-md scale-105'
                                                : 'border-slate-200/80 opacity-60 hover:opacity-100'
                                        )}
                                    >
                                        <img
                                            src={applyCloudinaryTransform(img, 'f_auto,q_auto:best,w_160,dpr_auto')}
                                            alt=""
                                            className="w-full h-full object-contain mix-blend-multiply"
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * ProductImageZoom
 * Backward compatible wrapper component that displays product image and triggers modal on click.
 */
const ProductImageZoom = ({
    src,
    alt = 'Product image',
    className = '',
    imageClassName = '',
    allImages = [],
    activeImageIndex = 0,
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const galleryList = allImages.length > 0 ? allImages : [src];

    return (
        <>
            <div
                onClick={() => setIsModalOpen(true)}
                className={cn(
                    'relative w-full h-full overflow-hidden select-none cursor-pointer group flex items-center justify-center rounded-2xl',
                    className
                )}
            >
                <img
                    src={applyCloudinaryTransform(src, 'f_auto,q_auto:best,w_1200,dpr_auto')}
                    alt={alt}
                    draggable={false}
                    className={cn(
                        'w-full h-full object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.02]',
                        imageClassName
                    )}
                />
            </div>

            <ProductImageModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                images={galleryList}
                initialIndex={activeImageIndex}
                alt={alt}
            />
        </>
    );
};

export default ProductImageZoom;

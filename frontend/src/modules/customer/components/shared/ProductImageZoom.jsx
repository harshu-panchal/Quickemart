import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, Sparkles } from 'lucide-react';
import { applyCloudinaryTransform } from '@/core/utils/imageUtils';
import { cn } from '@/lib/utils';

/**
 * ProductImageZoom
 * Flipkart / Amazon style interactive zoom component.
 * Supports smooth desktop mouse hover & high-precision mobile touch dragging / double-tap.
 */
const ProductImageZoom = ({
    src,
    alt = 'Product image',
    className = '',
    imageClassName = '',
    zoomScale = 2.5,
}) => {
    const containerRef = useRef(null);
    const [isZoomed, setIsZoomed] = useState(false);
    const [coords, setCoords] = useState({ x: 50, y: 50 });
    const [lensPos, setLensPos] = useState({ x: 0, y: 0 });
    const lastTapRef = useRef(0);

    // Calculate position inside container
    const updatePosition = useCallback((clientX, clientY) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        
        const xRel = clientX - rect.left;
        const yRel = clientY - rect.top;

        const xPercent = Math.max(0, Math.min(100, (xRel / rect.width) * 100));
        const yPercent = Math.max(0, Math.min(100, (yRel / rect.height) * 100));

        setCoords({ x: xPercent, y: yPercent });
        setLensPos({ x: xRel, y: yRel });
    }, []);

    // Desktop Mouse Handlers
    const handleMouseEnter = (e) => {
        setIsZoomed(true);
        updatePosition(e.clientX, e.clientY);
    };

    const handleMouseMove = (e) => {
        if (!isZoomed) setIsZoomed(true);
        updatePosition(e.clientX, e.clientY);
    };

    const handleMouseLeave = () => {
        setIsZoomed(false);
        setCoords({ x: 50, y: 50 });
    };

    // Mobile Touch Handlers
    const handleTouchStart = (e) => {
        const now = Date.now();
        const DOUBLE_TAP_DELAY = 300;

        if (e.touches && e.touches.length === 1) {
            const touch = e.touches[0];

            // Double tap to toggle persistent zoom on mobile
            if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
                setIsZoomed((prev) => !prev);
                updatePosition(touch.clientX, touch.clientY);
            } else {
                // Press & hold drag zoom
                setIsZoomed(true);
                updatePosition(touch.clientX, touch.clientY);
            }
            lastTapRef.current = now;
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches && e.touches.length === 1) {
            const touch = e.touches[0];
            updatePosition(touch.clientX, touch.clientY);
        }
    };

    const handleTouchEnd = () => {
        // If not double-tap locked, stop zoom when finger leaves screen
        const now = Date.now();
        if (now - lastTapRef.current >= 300) {
            setIsZoomed(false);
            setCoords({ x: 50, y: 50 });
        }
    };

    // Ensure high-res Cloudinary image for sharp zoomed detail
    const displaySrc = applyCloudinaryTransform(src, 'f_auto,q_auto:best,w_1600,dpr_auto');

    return (
        <div
            ref={containerRef}
            onMouseEnter={handleMouseEnter}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={cn(
                'relative w-full h-full overflow-hidden select-none touch-none rounded-2xl group flex items-center justify-center cursor-zoom-in',
                className
            )}
        >
            {/* Main Product Image with dynamic transform origin & scale */}
            <img
                src={displaySrc}
                alt={alt}
                draggable={false}
                style={{
                    transformOrigin: isZoomed ? `${coords.x}% ${coords.y}%` : 'center center',
                    transform: isZoomed ? `scale(${zoomScale})` : 'scale(1)',
                    transition: isZoomed
                        ? 'transform-origin 0.08s ease-out, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
                        : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform-origin 0.4s ease',
                }}
                className={cn(
                    'w-full h-full object-contain mix-blend-multiply transition-shadow duration-300',
                    imageClassName
                )}
            />

            {/* Lens Box Indicator on main image when zoomed */}
            <AnimatePresence>
                {isZoomed && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                        style={{
                            left: `${lensPos.x}px`,
                            top: `${lensPos.y}px`,
                            transform: 'translate(-50%, -50%)',
                        }}
                        className="absolute pointer-events-none w-24 h-24 rounded-2xl border-2 border-primary/50 bg-primary/10 shadow-[0_0_20px_rgba(16,185,129,0.2)] backdrop-blur-[1px] hidden md:block"
                    />
                )}
            </AnimatePresence>

            {/* Floating Zoom Guidance Badge */}
            <AnimatePresence>
                {!isZoomed && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        transition={{ duration: 0.2 }}
                        className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-full shadow-sm border border-slate-200/80 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 pointer-events-none"
                    >
                        <ZoomIn size={13} className="text-primary animate-pulse" />
                        <span>Hover or touch to zoom</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Active Zoom Level Indicator */}
            <AnimatePresence>
                {isZoomed && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: -5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-3 left-3 bg-slate-900/80 text-white backdrop-blur-md px-2.5 py-1 rounded-lg text-[11px] font-bold tracking-wider flex items-center gap-1 shadow-md pointer-events-none z-10 uppercase"
                    >
                        <Sparkles size={12} className="text-emerald-400" />
                        <span>Zoom {zoomScale}x</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ProductImageZoom;

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    HiOutlineXMark,
    HiOutlineMagnifyingGlassPlus,
    HiOutlineMagnifyingGlassMinus,
    HiOutlineArrowPath
} from 'react-icons/hi2';

export default function ImageZoomModal({ isOpen, src, title, onClose }) {
    const [scale, setScale] = useState(1);

    useEffect(() => {
        if (isOpen) {
            setScale(1);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen || !src) return null;

    const handleZoomIn = (e) => {
        e.stopPropagation();
        setScale((prev) => Math.min(prev + 0.5, 4));
    };

    const handleZoomOut = (e) => {
        e.stopPropagation();
        setScale((prev) => Math.max(prev - 0.5, 0.5));
    };

    const handleReset = (e) => {
        e.stopPropagation();
        setScale(1);
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-between p-4 md:p-6 animate-in fade-in duration-200"
            onClick={onClose}
        >
            {/* Header / Top Toolbar */}
            <div
                className="w-full max-w-5xl flex items-center justify-between z-10 bg-slate-900/80 px-5 py-3 rounded-2xl border border-slate-800 text-white shadow-xl backdrop-blur-sm"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col">
                    <span className="text-xs font-black uppercase tracking-wider text-primary">Image Viewer</span>
                    <h3 className="text-sm font-bold text-slate-200 truncate max-w-xs md:max-w-md">
                        {title || 'Product Image Preview'}
                    </h3>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleZoomOut}
                        disabled={scale <= 0.5}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors disabled:opacity-40"
                        title="Zoom Out (-)"
                    >
                        <HiOutlineMagnifyingGlassMinus className="h-5 w-5" />
                    </button>

                    <button
                        type="button"
                        onClick={handleReset}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors flex items-center gap-1.5"
                        title="Reset Zoom"
                    >
                        <HiOutlineArrowPath className="h-4 w-4" />
                        <span>{Math.round(scale * 100)}%</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleZoomIn}
                        disabled={scale >= 4}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors disabled:opacity-40"
                        title="Zoom In (+)"
                    >
                        <HiOutlineMagnifyingGlassPlus className="h-5 w-5" />
                    </button>

                    <div className="h-5 w-px bg-slate-700 mx-1" />

                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-600 hover:text-white transition-colors"
                        title="Close (ESC)"
                    >
                        <HiOutlineXMark className="h-6 w-6" />
                    </button>
                </div>
            </div>

            {/* Centered Image Container */}
            <div
                className="flex-1 w-full flex items-center justify-center overflow-auto p-4 my-2 select-none"
                onClick={onClose}
            >
                <img
                    src={src}
                    alt={title || 'Full screen preview'}
                    style={{ transform: `scale(${scale})` }}
                    className="max-w-full max-h-[78vh] object-contain rounded-2xl shadow-2xl transition-transform duration-200 cursor-grab active:cursor-grabbing border border-slate-800/50"
                    onClick={(e) => e.stopPropagation()}
                />
            </div>

            {/* Bottom Hint Footer */}
            <div
                className="z-10 text-center text-xs text-slate-400 font-medium bg-slate-900/60 px-4 py-1.5 rounded-full border border-slate-800/80 backdrop-blur-xs"
                onClick={(e) => e.stopPropagation()}
            >
                Click outside or press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-200 font-mono">ESC</kbd> to exit full screen
            </div>
        </div>,
        document.body
    );
}

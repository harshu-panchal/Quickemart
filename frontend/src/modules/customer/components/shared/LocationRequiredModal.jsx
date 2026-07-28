import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Loader2, Compass } from "lucide-react";
import { useLocation as useAppLocation } from "../../context/LocationContext";

const LocationRequiredModal = ({ isOpen, onOpenManual }) => {
  const {
    refreshLocation,
    isFetchingLocation,
    locationError,
  } = useAppLocation();

  const handleAllowAccess = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await refreshLocation();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-hidden">
          {/* Backdrop Blur Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="relative bg-white rounded-[32px] max-w-md w-full p-8 md:p-10 shadow-2xl flex flex-col items-center text-center border border-slate-100/50 z-10"
          >
            {/* Top Icon Circle */}
            <div className="w-20 h-20 bg-[#F8ECE8] rounded-full flex items-center justify-center mb-6 shadow-inner animate-pulse">
              <MapPin size={38} className="text-[#8E402A] fill-[#8E402A]/10" />
            </div>

            {/* Title */}
            <h2 className="text-2xl font-black text-[#1A1A1A] tracking-tight mb-3">
              Location Access Required
            </h2>

            {/* Description */}
            <p className="text-sm text-slate-500 font-semibold leading-relaxed mb-6 max-w-[320px]">
              We need your location to show you products available near you and enable delivery services. Location access is required to continue.
            </p>

            {/* Error Message Box */}
            {locationError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full bg-red-50 border border-red-100 rounded-2xl p-3 mb-6 flex items-start gap-2 text-left"
              >
                <span className="text-red-500 font-extrabold text-xs shrink-0 mt-0.5">⚠️</span>
                <p className="text-xs text-red-600 font-bold leading-tight">
                  {locationError === "User denied Geolocation"
                    ? "Location access denied. Please check your browser settings or enter your address manually."
                    : locationError}
                </p>
              </motion.div>
            )}

            {/* Action Buttons */}
            <div className="w-full flex flex-col gap-3">
              {/* Allow Location Access Button */}
              <button
                type="button"
                onClick={handleAllowAccess}
                disabled={isFetchingLocation}
                className="w-full bg-[#8E402A] hover:bg-[#783421] disabled:bg-[#8E402A]/60 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg shadow-[#8E402A]/20 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] outline-none select-none text-sm leading-none"
              >
                {isFetchingLocation ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-white" />
                    <span>Detecting Location...</span>
                  </>
                ) : (
                  <>
                    <Compass size={16} className="text-white" />
                    <span>Allow Location Access</span>
                  </>
                )}
              </button>

              {/* Enter Location Manually Button */}
              <button
                type="button"
                onClick={onOpenManual}
                disabled={isFetchingLocation}
                className="w-full bg-[#F3F4F6] hover:bg-[#E5E7EB] disabled:opacity-50 text-[#1A1A1A] font-bold py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] outline-none select-none text-sm leading-none"
              >
                Enter Location Manually
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default LocationRequiredModal;

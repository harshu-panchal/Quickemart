import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import Lottie from "lottie-react";
import LocationDrawer from "./LocationDrawer";
import { useLocation } from "../../context/LocationContext";
import { useProductDetail } from "../../context/ProductDetailContext";
import { useSettings } from "@core/context/SettingsContext";
import { useCart } from "../../context/CartContext";
import { useWishlist } from "../../context/WishlistContext";
import { cn } from "@/lib/utils";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";
import {
  buildHeaderGradient,
  buildMiniCartColor,
  buildSearchBarBackgroundColor,
  shiftHex,
} from "../../utils/headerTheme";
import LogoImage from "../../../../assets/Logo.png";

// MUI Icons
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import SearchIcon from "@mui/icons-material/Search";
import MicIcon from "@mui/icons-material/Mic";
import ChevronDownIcon from "@mui/icons-material/KeyboardArrowDown";
import FavoriteBorderOutlinedIcon from "@mui/icons-material/FavoriteBorderOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";

/** Full-width bottom stroke + tab curve; l/r are 0–100% of column where the inner bump sits. */
function buildActiveTabPath(l, r) {
  const y = 20;
  const mapX = (x) => l + ((x - 1.5) / (98.5 - 1.5)) * (r - l);
  // Softer shoulders + flatter crown for a cleaner active tab curve.
  return `M 0 ${y} L ${l} ${y} L ${l} 12 C ${mapX(2.6)} 7 ${mapX(8.2)} 1.55 ${mapX(15)} 1.55 L ${mapX(85)} 1.55 C ${mapX(91.8)} 1.55 ${mapX(97.4)} 7 ${mapX(98.5)} 12 V ${y} L 100 ${y}`;
}

function CategoryNavColumn({
  cat,
  isActive,
  categoryAccent,
  onCategorySelect,
  headerFontColor,
  headerIconColor,
}) {
  const iconColor = headerIconColor || "#111111";
  const colRef = useRef(null);
  const labelRef = useRef(null);
  const [lr, setLr] = useState({ l: 22, r: 78 });

  const measure = () => {
    if (!isActive || !colRef.current || !labelRef.current) return;
    const col = colRef.current.getBoundingClientRect();
    const lab = labelRef.current.getBoundingClientRect();
    if (col.width < 4) return;
    const pad = 5;
    const l = Math.max(0, ((lab.left - col.left - pad) / col.width) * 100);
    const r = Math.min(100, ((lab.right - col.left + pad) / col.width) * 100);
    if (r - l > 6) setLr({ l, r });
  };

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (colRef.current) ro.observe(colRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isActive, cat.name]);

  const pathD = isActive ? buildActiveTabPath(lr.l, lr.r) : "";

  return (
    <motion.div
      ref={colRef}
      layout
      whileTap={{ scale: 0.96 }}
      transition={{
        layout: { type: "spring", stiffness: 520, damping: 38, mass: 0.55 },
      }}
      onClick={() => onCategorySelect && onCategorySelect(cat)}
      style={{
        borderBottomColor: isActive ? "transparent" : categoryAccent,
      }}
      className="relative z-[2] flex min-w-[48px] shrink-0 cursor-pointer flex-col items-center gap-0.5 border-b-2 px-2 pb-0.5 pt-0.5 snap-start md:min-w-[58px]">
      <div className="relative z-10 flex h-9 w-9 items-center justify-center md:h-11 md:w-11">
        {typeof cat.icon === "function" ||
        (typeof cat.icon === "object" && cat.icon.$$typeof) ? (
          <cat.icon
            sx={{
              fontSize: { xs: 20, md: 24 },
              color: iconColor,
              opacity: isActive ? 1 : 0.62,
              transition: "opacity 0.2s, transform 0.2s",
            }}
          />
        ) : (
          <img
            src={applyCloudinaryTransform(cat.icon, "f_auto,q_auto,w_100")}
            alt={cat.name}
            loading="lazy"
            className="h-5 w-5 object-contain md:h-6 md:w-6"
            style={{ opacity: isActive ? 1 : 0.62 }}
          />
        )}
      </div>
      <div className="relative mt-px w-full">
        <span
          ref={labelRef}
          className={cn(
            "relative z-10 mx-auto block max-w-[72px] truncate px-1 pb-0.5 text-center text-[8px] uppercase tracking-tight md:max-w-[88px] md:text-[10px]",
            isActive ? "font-black" : "font-semibold",
          )}
          style={{
            color: isActive ? iconColor : (headerFontColor || "#111111"),
            opacity: isActive ? 1 : 0.68,
          }}>
          {cat.name}
        </span>
      </div>
      {isActive && (
        <motion.svg
          layoutId="active-category-curve"
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-[6] h-[22px] w-full overflow-visible"
          viewBox="0 0 100 20"
          preserveAspectRatio="none"
          shapeRendering="geometricPrecision"
          transition={{
            layout: { type: "spring", stiffness: 560, damping: 40, mass: 0.5 },
          }}>
          <path
            d={pathD}
            fill="none"
            stroke={categoryAccent}
            strokeWidth="2"
            strokeLinecap="butt"
            strokeLinejoin="round"
          />
        </motion.svg>
      )}
    </motion.div>
  );
}

const MainLocationHeader = ({
  categories = [],
  activeCategory,
  onCategorySelect,
}) => {
  const { scrollY } = useScroll();
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [cartAnimData, setCartAnimData] = useState(null);

  // Dynamically load shopping-cart Lottie on mount
  useEffect(() => {
    import("../../../../assets/lottie/shopping-cart.json")
      .then((m) => setCartAnimData(m.default))
      .catch(() => {});
  }, []);
  const { currentLocation, refreshLocation, isFetchingLocation } =
    useLocation();
  const { isOpen: isProductDetailOpen } = useProductDetail();
  const { settings } = useSettings();
  const { cartCount = 0 } = useCart ? useCart() : {};
  const { count: wishlistCount = 0 } = useWishlist ? useWishlist() : {};
  const appName = settings?.appName || "App";
  const logoUrl = settings?.logoUrl || LogoImage;
  const navigate = useNavigate();

  // Search Logic
  const handleSearchClick = () => {
    navigate("/search");
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      navigate("/search", { state: { query: e.target.value } });
    }
  };

  // Search placeholder animation
  const [searchPlaceholder, setSearchPlaceholder] = useState("Search ");
  const [typingState, setTypingState] = useState({
    textIndex: 0,
    charIndex: 0,
    isDeleting: false,
    isPaused: false,
  });

  const staticText = "Search ";
  const typingPhrases = [
    '"bread"',
    '"milk"',
    '"chocolate"',
    '"eggs"',
    '"chips"',
  ];

  useEffect(() => {
    const { textIndex, charIndex, isDeleting, isPaused } = typingState;
    const currentPhrase = typingPhrases[textIndex];

    if (isPaused) {
      const timeout = setTimeout(() => {
        setTypingState((prev) => ({
          ...prev,
          isPaused: false,
          isDeleting: true,
        }));
      }, 2000); // Pause after full phrase
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          // Typing
          if (charIndex < currentPhrase.length) {
            setSearchPlaceholder(
              staticText + currentPhrase.substring(0, charIndex + 1),
            );
            setTypingState((prev) => ({
              ...prev,
              charIndex: prev.charIndex + 1,
            }));
          } else {
            // Finished typing
            setTypingState((prev) => ({ ...prev, isPaused: true }));
          }
        } else {
          // Deleting
          if (charIndex > 0) {
            setSearchPlaceholder(
              staticText + currentPhrase.substring(0, charIndex - 1),
            );
            setTypingState((prev) => ({
              ...prev,
              charIndex: prev.charIndex - 1,
            }));
          } else {
            // Finished deleting
            setTypingState((prev) => ({
              ...prev,
              isDeleting: false,
              textIndex: (prev.textIndex + 1) % typingPhrases.length,
            }));
          }
        }
      },
      isDeleting ? 50 : 100,
    ); // 50ms deleting speed, 100ms typing speed

    return () => clearTimeout(timeout);
  }, [typingState]);

  // Smooth scroll interpolations
  const headerTopPadding = useTransform(scrollY, [0, 160], [12, 10]);
  const headerBottomPadding = useTransform(scrollY, [0, 160], [2, 2]);
  const headerRoundness = useTransform(scrollY, [0, 160], [0, 0]);
  const bgOpacity = useTransform(scrollY, [0, 160], [1, 1]);

  // Content animations
  const contentHeight = useTransform(scrollY, [0, 160], ["64px", "64px"]);
  const contentOpacity = useTransform(scrollY, [0, 160], [1, 1]);
  const navHeight = useTransform(scrollY, [0, 200], ["60px", "60px"]);
  const navOpacity = useTransform(scrollY, [0, 200], [1, 1]);
  const navMargin = useTransform(scrollY, [0, 200], [4, 4]);
  const categorySpacing = useTransform(scrollY, [0, 200], [3, 3]);
  const cartOpacity = useTransform(scrollY, [0, 110, 150], [1, 1, 1]);
  const cartScale = useTransform(scrollY, [0, 110, 150], [1, 1, 1]);

  // Helper to hide elements completely when collapsed to prevent clicks
  const displayContent = useTransform(scrollY, (value) => "block");
  const displayNav = useTransform(scrollY, (value) => "flex");
  const displayCart = useTransform(scrollY, (value) => "block");

  const baseHeaderColor = activeCategory?.headerColor || "var(--primary)";
  const headerFontColor = activeCategory?.headerFontColor || "#111827";
  const headerIconColor = activeCategory?.headerIconColor || "#111111";
  
  const headerGradient = buildHeaderGradient(baseHeaderColor);
  const searchBarBg = buildSearchBarBackgroundColor(baseHeaderColor);
  const categoryAccent = headerIconColor;

  useEffect(() => {
    const c = buildMiniCartColor(baseHeaderColor);
    document.documentElement.style.setProperty("--customer-mini-cart-color", c);
    return () => {
      document.documentElement.style.removeProperty(
        "--customer-mini-cart-color",
      );
    };
  }, [baseHeaderColor]);

  return (
    <>
      <div
        className={cn(
          "relative w-full z-[200]",
          isProductDetailOpen && "hidden md:block",
        )}>
        <motion.div
          initial={false}
          style={{
            paddingTop: headerTopPadding,
            paddingBottom: headerBottomPadding,
            borderBottomLeftRadius: headerRoundness,
            borderBottomRightRadius: headerRoundness,
            opacity: bgOpacity,
            backgroundImage: headerGradient,
          }}
          className="px-4 shadow-[0_4px_20px_rgba(0,0,0,0.15)] overflow-hidden transform-gpu will-change-transform">
          {/* Subtle Glow Overlay */}
          <div className="absolute inset-0 bg-white/8 pointer-events-none" />

          {/* Corner Lottie */}
          <motion.button
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
            style={{
              opacity: cartOpacity,
              scale: cartScale,
              display: displayCart,
            }}
            type="button"
            aria-label="Open cart"
            onClick={() => navigate("/checkout")}
            className="absolute top-3 right-5 sm:top-4 sm:right-6 md:top-5 md:right-8 z-20 w-12 h-12 sm:w-14 sm:h-14 md:w-20 md:h-20 cursor-pointer">
            {cartAnimData ? (
              <Lottie
                animationData={cartAnimData}
                loop
                className="w-full h-full pointer-events-none drop-shadow-[0_8px_18px_rgba(0,0,0,0.14)]"
              />
            ) : (
              <div className="w-full h-full" />
            )}
          </motion.button>


          {/* Desktop/Tablet Header Layout (md and above) */}
          <div className="hidden md:flex items-center justify-between relative z-20 px-1 lg:px-4 mb-1.5 mt-0.5">
            {/* Left Section: Logo + Vertical Separator + Location Block */}
            <div className="flex items-center gap-2 lg:gap-4 shrink-0">
              {/* Logo (Jumbo Display Size, Zero Extra Padding) */}
              <div
                onClick={() => navigate("/")}
                className="cursor-pointer shrink-0 flex items-center p-0 m-0 border-0">
                <img
                  src={logoUrl}
                  alt={`${appName} Logo`}
                  loading="lazy"
                  className="h-28 sm:h-32 md:h-36 lg:h-44 max-h-[160px] w-auto object-contain drop-shadow-md scale-150 origin-left border-0 p-0 m-0"
                />
              </div>

              {/* Vertical Separator Line */}
              <div className="h-12 md:h-14 border-r border-black/15 dark:border-white/25 shrink-0" />

              {/* Location & Delivery Time Block */}
              <div className="flex flex-col justify-center leading-tight">
                <div className="flex items-center gap-1 opacity-80 text-[11px] font-black uppercase tracking-wider">
                  <AccessTimeIcon sx={{ fontSize: 13, color: headerFontColor }} />
                  <span style={{ color: headerFontColor }}>
                    {currentLocation.time || "12-15 MINS"}
                  </span>
                </div>
                <button
                  type="button"
                  data-lenis-prevent
                  data-lenis-prevent-touch
                  onClick={() => setIsLocationOpen(true)}
                  className="flex items-center gap-1 cursor-pointer active:scale-95 transition-all border-0 bg-transparent p-0 text-left font-extrabold text-[13px]"
                  style={{ color: headerFontColor }}>
                  <LocationOnIcon sx={{ fontSize: 14, color: "inherit" }} />
                  <span className="max-w-[260px] lg:max-w-[360px] truncate">
                    {isFetchingLocation ? "Detecting location..." : currentLocation.name}
                  </span>
                  <ChevronDownIcon sx={{ fontSize: 13, opacity: 0.7 }} />
                </button>
              </div>
            </div>

            {/* Center Section: Pill Search Bar - Fills Middle Space Comfortably */}
            <div className="flex-1 mx-4 lg:mx-8">
              <motion.div
                onClick={handleSearchClick}
                whileHover={{ scale: 1.005 }}
                whileTap={{ scale: 0.995 }}
                style={{ backgroundColor: searchBarBg }}
                className="rounded-full px-4 h-10 shadow-sm flex items-center border border-black/10 transition-all duration-200 cursor-pointer w-full">
                <SearchIcon sx={{ color: "#1e293b", fontSize: 19 }} />
                <input
                  type="text"
                  placeholder={searchPlaceholder || 'Search "milk"'}
                  readOnly
                  className="flex-1 bg-transparent border-none outline-none pl-3 text-slate-900 font-semibold placeholder:text-slate-700 text-[14px] cursor-pointer"
                />
                <div className="flex items-center gap-2 border-l border-black/15 pl-3">
                  <MicIcon sx={{ color: "#1e293b", fontSize: 19 }} />
                </div>
              </motion.div>
            </div>

            {/* Right Section: Action Icons Row */}
            <div className="flex items-center gap-4 lg:gap-6 shrink-0">
              <motion.button
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => navigate("/wishlist")}
                className="p-1.5 rounded-full hover:bg-black/5 transition-all relative"
                style={{ color: headerFontColor }}
              >
                <FavoriteBorderOutlinedIcon sx={{ fontSize: 24 }} />
                {wishlistCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white shadow-sm">
                    {wishlistCount}
                  </span>
                )}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => navigate("/notifications")}
                className="p-1.5 rounded-full hover:bg-black/5 transition-all"
                style={{ color: headerFontColor }}
              >
                <NotificationsNoneOutlinedIcon sx={{ fontSize: 24 }} />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => navigate("/checkout")}
                className="p-1.5 rounded-full hover:bg-black/5 transition-all relative"
                style={{ color: headerFontColor }}
              >
                <ShoppingCartOutlinedIcon sx={{ fontSize: 24 }} />
                <span className="absolute -top-1 -right-1 bg-amber-400 text-slate-950 text-[10px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                  {cartCount || 0}
                </span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => navigate("/profile")}
                className="bg-white/25 hover:bg-white/40 backdrop-blur-sm p-1.5 rounded-full border border-white/40 shadow-sm transition-all flex items-center justify-center"
                style={{ color: headerFontColor }}
              >
                <AccountCircleOutlinedIcon sx={{ fontSize: 26 }} />
              </motion.button>
            </div>
          </div>

          {/* Collapsible Delivery Info & Location (MOBILE ONLY) */}
          <div className="md:hidden">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {/* Logo (Jumbo Display Size, Zero Extra Padding) */}
                <div 
                  onClick={() => navigate("/")}
                  className="cursor-pointer shrink-0 flex items-center p-0 m-0 border-0">
                  <img
                    src={logoUrl}
                    alt={`${appName} Logo`}
                    className="h-22 sm:h-26 max-h-[110px] w-auto object-contain drop-shadow-md scale-150 origin-left border-0 p-0 m-0"
                  />
                </div>
                {/* Vertical Separator */}
                <div className="h-10 border-r border-black/15 dark:border-white/25 shrink-0" />
                {/* Location Block */}
                <div className="flex flex-col justify-center leading-tight">
                  <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider" style={{ color: headerFontColor }}>
                    <AccessTimeIcon sx={{ fontSize: 12 }} />
                    <span>{currentLocation.time || "12-15 MINS"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsLocationOpen(true)}
                    className="flex items-center gap-1 text-[12px] font-bold max-w-[150px] truncate p-0 bg-transparent border-0"
                    style={{ color: headerFontColor }}>
                    <LocationOnIcon sx={{ fontSize: 13 }} />
                    <span className="truncate">{currentLocation.name}</span>
                    <ChevronDownIcon sx={{ fontSize: 11, opacity: 0.7 }} />
                  </button>
                </div>
              </div>

              {/* Mobile Right Action Icons */}
              <div className="flex items-center gap-2">
                <button onClick={() => navigate("/notifications")} style={{ color: headerFontColor }} className="p-1">
                  <NotificationsNoneOutlinedIcon sx={{ fontSize: 22 }} />
                </button>
                <button onClick={() => navigate("/checkout")} className="relative p-1" style={{ color: headerFontColor }}>
                  <ShoppingCartOutlinedIcon sx={{ fontSize: 22 }} />
                  <span className="absolute -top-0.5 -right-0.5 bg-amber-400 text-slate-950 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white">
                    {cartCount || 0}
                  </span>
                </button>
                <button onClick={() => navigate("/profile")} style={{ color: headerFontColor }} className="p-1">
                  <AccountCircleOutlinedIcon sx={{ fontSize: 24 }} />
                </button>
              </div>
            </div>

            {/* Mobile Search Bar */}
            <div className="relative z-10 flex items-center gap-2">
              <motion.div
                onClick={handleSearchClick}
                whileTap={{ scale: 0.98 }}
                style={{ backgroundColor: searchBarBg }}
                className="flex-1 rounded-full px-3 h-10 shadow-sm flex items-center border border-black/10 cursor-pointer">
                <SearchIcon sx={{ color: "#1e293b", fontSize: 18 }} />
                <input
                  type="text"
                  placeholder={searchPlaceholder || 'Search "milk"'}
                  readOnly
                  className="flex-1 bg-transparent border-none outline-none pl-2 text-slate-900 font-semibold placeholder:text-slate-700 text-[14px] cursor-pointer"
                />
                <div className="flex items-center gap-2 border-l border-black/15 pl-2">
                  <MicIcon sx={{ color: "#1e293b", fontSize: 18 }} />
                </div>
              </motion.div>
            </div>
          </div>

          {/* Categories Navigation - Smooth Collapse */}
          {categories.length > 0 && (
            <motion.div
              layout
              transition={{
                layout: {
                  type: "spring",
                  stiffness: 420,
                  damping: 34,
                  mass: 0.6,
                },
              }}
              className="relative flex items-end md:justify-center gap-0 overflow-x-auto no-scrollbar -mx-2 px-2 md:mx-0 md:px-0 z-10 snap-x pt-0.5 min-h-[64px] md:min-h-[70px] pb-0.5 mt-1">
              {categories.map((cat) => {
                const isActive = activeCategory?.id === cat.id;
                return (
                  <CategoryNavColumn
                    key={cat.id}
                    cat={cat}
                    isActive={isActive}
                    categoryAccent={categoryAccent}
                    onCategorySelect={onCategorySelect}
                    headerFontColor={headerFontColor}
                    headerIconColor={headerIconColor}
                  />
                );
              })}
            </motion.div>
          )}

          {/* Background Decorative patterns */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none" />
        </motion.div>
      </div>

      <LocationDrawer
        isOpen={isLocationOpen}
        onClose={() => setIsLocationOpen(false)}
      />
    </>
  );
};

export default MainLocationHeader;


import React, { useEffect, useMemo, useRef, useState } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Pagination from "@shared/components/ui/Pagination";
import {
  HiOutlineBuildingOffice2,
  HiOutlineMagnifyingGlass,
  HiOutlineFunnel,
  HiOutlineEnvelope,
  HiOutlinePhone,
  HiOutlineCalendarDays,
  HiOutlineArrowTrendingUp,
  HiOutlineMapPin,
  HiOutlineXMark,
  HiOutlineEye,
  HiOutlineClock,
  HiOutlineArrowPath,
  HiOutlineDocumentText,
  HiOutlineTrash,
  HiOutlinePlus,
  HiOutlineUser,
  HiOutlineShoppingBag,
  HiOutlineLockClosed,
  HiOutlineEyeSlash,
  HiOutlineCloudArrowUp,
  HiOutlineCheckCircle,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";

/* =====================================================
   ADD SELLER MODAL
===================================================== */
const INITIAL_FORM = {
  name: "",
  email: "",
  shopName: "",
  password: "",
  category: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  radius: "5",
};

const DOC_LABELS = [
  { field: "tradeLicense", label: "Trade License" },
  { field: "gstCertificate", label: "GST Certificate" },
  { field: "idProof", label: "ID Proof" },
];

const generatePreviewId = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "SLR-";
  for (let i = 0; i < 8; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
};

const AddSellerModal = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState(INITIAL_FORM);
  const [docs, setDocs] = useState({ tradeLicense: null, gstCertificate: null, idProof: null });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewId] = useState(generatePreviewId);
  const fileRefs = { tradeLicense: useRef(), gstCertificate: useRef(), idProof: useRef() };
  const [categoryTree, setCategoryTree] = useState([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const categoryDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setShowCategoryDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    
    let active = true;
    const loadCategoryTree = async () => {
      try {
        const res = await adminApi.getCategoryTree();
        if (res.data.success && active) {
          setCategoryTree(res.data.results || res.data.result || []);
        }
      } catch (err) {
        console.error("Failed to load category tree", err);
      }
    };
    loadCategoryTree();

    return () => {
      active = false;
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const handleToggleCategory = (headerName, mainName) => {
    setSelectedTypes(prev => {
      const idx = prev.findIndex(t => t.headerName === headerName && t.mainName === mainName);
      let newTypes = [];
      if (idx > -1) {
        newTypes = prev.filter((_, i) => i !== idx);
      } else {
        newTypes = [...prev, { headerName, mainName }];
      }
      setForm(p => ({
        ...p,
        category: newTypes.map(t => `${t.headerName} > ${t.mainName}`).join(", ")
      }));
      return newTypes;
    });
  };

  const handleScrollWheel = (e) => {
    const el = e.currentTarget;
    if (
      (e.deltaY < 0 && el.scrollTop === 0) ||
      (e.deltaY > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight)
    ) {
      e.preventDefault();
    }
    e.stopPropagation();
  };

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleDoc = (field, file) => {
    setDocs((p) => ({ ...p, [field]: file || null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.shopName.trim() || !form.password || !form.category) {
      toast.error("Name, email, shop name, password and product type are required");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      // Attach optional documents
      DOC_LABELS.forEach(({ field }) => {
        if (docs[field]) fd.append(field, docs[field]);
      });

      const res = await adminApi.createSeller(fd);
      const createdSellerId = res.data?.result?.sellerId || previewId;
      toast.success(
        <div>
          <p className="font-bold">Seller created!</p>
          <p className="text-xs opacity-70">ID: {createdSellerId}</p>
        </div>
      );
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create seller");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl ring-1 ring-slate-100 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-slate-700">
            <div>
              <h2 className="text-lg font-black text-white tracking-tight">Add Seller</h2>
              <p className="text-xs text-slate-300 mt-0.5">Create a seller account — immediately active &amp; approved</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
            >
              <HiOutlineXMark className="h-5 w-5" />
            </button>
          </div>

          <div className="overflow-y-auto max-h-[75vh]">
            <form onSubmit={handleSubmit} className="px-7 py-6 space-y-6">

              {/* Auto-generated Seller ID preview */}
              <div className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3 ring-1 ring-slate-100">
                <HiOutlineCheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Auto-generated Seller ID</p>
                  <p className="text-sm font-black text-slate-800 font-mono tracking-wider">{previewId}</p>
                </div>
              </div>

              {/* Basic Info */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Basic Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative">
                    <HiOutlineUser className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Seller Name *"
                      required
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 rounded-2xl text-sm font-semibold text-slate-800 outline-none ring-1 ring-slate-200 focus:ring-slate-400 transition-all placeholder:text-slate-400"
                    />
                  </div>
                  <div className="relative">
                    <HiOutlineEnvelope className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="Email Address *"
                      required
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 rounded-2xl text-sm font-semibold text-slate-800 outline-none ring-1 ring-slate-200 focus:ring-slate-400 transition-all placeholder:text-slate-400"
                    />
                  </div>
                  <div className="relative">
                    <HiOutlineShoppingBag className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      name="shopName"
                      value={form.shopName}
                      onChange={handleChange}
                      placeholder="Shop Name *"
                      required
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 rounded-2xl text-sm font-semibold text-slate-800 outline-none ring-1 ring-slate-200 focus:ring-slate-400 transition-all placeholder:text-slate-400"
                    />
                  </div>
                  <div className="relative">
                    <HiOutlineLockClosed className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={handleChange}
                      placeholder="Password *"
                      required
                      minLength={6}
                      className="w-full pl-10 pr-11 py-3 bg-slate-50 rounded-2xl text-sm font-semibold text-slate-800 outline-none ring-1 ring-slate-200 focus:ring-slate-400 transition-all placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      {showPassword ? <HiOutlineEyeSlash className="h-4 w-4" /> : <HiOutlineEye className="h-4 w-4" />}
                    </button>
                  </div>
                  
                  {/* Category Selection Dropdown */}
                  <div className="sm:col-span-2 relative" ref={categoryDropdownRef}>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">
                      Sellers Product Type *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200/60 rounded-2xl text-sm font-semibold text-slate-800 outline-none hover:border-slate-300 transition-all text-left"
                    >
                      <span className="truncate">
                        {selectedTypes.length > 0
                          ? selectedTypes.map(t => `${t.headerName} > ${t.mainName}`).join(", ")
                          : "Select Sellers Product Type *"}
                      </span>
                      <svg className="w-4 h-4 text-slate-400 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {showCategoryDropdown && (
                      <div
                        onWheel={handleScrollWheel}
                        className="absolute left-0 right-0 mt-2 p-4 bg-white border border-slate-100 rounded-2xl shadow-xl z-[99999] max-h-60 overflow-y-auto overscroll-contain space-y-4"
                      >
                        {categoryTree.length === 0 ? (
                          <p className="text-xs text-slate-400 font-bold text-center py-2">Loading categories...</p>
                        ) : (
                          categoryTree.map((header) => (
                            <div key={header._id || header.id} className="space-y-2">
                              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-md">
                                {header.name}
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-2">
                                {header.children && header.children.length > 0 ? (
                                  header.children.map((main) => {
                                    const isChecked = selectedTypes.some(
                                      (t) => t.headerName === header.name && t.mainName === main.name
                                    );
                                    return (
                                      <label
                                        key={main._id || main.id}
                                        className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors text-xs font-bold text-slate-700"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => handleToggleCategory(header.name, main.name)}
                                          className="h-4 w-4 text-slate-900 border-slate-300 rounded focus:ring-0 cursor-pointer"
                                        />
                                        <span>{main.name}</span>
                                      </label>
                                    );
                                  })
                                ) : (
                                  <p className="text-[10px] text-slate-400 italic pl-2">No categories defined</p>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* Location */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Location</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2 relative">
                    <HiOutlineMapPin className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                    <input
                      name="address"
                      value={form.address}
                      onChange={handleChange}
                      placeholder="Full Address"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 rounded-2xl text-sm font-semibold text-slate-800 outline-none ring-1 ring-slate-200 focus:ring-slate-400 transition-all placeholder:text-slate-400"
                    />
                  </div>
                  <input
                    name="city"
                    value={form.city}
                    onChange={handleChange}
                    placeholder="City"
                    className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm font-semibold text-slate-800 outline-none ring-1 ring-slate-200 focus:ring-slate-400 transition-all placeholder:text-slate-400"
                  />
                  <input
                    name="state"
                    value={form.state}
                    onChange={handleChange}
                    placeholder="State"
                    className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm font-semibold text-slate-800 outline-none ring-1 ring-slate-200 focus:ring-slate-400 transition-all placeholder:text-slate-400"
                  />
                  <input
                    name="pincode"
                    value={form.pincode}
                    onChange={handleChange}
                    placeholder="Pincode"
                    className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm font-semibold text-slate-800 outline-none ring-1 ring-slate-200 focus:ring-slate-400 transition-all placeholder:text-slate-400"
                  />
                  <div className="relative">
                    <input
                      name="radius"
                      type="number"
                      min="1"
                      max="100"
                      value={form.radius}
                      onChange={handleChange}
                      placeholder="Service Radius (km)"
                      className="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm font-semibold text-slate-800 outline-none ring-1 ring-slate-200 focus:ring-slate-400 transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* Documents (optional) */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Documents</p>
                  <span className="text-[10px] font-semibold text-slate-300 bg-slate-100 px-2 py-0.5 rounded-full">Optional</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {DOC_LABELS.map(({ field, label }) => (
                    <div key={field}>
                      <input
                        ref={fileRefs[field]}
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => handleDoc(field, e.target.files?.[0])}
                      />
                      <button
                        type="button"
                        onClick={() => fileRefs[field].current?.click()}
                        className={cn(
                          "w-full flex flex-col items-center gap-2 px-3 py-4 rounded-2xl border-2 border-dashed text-center transition-all text-sm font-semibold",
                          docs[field]
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300 hover:bg-slate-100"
                        )}
                      >
                        {docs[field] ? (
                          <HiOutlineCheckCircle className="h-6 w-6 text-emerald-500" />
                        ) : (
                          <HiOutlineCloudArrowUp className="h-6 w-6" />
                        )}
                        <span className="text-[11px] leading-tight">
                          {docs[field] ? docs[field].name.slice(0, 20) + (docs[field].name.length > 20 ? "…" : "") : label}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-black shadow-lg hover:bg-black transition-all disabled:opacity-50"
                >
                  {submitting ? (
                    <HiOutlineArrowPath className="h-4 w-4 animate-spin" />
                  ) : (
                    <HiOutlinePlus className="h-4 w-4" />
                  )}
                  {submitting ? "Creating..." : "Create Seller"}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};


const SORT_OPTIONS = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name_asc", label: "Shop name A-Z" },
  { value: "name_desc", label: "Shop name Z-A" },
  { value: "revenue_desc", label: "Highest revenue" },
  { value: "orders_desc", label: "Most orders" },
  { value: "products_desc", label: "Most products" },
];

const currency = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const statClass = {
  blue: "bg-brand-50 text-brand-600",
  emerald: "bg-brand-50 text-brand-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
};

const emptyStats = {
  totalActiveSellers: 0,
  totalOrders: 0,
  totalRevenue: 0,
  newThisMonth: 0,
  highVolume: 0,
  averageRevenuePerSeller: 0,
  averageOrdersPerSeller: 0,
};

const normalizeSeller = (seller) => {
  const joinedAt = seller.joinedAt || seller.createdAt || null;

  return {
    ...seller,
    totalOrders: safeNumber(seller.totalOrders),
    deliveredOrders: safeNumber(seller.deliveredOrders),
    pendingOrders: safeNumber(seller.pendingOrders),
    totalRevenue: safeNumber(seller.totalRevenue),
    productCount: safeNumber(seller.productCount),
    avgOrderValue: safeNumber(seller.avgOrderValue),
    fulfillmentRate: safeNumber(seller.fulfillmentRate),
    serviceRadius: safeNumber(seller.serviceRadius) || 5,
    joinedDate: joinedAt
      ? new Date(joinedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : "N/A",
    lastOrderLabel: seller.lastOrderAt
      ? new Date(seller.lastOrderAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : "No orders yet",
    location: seller.location || "Location not set",
    avatar:
      seller.avatar ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
        seller.shopName || seller.ownerName || seller.email || "seller",
      )}`,
  };
};

const ActiveSellers = () => {
  const requestSeq = useRef(0);

  const [sellers, setSellers] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [categories, setCategories] = useState([]);
  const [headerCategories, setHeaderCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const fetchHeaders = async () => {
      try {
        const res = await adminApi.getCategories({ type: "header", limit: 100 });
        if (res.data.success) {
          const payload = res.data.result || {};
          const list = Array.isArray(payload.items) ? payload.items : [];
          const allCats = res.data.results || [];
          const headers = list.length > 0 ? list : allCats.filter((c) => c.type === "header");
          setHeaderCategories(headers);
        }
      } catch (err) {
        console.error("Failed to load header categories for filter", err);
      }
    };
    fetchHeaders();
  }, []);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [showAddSeller, setShowAddSeller] = useState(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);

  const handleDownloadReport = async () => {
    setIsDownloadingReport(true);
    try {
      // Fetch both active and pending sellers concurrently
      const [activeRes, pendingRes] = await Promise.all([
        adminApi.getActiveSellers({ page: 1, limit: 10000 }),
        adminApi.getPendingSellers({ page: 1, limit: 10000 }),
      ]);

      const activeList = activeRes.data?.result?.items || activeRes.data?.results || [];
      const pendingList = pendingRes.data?.result?.items || pendingRes.data?.results || [];

      // Combine both lists
      const csvRows = [];
      const headers = [
        "Seller ID",
        "Shop Name",
        "Owner Name",
        "Email",
        "Phone",
        "Category",
        "Location",
        "Service Radius (km)",
        "Status",
        "Joined Date",
        "Total Orders",
        "Total Revenue (Rs)",
        "Product Count",
      ];
      csvRows.push(headers.join(","));

      // Add Active Sellers
      activeList.forEach((seller) => {
        const row = [
          seller.sellerId || seller.id || seller._id || "N/A",
          `"${(seller.shopName || "").replace(/"/g, '""')}"`,
          `"${(seller.ownerName || seller.name || "").replace(/"/g, '""')}"`,
          `"${(seller.email || "").replace(/"/g, '""')}"`,
          `"${(seller.phone || "").replace(/"/g, '""')}"`,
          `"${(seller.category || "General").replace(/"/g, '""')}"`,
          `"${(seller.location || "").replace(/"/g, '""')}"`,
          seller.serviceRadius || 5,
          "Active / Approved",
          seller.joinedDate || "N/A",
          seller.totalOrders || 0,
          seller.totalRevenue || 0,
          seller.productCount || 0,
        ];
        csvRows.push(row.join(","));
      });

      // Add Pending / Waiting Review Sellers
      pendingList.forEach((seller) => {
        const row = [
          seller.sellerId || seller._id || "N/A",
          `"${(seller.shopName || "").replace(/"/g, '""')}"`,
          `"${(seller.name || "").replace(/"/g, '""')}"`,
          `"${(seller.email || "").replace(/"/g, '""')}"`,
          `"${(seller.phone || "").replace(/"/g, '""')}"`,
          `"${(seller.category || "General").replace(/"/g, '""')}"`,
          `"${(seller.address || "").replace(/"/g, '""')}"`,
          seller.serviceRadius || 5,
          "Pending / Waiting Review",
          seller.createdAt ? new Date(seller.createdAt).toLocaleDateString("en-GB") : "N/A",
          0,
          0,
          0,
        ];
        csvRows.push(row.join(","));
      });

      const csvContent = "\uFEFF" + csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `sellers_report_${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Sellers report downloaded successfully!");
    } catch (err) {
      console.error("Failed to download report", err);
      toast.error("Failed to download sellers report");
    } finally {
      setIsDownloadingReport(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, sortBy, pageSize]);

  useEffect(() => {
    if (selectedSeller) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedSeller]);

  useEffect(() => {
    const currentSeq = ++requestSeq.current;

    const loadSellers = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await adminApi.getActiveSellers({
          q: debouncedSearch || undefined,
          category: categoryFilter !== "all" ? categoryFilter : undefined,
          sort: sortBy,
          page,
          limit: pageSize,
        });

        if (currentSeq !== requestSeq.current) return;

        const payload = response.data?.result || {};
        const items = Array.isArray(payload.items) ? payload.items : [];
        const normalizedItems = items.map(normalizeSeller);

        setSellers(normalizedItems);
        setStats({
          ...emptyStats,
          ...payload.stats,
        });
        setCategories(
          Array.isArray(payload.filters?.categories) ? payload.filters.categories : [],
        );
        setTotal(safeNumber(payload.total) || normalizedItems.length);
        setTotalPages(safeNumber(payload.totalPages) || 1);
        setLastSyncAt(new Date());

        if (safeNumber(payload.totalPages) > 0 && page > payload.totalPages) {
          setPage(payload.totalPages);
        }
      } catch (err) {
        if (currentSeq !== requestSeq.current) return;
        console.error("Failed to load active sellers", err);
        const message =
          err.response?.data?.message || "Failed to load active sellers";
        setError(message);
        toast.error(message);
      } finally {
        if (currentSeq === requestSeq.current) {
          setLoading(false);
        }
      }
    };

    loadSellers();
  }, [debouncedSearch, categoryFilter, sortBy, page, pageSize, refreshTick]);

  const handleDeleteSeller = async (sellerId) => {
    if (!window.confirm("Are you sure you want to delete this store? This action cannot be undone.")) return;
    setIsDeleting(true);
    try {
      await adminApi.rejectSeller(sellerId, { reason: "Deleted by Admin" });
      toast.success("Store deleted successfully");
      setSelectedSeller(null);
      setRefreshTick((t) => t + 1);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete store");
    } finally {
      setIsDeleting(false);
    }
  };

  const summaryCards = useMemo(
    () => [
      {
        label: "Active Sellers",
        value: stats.totalActiveSellers.toLocaleString("en-IN"),
        icon: HiOutlineBuildingOffice2,
        color: "blue",
        note: "Verified and live",
      },
      {
        label: "Gross Revenue",
        value: currency(stats.totalRevenue),
        icon: HiOutlineArrowTrendingUp,
        color: "emerald",
        note: "Delivered order value",
      },
      {
        label: "Total Orders",
        value: stats.totalOrders.toLocaleString("en-IN"),
        icon: HiOutlineDocumentText,
        color: "amber",
        note: "Lifetime order volume",
      },
      {
        label: "New This Month",
        value: stats.newThisMonth.toLocaleString("en-IN"),
        icon: HiOutlineCalendarDays,
        color: "rose",
        note: "Recently approved",
      },
    ],
    [stats],
  );

  return (
    <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-2 duration-700 pb-16">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="ds-h1 flex items-center gap-2">
            Active Sellers
            <Badge
              variant="success"
              className="admin-tiny px-1.5 py-0 font-bold uppercase tracking-wider"
            >
              Live
            </Badge>
          </h1>
          <p className="ds-description mt-0.5">
            Review every verified seller, their performance, and current store health.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddSeller(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black shadow-lg hover:bg-emerald-700 transition-all active:scale-95"
          >
            <HiOutlinePlus className="h-4 w-4" />
            Add Seller
          </button>
          <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl ring-1 ring-slate-100">
            <HiOutlineClock className="h-4 w-4 text-slate-500" />
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
              {lastSyncAt
                ? `Synced ${lastSyncAt.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : "Sync pending"}
            </span>
          </div>
          <button
            onClick={() => setRefreshTick((value) => value + 1)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xl hover:bg-slate-800 transition-all"
          >
            <HiOutlineArrowPath className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="border-none shadow-sm ring-1 ring-slate-100 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="ds-label">{card.label}</p>
                <h4 className="ds-stat-medium mt-1">{card.value}</h4>
                <p className="text-[10px] font-semibold text-slate-400 mt-1 uppercase tracking-widest">
                  {card.note}
                </p>
              </div>
              <div
                className={cn(
                  "h-12 w-12 rounded-2xl flex items-center justify-center",
                  statClass[card.color],
                )}
              >
                <card.icon className="h-6 w-6" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="border-none shadow-xl ring-1 ring-slate-100 p-4 bg-white/80 backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by store name, owner, email, phone or location..."
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-semibold outline-none ring-1 ring-transparent focus:ring-primary/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto">
            <button
              onClick={handleDownloadReport}
              disabled={isDownloadingReport}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white ring-1 ring-slate-200 rounded-2xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
            >
              {isDownloadingReport ? (
                <HiOutlineArrowPath className="h-4 w-4 animate-spin text-slate-500" />
              ) : (
                <HiOutlineCloudArrowUp className="h-4 w-4 text-slate-500" />
              )}
              {isDownloadingReport ? "DOWNLOADING..." : "DOWNLOAD REPORT"}
            </button>

            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="px-4 py-3 bg-white ring-1 ring-slate-200 rounded-2xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">All Categories</option>
              {headerCategories.map((cat) => (
                <option key={cat._id || cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="px-4 py-3 bg-white ring-1 ring-slate-200 rounded-2xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card className="border-none shadow-xl ring-1 ring-slate-100 overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="ds-table-header-cell px-6">Store Entity</th>
                <th className="ds-table-header-cell px-6">Performance</th>
                <th className="ds-table-header-cell px-6">Business Intel</th>
                <th className="ds-table-header-cell px-6">Status</th>
                <th className="ds-table-header-cell px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <HiOutlineArrowPath className="h-8 w-8 text-slate-300 animate-spin" />
                      <p className="text-slate-500 font-bold text-sm">
                        Loading active sellers...
                      </p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="5" className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-16 w-16 rounded-full bg-rose-50 flex items-center justify-center">
                        <HiOutlineXMark className="h-8 w-8 text-rose-400" />
                      </div>
                      <p className="text-sm font-bold text-slate-600">{error}</p>
                      <button
                        onClick={() => setRefreshTick((value) => value + 1)}
                        className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
                      >
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : sellers.length > 0 ? (
                sellers.map((seller) => (
                  <tr key={seller.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl overflow-hidden bg-slate-100 ring-2 ring-slate-100 flex items-center justify-center">
                          <img
                            src={seller.avatar}
                            alt={seller.shopName}
                            className="h-full w-full object-cover"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {seller.shopName}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {seller.sellerId && (
                              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold font-mono tracking-wider">
                                {seller.sellerId}
                              </span>
                            )}
                            <span className="text-[10px] font-semibold text-slate-400">
                              {seller.ownerName}
                            </span>
                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                              {seller.category || "General"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-slate-900">
                            {(seller.totalOrders || 0).toLocaleString("en-IN")} Orders
                          </span>
                          <span className="text-[10px] font-bold text-brand-600">
                            {currency(seller.totalRevenue)}
                          </span>
                        </div>
                        <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-500 rounded-full"
                            style={{
                              width: `${Math.min(100, seller.fulfillmentRate || 0)}%`,
                            }}
                          />
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {(seller.fulfillmentRate || 0)}% fulfillment
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-slate-700">
                          <HiOutlineDocumentText className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-[10px] font-bold">
                            {(seller.productCount || 0).toLocaleString("en-IN")} products
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700">
                          <HiOutlineMapPin className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-[10px] font-bold truncate max-w-[260px]">
                            {seller.location || "Location not set"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <HiOutlineCalendarDays className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-bold">
                            Joined {seller.joinedDate || "N/A"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            variant="success"
                            className="w-fit text-[8px] font-black uppercase tracking-widest"
                          >
                            Active
                          </Badge>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            seller.shopStatusMeta?.isOpen
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}>
                            {seller.shopStatusMeta?.isOpen ? "🟢 OPEN" : "🔴 CLOSED"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-600">
                          <HiOutlineClock className="h-3 w-3 text-slate-400 flex-shrink-0" />
                          <span>{seller.shopTiming?.openingTime || "08:00"} - {seller.shopTiming?.closingTime || "20:00"}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Last order: {seller.lastOrderLabel || "No orders yet"}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedSeller(seller)}
                          className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-bold hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2"
                        >
                          <HiOutlineEye className="h-3.5 w-3.5" />
                          VIEW PROFILE
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center">
                        <HiOutlineBuildingOffice2 className="h-8 w-8 text-slate-200" />
                      </div>
                      <p className="text-slate-500 font-bold text-sm">
                        No active sellers found.
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Try a different search or filter.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4">
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          loading={loading}
        />
      </div>

      <AnimatePresence>
        {selectedSeller && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/75 backdrop-blur-md"
              onClick={() => setSelectedSeller(null)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 24 }}
              className="relative z-10 w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-start justify-between p-5 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-2xl overflow-hidden bg-slate-100 ring-4 ring-white shadow-lg">
                    <img
                      src={selectedSeller.avatar}
                      alt={selectedSeller.shopName}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-2xl font-black text-slate-900">
                        {selectedSeller.shopName}
                      </h3>
                      {selectedSeller.sellerId && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-black tracking-widest font-mono">
                          {selectedSeller.sellerId}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-500">
                      Owned by {selectedSeller.ownerName}
                    </p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="success"
                        className="text-[8px] font-black uppercase tracking-widest"
                      >
                        Active
                      </Badge>
                      <Badge
                        variant="primary"
                        className="text-[8px] font-black uppercase tracking-widest"
                      >
                        {selectedSeller.category || "General"}
                      </Badge>
                      {selectedSeller.phone?.startsWith("admin-") && (
                        <Badge
                          variant="warning"
                          className="text-[8px] font-black uppercase tracking-widest bg-amber-100 text-amber-800"
                        >
                          Seller added by the Admin
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedSeller(null)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <HiOutlineXMark className="h-6 w-6 text-slate-400" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12">
                <div className="lg:col-span-4 bg-slate-50 p-5 border-r border-slate-100">
                  <div className="space-y-5">
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                        Contact
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-slate-700">
                          <HiOutlineEnvelope className="h-4 w-4 text-slate-400" />
                          <span className="text-xs font-semibold break-all">
                            {selectedSeller.email || "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-700">
                          <HiOutlinePhone className="h-4 w-4 text-slate-400" />
                          <span className="text-xs font-semibold">
                            {selectedSeller.phone?.startsWith("admin-") ? "N/A" : (selectedSeller.phone || "N/A")}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-700">
                          <HiOutlineMapPin className="h-4 w-4 text-slate-400" />
                          <span className="text-xs font-semibold leading-relaxed">
                            {selectedSeller.location || "Location not set"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {selectedSeller.documents && (Array.isArray(selectedSeller.documents) ? selectedSeller.documents.length > 0 : Object.values(selectedSeller.documents).some(Boolean)) && (
                      <div className="space-y-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                          Uploaded Documents
                        </p>
                        <div className="grid grid-cols-1 gap-2">
                          {Array.isArray(selectedSeller.documents) ? (
                            selectedSeller.documents.map((url, index) => {
                              if (!url) return null;
                              return (
                                <a
                                  key={index}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center justify-between p-3 bg-white rounded-2xl ring-1 ring-slate-100 hover:bg-slate-100 transition-all text-xs font-bold text-slate-700"
                                >
                                  <span className="flex items-center gap-2">
                                    <HiOutlineDocumentText className="h-4 w-4 text-slate-400" />
                                    Document #{index + 1}
                                  </span>
                                  <span className="text-[10px] text-brand-600 uppercase font-black tracking-wider">
                                    View
                                  </span>
                                </a>
                              );
                            })
                          ) : (
                            Object.entries(selectedSeller.documents).map(([key, url]) => {
                              if (!url) return null;
                              const label = key
                                .replace(/([A-Z])/g, " $1")
                                .replace(/^./, (str) => str.toUpperCase());
                              return (
                                <a
                                  key={key}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center justify-between p-3 bg-white rounded-2xl ring-1 ring-slate-100 hover:bg-slate-100 transition-all text-xs font-bold text-slate-700"
                                >
                                  <span className="flex items-center gap-2">
                                    <HiOutlineDocumentText className="h-4 w-4 text-slate-400" />
                                    {label}
                                  </span>
                                  <span className="text-[10px] text-brand-600 uppercase font-black tracking-wider">
                                    View
                                  </span>
                                </a>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                        Store Health
                      </p>
                      <div className="p-4 bg-white rounded-2xl ring-1 ring-slate-100">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600 mt-3">
                          <span>Verification</span>
                          <span className="text-brand-600">Verified</span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600 mt-3">
                          <span>Live Store Status</span>
                          <span className={selectedSeller.shopStatusMeta?.isOpen ? "text-emerald-600 font-black" : "text-rose-600 font-black"}>
                            {selectedSeller.shopStatusMeta?.isOpen ? "🟢 OPEN (Online)" : "🔴 CLOSED (Offline)"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600 mt-3">
                          <span>Operating Hours</span>
                          <span>{selectedSeller.shopTiming?.openingTime || "08:00"} - {selectedSeller.shopTiming?.closingTime || "20:00"}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600 mt-3">
                          <span>Joined</span>
                          <span>{selectedSeller.joinedDate || "N/A"}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600 mt-3">
                          <span>Service radius</span>
                          <span>{selectedSeller.serviceRadius || 5} km</span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold text-slate-600 mt-3">
                          <span>Last order</span>
                          <span>{selectedSeller.lastOrderLabel || "No orders yet"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-8 p-5 bg-white">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    {[
                      {
                        label: "Orders",
                        value: (selectedSeller.totalOrders || 0).toLocaleString("en-IN"),
                      },
                      { label: "Revenue", value: currency(selectedSeller.totalRevenue) },
                      {
                        label: "Products",
                        value: (selectedSeller.productCount || 0).toLocaleString("en-IN"),
                      },
                      {
                        label: "Delivered",
                        value: (selectedSeller.deliveredOrders || 0).toLocaleString("en-IN"),
                      },
                      {
                        label: "Pending",
                        value: (selectedSeller.pendingOrders || 0).toLocaleString("en-IN"),
                      },
                      {
                        label: "Fulfillment",
                        value: `${selectedSeller.fulfillmentRate || 0}%`,
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="p-4 rounded-2xl bg-slate-50 border border-slate-100"
                      >
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                          {item.label}
                        </p>
                        <p className="text-lg font-black text-slate-900">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-brand-50 border border-brand-100">
                      <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest mb-1">
                        Performance
                      </p>
                      <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                        {(selectedSeller.fulfillmentRate || 0)}% of the orders for this seller have been completed successfully.
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                        Average order value
                      </p>
                      <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                        {currency(selectedSeller.avgOrderValue)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                      onClick={() => handleDeleteSeller(selectedSeller.id)}
                      disabled={isDeleting}
                      className="px-4 py-2.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold hover:bg-rose-100 hover:border-rose-200 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <HiOutlineArrowPath className="h-4 w-4 animate-spin" />
                      ) : (
                        <HiOutlineTrash className="h-4 w-4" />
                      )}
                      Delete Store
                    </button>
                    <button
                      onClick={() => setSelectedSeller(null)}
                      className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showAddSeller && (
        <AddSellerModal
          onClose={() => setShowAddSeller(false)}
          onSuccess={() => setRefreshTick((t) => t + 1)}
        />
      )}
    </div>
  );
};

export default ActiveSellers;

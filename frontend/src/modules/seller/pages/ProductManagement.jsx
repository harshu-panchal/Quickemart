import React, { useState, useMemo, useRef, useEffect } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import {
  HiOutlinePlus,
  HiOutlineCube,
  HiOutlineMagnifyingGlass,
  HiOutlineFunnel,
  HiOutlineTrash,
  HiOutlinePencilSquare,
  HiOutlineEye,
  HiOutlinePhoto,
  HiOutlineArchiveBox,
  HiOutlineTag,
  HiOutlineScale,
  HiOutlineArrowPath,
  HiOutlineXMark,
  HiOutlineChevronRight,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineFolderOpen,
  HiOutlineSwatch,
  HiOutlineSquaresPlus,
  HiOutlineDocumentText,
} from "react-icons/hi2";
import Modal from "@shared/components/ui/Modal";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { sellerApi } from "../services/sellerApi";
import { toast } from "sonner";
import Pagination from "@shared/components/ui/Pagination";

const ProductManagement = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qFromUrl = searchParams.get("q") || "";

  const [products, setProducts] = useState([]);
  const [dbCategories, setDbCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [summaryStats, setSummaryStats] = useState(null);

  const fetchProducts = async (requestedPage = 1) => {
    setIsLoading(true);
    try {
      const res = await sellerApi.getProducts({
        page: requestedPage,
        limit: pageSize,
        sort: sortBy,
        approvalStatus: filterApproval,
      });
      if (res.data.success) {
        // Backend returns handleResponse(..., { items, page, limit, total, totalPages })
        const payload = res.data.result || {};
        const rawProducts = Array.isArray(payload.items)
          ? payload.items
          : (res.data.results || []);
        const safe = Array.isArray(rawProducts) ? rawProducts : [];
        setProducts(safe);
        if (typeof payload.total === "number") {
          setTotal(payload.total);
        } else {
          setTotal(safe.length);
        }
        if (payload.summary && typeof payload.summary === "object") {
          setSummaryStats({
            total: Number(payload.summary.total) || 0,
            active: Number(payload.summary.active) || 0,
            lowStock: Number(payload.summary.lowStock) || 0,
            outOfStock: Number(payload.summary.outOfStock) || 0,
          });
        } else {
          setSummaryStats(null);
        }
        if (typeof payload.page === "number") {
          setPage(payload.page);
        } else {
          setPage(requestedPage);
        }
      }
    } catch (error) {
      toast.error("Failed to fetch products");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await sellerApi.getCategoryTree();
      if (res.data.success) {
        setDbCategories(res.data.results || res.data.result || []);
      }
    } catch (error) {
      // fail silently
    }
  };

  React.useEffect(() => {
    fetchCategories();
  }, []);

  const categories = dbCategories;

  const [searchTerm, setSearchTerm] = useState(qFromUrl);

  React.useEffect(() => {
    if (qFromUrl !== searchTerm) setSearchTerm(qFromUrl);
  }, [qFromUrl]);

  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterApproval, setFilterApproval] = useState("all"); // all | approved | pending | rejected
  const [sortBy, setSortBy] = useState("newest");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterDropdownRef = useRef(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [viewingVariants, setViewingVariants] = useState(null);
  const [isVariantsViewModalOpen, setIsVariantsViewModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [modalTab, setModalTab] = useState("general");
  const [selectedGalleryType, setSelectedGalleryType] = useState("");
  const [pendingSlot, setPendingSlot] = useState(null);
  const galleryFileInputRef = useRef(null);

  const makeSku = (name, index = 1) => {
    const prefix = String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 5) || "item";
    return `${prefix}-${String(index).padStart(3, "0")}`;
  };

  const isAutoSku = (sku, name, index = 1) =>
    String(sku || "").toLowerCase() === makeSku(name, index);

  const displaySku = (product) =>
    product.sku ||
    (Array.isArray(product.variants) && product.variants.length > 0 && product.variants[0]?.sku) ||
    makeSku(product.name, 1);

  const resolveLowStockThreshold = (product) => {
    const parsed = Number(product?.lowStockAlert);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
  };

  const handleModalScrollWheel = (event) => {
    const container = event.currentTarget;
    if (container.scrollHeight <= container.clientHeight) return;
    container.scrollTop += event.deltaY;
    event.preventDefault();
    event.stopPropagation();
  };

  React.useEffect(() => {
    if (!isProductModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isProductModalOpen]);

  // Close filter dropdown on outside click
  React.useEffect(() => {
    if (!isFilterOpen) return;
    const handleClickOutside = (event) => {
      if (
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(event.target)
      ) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isFilterOpen]);

  React.useEffect(() => {
    fetchProducts(1);
  }, [searchTerm, filterCategory, filterStatus, filterApproval, sortBy, pageSize]);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    sku: "",
    description: "",
    price: "",
    salePrice: "",
    stock: "",
    lowStockAlert: 5,
    category: "",
    header: "",
    subcategory: "",
    status: "active",
    tags: "",
    weight: "",
    brand: "",
    mainImage: null,
    galleryImages: [null, null, null, null, null],
    galleryLabels: ["", "", "", "", ""],
    variants: [
      { id: Date.now(), name: "", price: "", salePrice: "", stock: "", sku: "" },
    ],
  });

  const safeProducts = useMemo(
    () => (Array.isArray(products) ? products : []),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const min = priceMin ? Number(priceMin) : null;
    const max = priceMax ? Number(priceMax) : null;

    return safeProducts.filter((p) => {
      const variantSkus = Array.isArray(p.variants)
        ? p.variants
          .map((v) => (v?.sku || "").toString().toLowerCase())
          .filter(Boolean)
        : [];
      const skuCandidate =
        (p.sku || "").toString().toLowerCase() ||
        (variantSkus.length > 0 ? variantSkus[0] : "");

      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        (!!skuCandidate && skuCandidate.includes(term));
      const matchesCategory =
        filterCategory === "all" ||
        (p.categoryId?._id || p.categoryId) === filterCategory ||
        (p.headerId?._id || p.headerId) === filterCategory;

      let matchesStatus = filterStatus === "All";
      if (filterStatus === "Active") matchesStatus = p.status === "active";
      if (filterStatus === "Low Stock")
        matchesStatus = p.stock > 0 && p.stock <= resolveLowStockThreshold(p);
      if (filterStatus === "Out of Stock") matchesStatus = p.stock === 0;

      let matchesPrice = true;
      const effectivePrice = Number(p.salePrice ?? p.price ?? 0);
      if (min !== null && !Number.isNaN(min)) {
        matchesPrice = matchesPrice && effectivePrice >= min;
      }
      if (max !== null && !Number.isNaN(max)) {
        matchesPrice = matchesPrice && effectivePrice <= max;
      }

      const rawApproval = String(p.approvalStatus || "").trim().toLowerCase();
      const normalizedApproval = rawApproval || "approved"; // legacy products without moderation fields are treated as approved
      let matchesApproval = true;
      if (filterApproval !== "all") {
        matchesApproval = normalizedApproval === filterApproval;
      }

      return (
        matchesSearch &&
        matchesCategory &&
        matchesStatus &&
        matchesApproval &&
        matchesPrice
      );
    });
  }, [
    safeProducts,
    searchTerm,
    filterCategory,
    filterStatus,
    filterApproval,
    priceMin,
    priceMax,
  ]);

  const stats = useMemo(
    () => ({
      total:
        summaryStats?.total ??
        (typeof total === "number" ? total : safeProducts.length),
      lowStock:
        summaryStats?.lowStock ??
        safeProducts.filter((p) => p.stock > 0 && p.stock <= resolveLowStockThreshold(p)).length,
      outOfStock:
        summaryStats?.outOfStock ??
        safeProducts.filter((p) => p.stock === 0).length,
      active:
        summaryStats?.active ??
        safeProducts.filter((p) => p.status === "active").length,
    }),
    [safeProducts, summaryStats, total],
  );

  const ApprovalBadge = ({ approvalStatus }) => {
    const normalized = String(approvalStatus || "approved").toLowerCase();
    if (normalized === "pending") {
      return <Badge variant="warning" className="text-[10px] px-2 py-0.5">Pending Approval</Badge>;
    }
    if (normalized === "rejected") {
      return <Badge variant="error" className="text-[10px] px-2 py-0.5">Rejected</Badge>;
    }
    return <Badge variant="success" className="text-[10px] px-2 py-0.5">Approved</Badge>;
  };

  const handleSave = async () => {
    try {
      if (!editingItem) return;

      // Validate pricing and stock
      for (let i = 0; i < formData.variants.length; i++) {
        const v = formData.variants[i];
        if (!v.price || Number(v.price) <= 0) {
          toast.error(`Please enter a valid price for variant "${v.name}"`);
          return;
        }
        if (v.salePrice && Number(v.salePrice) > Number(v.price)) {
          toast.error(`Sale price cannot be greater than regular price for variant "${v.name}"`);
          return;
        }
        if (v.stock === "" || Number(v.stock) < 0) {
          toast.error(`Please enter stock for variant "${v.name}"`);
          return;
        }
      }

      const data = new FormData();
      data.append("status", formData.status);
      
      const firstVariant = formData.variants[0] || {};
      data.append("price", firstVariant.price);
      data.append("salePrice", firstVariant.salePrice || 0);
      data.append("stock", firstVariant.stock);
      data.append("sku", firstVariant.sku);
      
      data.append("variants", JSON.stringify(formData.variants.map(v => ({
          name: v.name,
          price: Number(v.price),
          salePrice: Number(v.salePrice) || 0,
          stock: Number(v.stock),
          sku: v.sku
      }))));

      const response = await sellerApi.updateProduct(editingItem._id || editingItem.id, data);
      const approvalStatus = response?.data?.result?.approvalStatus;
      if (approvalStatus === "pending") {
        toast.success("Product changes submitted for admin approval");
      } else {
        toast.success(response?.data?.message || "Product updated successfully");
      }

      setIsProductModalOpen(false);
      setEditingItem(null);
      fetchProducts();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save product");
    }
  };

  const IMAGE_LABEL_OPTIONS = ["Front", "Back", "Product details image", "Left side", "Right side"];

  const handleRemoveGalleryImage = (idx) => {
    const newImages = [...formData.galleryImages];
    const newFiles = [...(formData.galleryFiles || [null, null, null, null, null])];
    const newLabels = [...formData.galleryLabels];
    newImages[idx] = null;
    newFiles[idx] = null;
    newLabels[idx] = "";
    setFormData({ ...formData, galleryImages: newImages, galleryFiles: newFiles, galleryLabels: newLabels });
  };

  const handleGalleryTypeSelect = (e) => {
    const type = e.target.value;
    if (!type) {
      setSelectedGalleryType("");
      return;
    }
    const firstEmpty = formData.galleryImages.findIndex((img) => !img);
    if (firstEmpty === -1) {
      toast.error("All 5 gallery slots are already filled.");
      return;
    }
    setSelectedGalleryType(type);
    setPendingSlot(firstEmpty);
    galleryFileInputRef.current.value = "";
    galleryFileInputRef.current.click();
  };

  const handleGalleryFileChange = (e) => {
    if (!e.target.files || !e.target.files[0] || pendingSlot === null) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onloadend = () => {
      const newImages = [...formData.galleryImages];
      const newFiles = [...(formData.galleryFiles || [null, null, null, null, null])];
      const newLabels = [...formData.galleryLabels];
      newImages[pendingSlot] = reader.result;
      newFiles[pendingSlot] = file;
      newLabels[pendingSlot] = selectedGalleryType;
      setFormData({ ...formData, galleryImages: newImages, galleryFiles: newFiles, galleryLabels: newLabels });
      setSelectedGalleryType("");
      setPendingSlot(null);
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e, type) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, mainImage: reader.result, mainImageFile: file });
      };
      reader.readAsDataURL(file);
    }
  };

  const exportProducts = () => {
    console.log("Exporting products...");
    alert("Exporting " + safeProducts.length + " products as CSV (Simulation)");
  };

  const handleDeleteClick = (product) => {
    setItemToDelete(product);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await sellerApi.deleteProduct(itemToDelete._id || itemToDelete.id);
      toast.success("Product deleted successfully");
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
      fetchProducts();
    } catch (error) {
      toast.error("Failed to delete product");
    }
  };

  const openEditModal = (item = null) => {
    if (item) {
      const rawHeader = item.headerId?._id || item.headerId;
      const rawCategory = item.categoryId?._id || item.categoryId;
      const rawSubcategory = item.subcategoryId?._id || item.subcategoryId;

      let headerStr = rawHeader ? String(rawHeader) : "";
      let categoryStr = rawCategory ? String(rawCategory) : "";
      let subcategoryStr = rawSubcategory ? String(rawSubcategory) : "";

      if (categories && categories.length > 0) {
        for (const h of categories) {
          const hId = String(h._id || h.id);
          let foundInHeader = false;

          if (h.children) {
            for (const c of h.children) {
              const cId = String(c._id || c.id);

              if (c.children) {
                for (const sc of c.children) {
                  const scId = String(sc._id || sc.id);
                  if (scId === subcategoryStr || scId === categoryStr || scId === headerStr) {
                    headerStr = hId;
                    categoryStr = cId;
                    subcategoryStr = scId;
                    foundInHeader = true;
                    break;
                  }
                }
              }

              if (foundInHeader) break;

              if (cId === categoryStr || cId === subcategoryStr || cId === headerStr) {
                headerStr = hId;
                categoryStr = cId;
                foundInHeader = true;
                break;
              }
            }
          }

          if (foundInHeader) break;

          if (hId === headerStr || hId === categoryStr) {
            headerStr = hId;
          }
        }
      }

      setFormData({
        name: item.name || "",
        slug: item.slug || "",
        sku: item.sku || "",
        description: item.description || "",
        price: item.price ?? "",
        salePrice: item.salePrice ?? "",
        stock: item.stock ?? "",
        lowStockAlert: item.lowStockAlert ?? 5,
        header: headerStr,
        category: categoryStr,
        subcategory: subcategoryStr,
        status: item.status || "active",
        tags: Array.isArray(item.tags) ? item.tags.join(", ") : item.tags || "",
        weight: item.weight || "",
        brand: item.brand || "",
        mainImage: item.mainImage || null,
        galleryImages: [
          item.galleryImages?.[0] || null,
          item.galleryImages?.[1] || null,
          item.galleryImages?.[2] || null,
          item.galleryImages?.[3] || null,
          item.galleryImages?.[4] || null,
        ],
        galleryLabels: [
          item.galleryLabels?.[0] || "",
          item.galleryLabels?.[1] || "",
          item.galleryLabels?.[2] || "",
          item.galleryLabels?.[3] || "",
          item.galleryLabels?.[4] || "",
        ],
        variants: (item.variants && item.variants.length > 0) ? item.variants.map(v => ({ ...v, id: v._id || Date.now() })) : [
          {
            id: Date.now(),
            name: "",
            price: item.price ?? "",
            salePrice: item.salePrice ?? "",
            stock: item.stock ?? "",
            sku: item.sku || "",
          },
        ],
      });
      setEditingItem(item);
    } else {
      setFormData({
        name: "",
        slug: "",
        sku: "",
        description: "",
        price: "",
        salePrice: "",
        stock: "",
        lowStockAlert: 5,
        category: "",
        header: "",
        status: "active",
        tags: "",
        weight: "",
        brand: "",
        mainImage: null,
        galleryImages: [null, null, null, null, null],
        galleryLabels: ["", "", "", "", ""],
        variants: [
          {
            id: Date.now(),
            name: "",
            price: "",
            salePrice: "",
            stock: "",
            sku: "",
          },
        ],
      });
      setEditingItem(null);
    }
    setModalTab("general");
    setIsProductModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-16">

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            Product List
            <Badge
              variant="primary"
              className="text-[9px] px-1.5 py-0 font-bold tracking-wider uppercase">
              Live
            </Badge>
          </h1>
          <p className="text-gray-500 mt-1">
            Track your items, prices, and how many are left in stock.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/seller/products/bulk-upload")}
            className="flex items-center gap-2 bg-white text-gray-800 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
            <HiOutlineDocumentText className="h-5 w-5" />
            Bulk Upload
          </button>
          <button
            onClick={() => navigate("/seller/products/add")}
            className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors shadow-sm">
            <HiOutlinePlus className="h-5 w-5" />
            Add New Product
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "All Items",
            val: stats.total,
            icon: HiOutlineCube,
            color: "text-brand-600",
            bg: "bg-brand-50",
            status: "All",
          },
          {
            label: "Active Items",
            val: stats.active,
            icon: HiOutlineCheckCircle,
            color: "text-brand-600",
            bg: "bg-brand-50",
            status: "Active",
          },
          {
            label: "Low Stock",
            val: stats.lowStock,
            icon: HiOutlineExclamationCircle,
            color: "text-amber-600",
            bg: "bg-amber-50",
            status: "Low Stock",
          },
          {
            label: "Out of Stock",
            val: stats.outOfStock,
            icon: HiOutlineArchiveBox,
            color: "text-rose-600",
            bg: "bg-rose-50",
            status: "Out of Stock",
          },
        ].map((stat, i) => (
          <Card
            key={i}
            className={cn(
              "border-none shadow-sm ring-1 ring-slate-100 p-4 relative overflow-hidden group cursor-pointer",
              filterStatus === stat.status && "ring-2 ring-brand-500",
            )}
            onClick={() => setFilterStatus(stat.status)}
          >
            <div className="flex items-center gap-3">
              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300", stat.bg, stat.color)}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="ds-label">{stat.label}</p>
                <h4 className="ds-stat-medium">{stat.val}</h4>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Toolbox */}

      <Card className="border-none shadow-sm ring-1 ring-slate-100 p-3 bg-white/60 backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row gap-3 items-center">
          <div className="relative flex-1 group w-full">
            <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-all" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                const value = e.target.value;
                setSearchTerm(value);
                const next = new URLSearchParams(searchParams);
                if (value) next.set("q", value);
                else next.delete("q");
                setSearchParams(next);
              }}
              placeholder="Search by name, SKU or slug..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-100/50 border-none rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/5 transition-all outline-none"
            />
          </div>
          <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 w-full lg:w-auto shrink-0">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="col-span-2 md:col-span-auto w-full md:w-auto h-11 px-3 bg-white ring-1 ring-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-primary/5 outline-none cursor-pointer"
            >
              <option value="all">All Categories</option>
              {categories.map((h) => (
                <optgroup key={h._id || h.id} label={h.name}>
                  <option value={h._id || h.id}>All {h.name}</option>
                  {(h.children || []).map((c) => (
                    <option key={c._id || c.id} value={c._id || c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setIsFilterOpen((prev) => !prev)}
              className="col-span-1 md:col-span-auto w-full md:w-auto h-11 flex items-center justify-center space-x-2 bg-white ring-1 ring-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
            >
              <HiOutlineFunnel className="h-4 w-4 flex-shrink-0" />
              <span>Filters</span>
            </button>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="col-span-1 md:col-span-auto w-full md:w-auto h-11 px-3 bg-white ring-1 ring-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-primary/5 outline-none cursor-pointer"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
              <option value="price-asc">Price Low-High</option>
              <option value="price-desc">Price High-Low</option>
              <option value="stock-asc">Stock Low-High</option>
              <option value="stock-desc">Stock High-Low</option>
            </select>
          </div>
        </div>
      </Card>


      {/* Desktop Product Table */}

      <Card className="hidden md:block border-none shadow-xl ring-1 ring-slate-100 overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-3 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                  Product Code
                </th>
                <th className="px-6 py-3 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                  Header
                </th>
                <th className="px-6 py-3 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                  Subcategory
                </th>
                <th className="px-6 py-3 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                  Variant
                </th>
                <th className="px-6 py-3 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                  Approval
                </th>
                <th className="px-6 py-3 text-right text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => (
                <tr
                  key={p._id || p.id}
                  className="hover:bg-gray-50/50 transition-colors group border-b border-gray-100 last:border-b-0">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-lg overflow-hidden bg-slate-100 ring-1 ring-slate-200">
                        <img
                          src={
                            p.mainImage ||
                            p.image ||
                            "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400"
                          }
                          alt={p.name}
                          className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {p.name}
                        </p>
                        {String(p.approvalStatus || "").toLowerCase() === "pending" ? (
                          <p className="text-[10px] font-medium text-amber-600">
                            Hidden from customers until admin approval.
                          </p>
                        ) : null}
                        {String(p.approvalStatus || "").toLowerCase() === "rejected" ? (
                          <p className="text-[10px] font-medium text-rose-600">
                            {p.approvalNote ? `Rejected: ${p.approvalNote}` : "Rejected by admin. Update and resubmit."}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-slate-900">
                      {displaySku(p)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-left">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-slate-900 uppercase tracking-tight bg-slate-100 px-3 py-0.5 rounded-full w-fit">
                        {p.headerId?.name || "N/A"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-slate-900">
                      {p.categoryId?.name || "N/A"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-slate-900">
                      {p.subcategoryId?.name || "N/A"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {p.variants?.length > 0 ? (
                      <div
                        onClick={() => {
                          setViewingVariants(p);
                          setIsVariantsViewModalOpen(true);
                        }}
                        className="flex flex-col items-center cursor-pointer hover:bg-slate-50 p-1.5 rounded-xl transition-all active:scale-95 group"
                      >
                        <Badge
                          variant="indigo"
                          className="text-xs font-medium px-3 py-0.5 group-hover:shadow-sm transition-all"
                        >
                          {p.variants.length} VARIANTS
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-slate-400 bg-slate-50 border border-slate-100 px-2 py-1 rounded italic">
                        None
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {p.isMasterCatalogItem ? (
                      <span className="text-[10px] text-slate-400 italic">Not Listed</span>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <ApprovalBadge approvalStatus={p.approvalStatus} />
                        {p.approvalReviewedAt ? (
                          <span className="text-[10px] text-slate-400">Reviewed</span>
                        ) : p.approvalRequestedAt ? (
                          <span className="text-[10px] text-slate-400">Submitted</span>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      {p.isMasterCatalogItem ? (
                        // Unlisted master catalog item → "List Now" button
                        <button
                          onClick={() => navigate(`/seller/products/add?masterProductId=${p._id}`)}
                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all shadow-sm shadow-emerald-100">
                          <HiOutlinePlus className="h-3 w-3" />
                          List Now
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => openEditModal(p)}
                            className="p-1 hover:text-brand-600 rounded-lg transition-all text-slate-500"
                            title={p.isLegacyProduct ? "Edit (full)" : "Edit price & stock"}>
                            <HiOutlinePencilSquare className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(p)}
                            className="p-1 hover:text-rose-600 rounded-lg transition-all text-slate-500">
                            <HiOutlineTrash className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile Card List View */}
      <div className="md:hidden space-y-4 px-1">
        {filteredProducts.length === 0 ? (
          <Card className="border-none shadow-sm ring-1 ring-slate-100 p-8 text-center text-slate-400 font-bold text-xs">
            No products found matching filters.
          </Card>
        ) : (
          filteredProducts.map((p) => (
            <Card key={p._id || p.id} className="border-none shadow-sm ring-1 ring-slate-100 p-4 bg-white rounded-2xl relative overflow-hidden group">
              {/* Card Header: Product Info and Actions */}
              <div className="flex gap-3.5 items-start text-left">
                {/* Product Image */}
                <div className="h-16 w-16 rounded-xl overflow-hidden bg-slate-100 ring-1 ring-slate-200/60 flex-shrink-0">
                  <img
                    src={
                      p.mainImage ||
                      p.image ||
                      "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400"
                    }
                    alt={p.name}
                    className="h-full w-full object-cover"
                  />
                </div>

                {/* Product Details */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                    {p.name}
                  </h4>
                  <p className="text-[10px] text-slate-500 font-semibold tracking-wide uppercase mt-1">
                    Code: {displaySku(p)}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-[9px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                      {p.categoryId?.name || "N/A"}
                    </span>
                    {p.subcategoryId?.name && (
                      <span className="text-[9px] font-bold text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded">
                        {p.subcategoryId.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {p.isMasterCatalogItem ? (
                    <button
                      onClick={() => navigate(`/seller/products/add?masterProductId=${p._id}`)}
                      className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all shadow-sm shadow-emerald-100"
                    >
                      <HiOutlinePlus className="h-3.5 w-3.5" />
                      List
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => openEditModal(p)}
                        className="p-1.5 hover:bg-slate-50 hover:text-brand-600 rounded-lg transition-all text-slate-500"
                        title={p.isLegacyProduct ? "Edit (full)" : "Edit price & stock"}
                      >
                        <HiOutlinePencilSquare className="h-4.5 w-4.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(p)}
                        className="p-1.5 hover:bg-slate-50 hover:text-rose-600 rounded-lg transition-all text-slate-500"
                      >
                        <HiOutlineTrash className="h-4.5 w-4.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Separator */}
              <div className="h-px bg-slate-100 my-3" />

              {/* Card Body: Additional Information */}
              <div className="grid grid-cols-2 gap-3 text-left">
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Approval Status</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {p.isMasterCatalogItem ? (
                      <span className="text-[10px] text-slate-400 italic">Not Listed</span>
                    ) : (
                      <div className="flex flex-col items-start gap-0.5">
                        <ApprovalBadge approvalStatus={p.approvalStatus} />
                        {p.approvalReviewedAt ? (
                          <span className="text-[9px] text-slate-400">Reviewed</span>
                        ) : p.approvalRequestedAt ? (
                          <span className="text-[9px] text-slate-400">Submitted</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Variants</p>
                  <div className="mt-0.5">
                    {p.variants?.length > 0 ? (
                      <button
                        onClick={() => {
                          setViewingVariants(p);
                          setIsVariantsViewModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-indigo-50 border border-indigo-100/50 rounded-lg text-[10px] font-bold text-indigo-600 active:scale-95 transition-all"
                      >
                        {p.variants.length} Variants
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 italic">None</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Warning/Notes for pending/rejected items */}
              {!p.isMasterCatalogItem && String(p.approvalStatus || "").toLowerCase() === "pending" && (
                <div className="mt-3 bg-amber-50/50 border border-amber-100/50 p-2 rounded-lg text-left">
                  <p className="text-[10px] font-medium text-amber-700 leading-snug">
                    Hidden from customers until admin approval.
                  </p>
                </div>
              )}
              {!p.isMasterCatalogItem && String(p.approvalStatus || "").toLowerCase() === "rejected" && (
                <div className="mt-3 bg-rose-50/50 border border-rose-100/50 p-2 rounded-lg text-left">
                  <p className="text-[10px] font-medium text-rose-700 leading-snug">
                    {p.approvalNote ? `Rejected: ${p.approvalNote}` : "Rejected by admin. Update and resubmit."}
                  </p>
                </div>
              )}
            </Card>
          ))
        )}
      </div>


      {isFilterOpen && (
        <div
          ref={filterDropdownRef}
          className="absolute z-[9999] right-36 top-[350px] w-64 rounded-xl border border-slate-200 bg-white shadow-xl p-4 space-y-3"
        >
          <div>
            <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-[0.18em] mb-1">
              Status
            </p>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-primary/10 outline-none bg-white"
            >
              <option value="All">All</option>
              <option value="Active">Active</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Out of Stock">Out of Stock</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-[0.18em] mb-1">
                Min Price
              </p>
              <input
                type="number"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                placeholder="e.g. 100"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-primary/10 outline-none bg-white"
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-[0.18em] mb-1">
                Max Price
              </p>
              <input
                type="number"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                placeholder="e.g. 1000"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-primary/10 outline-none bg-white"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                setFilterCategory("all");
                setFilterStatus("All");
                setFilterApproval("all");
                setPriceMin("");
                setPriceMax("");
                setSearchTerm("");
                setSearchParams({});
              }}
              className="text-[11px] font-bold text-slate-600 hover:text-slate-700"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setIsFilterOpen(false)}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        <Pagination
          page={page}
          totalPages={Math.ceil(total / pageSize) || 1}
          total={total}
          pageSize={pageSize}
          onPageChange={(p) => fetchProducts(p)}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
            fetchProducts(1);
          }}
          loading={isLoading}
        />
      </div>

      {/* Edit Modal (Copy from Admin) */}
      <AnimatePresence>
        {isProductModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-12 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
              onClick={() => setIsProductModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-5xl relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
                    <HiOutlineCube className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Edit Product
                    </h3>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <Badge
                        variant="primary"
                        className="text-[7px] font-bold uppercase tracking-widest px-1 bg-brand-100 text-brand-700">
                        SELLER
                      </Badge>
                      <HiOutlineChevronRight className="h-2.5 w-2.5 text-slate-300" />
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                        {formData.sku || "PENDING SKU"}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setIsProductModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600">
                  <HiOutlineXMark className="h-5 w-5" />
                </button>
              </div>

              <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
                {/* Left Side: Configuration Fields */}
                <div className="lg:w-3/5 p-6 overflow-y-auto space-y-6 border-r border-slate-100">
                  {/* Status & Low Stock Alert Row */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Listing Status
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/40 text-slate-700"
                      >
                        <option value="active">Active (Visible to customers)</option>
                        <option value="inactive">Inactive (Hidden from search)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Low Stock Threshold
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={formData.lowStockAlert}
                        onChange={(e) => setFormData({ ...formData, lowStockAlert: e.target.value })}
                        placeholder="e.g. 5"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/40 text-slate-700"
                      />
                    </div>
                  </div>

                  {/* Variants Inputs */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                      <HiOutlineSwatch className="h-4 w-4 text-emerald-500" />
                      <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">Configure Variation Prices</h4>
                    </div>

                    <div className="space-y-3">
                      {formData.variants.map((v, i) => (
                        <div key={v.id || i} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
                          <div className="flex justify-between items-center pb-2 border-b border-slate-200/40">
                            <span className="text-[10px] font-black text-slate-600 bg-white border border-slate-200/60 px-2.5 py-0.5 rounded-md">
                              {v.name || `Variant ${i + 1}`}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400">
                              SKU: {v.sku || "N/A"}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                                Price (₹) *
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={v.price}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const news = [...formData.variants];
                                  news[i].price = val;
                                  setFormData({ ...formData, variants: news });
                                }}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/40 text-slate-800"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                                Sale Price (₹)
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={v.salePrice}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const news = [...formData.variants];
                                  news[i].salePrice = val;
                                  setFormData({ ...formData, variants: news });
                                }}
                                className={`w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold outline-none text-slate-800 transition-all ${
                                  v.salePrice && Number(v.salePrice) > Number(v.price)
                                    ? "border-rose-300 focus:ring-rose-500/10 focus:border-rose-500"
                                    : "border-slate-200 focus:ring-emerald-500/10 focus:border-emerald-500/40"
                                }`}
                              />
                              {v.salePrice && Number(v.salePrice) > Number(v.price) && (
                                <span className="text-[9px] text-rose-500 font-bold block mt-1">
                                  Sale price cannot be greater than regular price
                                </span>
                              )}
                            </div>

                            <div className="space-y-1">
                              <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                                Stock *
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={v.stock}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const news = [...formData.variants];
                                  news[i].stock = val;
                                  setFormData({ ...formData, variants: news });
                                }}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/40 text-slate-800"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Side: Product Details Preview */}
                <div className="lg:w-2/5 p-6 bg-slate-50/50 overflow-y-auto space-y-4">
                  <div className="aspect-[4/3] rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden flex items-center justify-center relative">
                    {formData.mainImage ? (
                      <img src={formData.mainImage} alt={formData.name} className="w-full h-full object-cover" />
                    ) : (
                      <HiOutlinePhoto className="h-12 w-12 text-slate-200" />
                    )}
                    <span className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md text-white text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                      {formData.brand || "NO BRAND"}
                    </span>
                  </div>

                  <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Master Product</h4>
                      <h3 className="text-sm font-black text-slate-800 leading-tight mt-0.5">{formData.name}</h3>
                    </div>
                    {formData.description && (
                      <div className="space-y-1">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</h4>
                        <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-h-32 overflow-y-auto custom-scrollbar">
                          {formData.description}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                <button
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">
                  CLOSE
                </button>
                <button
                  onClick={handleSave}
                  className="bg-slate-900 text-white px-10 py-2.5 rounded-xl text-xs font-bold shadow-xl hover:-translate-y-0.5 transition-all">
                  SAVE CHANGES
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Deletion"
        size="sm"
        footer={
          <div className="flex gap-4 justify-end w-full">
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-700 transition-colors">
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="px-6 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all active:scale-95">
              Delete product
            </button>
          </div>
        }>
        <div className="px-6 py-6 flex flex-col items-center text-center space-y-5">
          <div className="h-18 w-18 md:h-20 md:w-20 bg-rose-50 rounded-full flex items-center justify-center text-rose-500">
            <HiOutlineTrash className="h-9 w-9 md:h-10 md:w-10" />
          </div>
          <div className="space-y-2 max-w-md">
            <h4 className="text-lg font-semibold text-slate-900">
              Are you absolutely sure?
            </h4>
            <p className="text-sm text-slate-600 leading-relaxed">
              This action cannot be undone. This will permanently remove{" "}
              <span className="font-semibold text-slate-900">
                {itemToDelete?.name}
              </span>{" "}
              from the catalog.
            </p>
          </div>
        </div>
      </Modal>

      {/* Viewing Variants Modal */}
      <Modal
        isOpen={isVariantsViewModalOpen}
        onClose={() => setIsVariantsViewModalOpen(false)}
        title="Product Variants Details"
        size="lg"
      >
        <div className="py-2">
          <div className="flex items-center gap-4 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="h-16 w-16 bg-white rounded-xl shadow-sm overflow-hidden flex items-center justify-center border border-slate-100">
              {viewingVariants?.mainImage || viewingVariants?.galleryImages?.[0] || viewingVariants?.image ? (
                <img src={viewingVariants.mainImage || viewingVariants.galleryImages?.[0] || viewingVariants.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <HiOutlineCube className="h-8 w-8 text-slate-200" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 leading-tight">{viewingVariants?.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="primary" className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5">{viewingVariants?.categoryId?.name || 'Category'}</Badge>
                <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">Master SKU: {viewingVariants?.sku || viewingVariants?._id?.slice(-6).toUpperCase() || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-sm bg-white">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-600 uppercase tracking-widest">Variant Specification</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-600 uppercase tracking-widest text-center">Unit Price</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-600 uppercase tracking-widest text-center">Available Stock</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-600 uppercase tracking-widest text-right">Variant SKU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {viewingVariants?.variants?.map((v, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/30 transition-all cursor-default">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-slate-700 group-hover:text-primary transition-colors">{v.name}</span>
                        <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mt-0.5">Variation {idx + 1}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className={cn("text-xs font-bold", v.salePrice > 0 ? "text-slate-600 line-through scale-90" : "text-slate-900")}>₹{v.price}</span>
                        {v.salePrice > 0 && <span className="text-xs font-bold text-brand-600">₹{v.salePrice}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge variant={v.stock === 0 ? "rose" : v.stock <= 10 ? "amber" : "emerald"} className="text-[10px] font-black uppercase tracking-widest px-2 shadow-sm">
                        {v.stock === 0 ? 'OUT OF STOCK' : `${v.stock} UNITS`}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-[10px] font-bold text-slate-600 font-mono tracking-tighter uppercase bg-slate-100 px-2 py-1 rounded-lg">
                        {v.sku || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              onClick={() => setIsVariantsViewModalOpen(false)}
              className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:-translate-y-0.5 transition-all active:scale-95"
            >
              CLOSE VIEWER
            </button>
          </div>
        </div>
      </Modal>
    </div >
  );
};

export default ProductManagement;

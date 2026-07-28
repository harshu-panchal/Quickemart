import React, { useState, useEffect, useRef } from "react";
import Button from "@shared/components/ui/Button";
import {
  HiOutlineArrowLeft,
  HiOutlineFolderOpen,
  HiOutlineTag,
  HiOutlineArrowPath,
  HiOutlineSparkles,
  HiOutlineInformationCircle,
  HiOutlineCube,
  HiOutlineSwatch,
  HiOutlineCheckCircle,
  HiOutlinePhoto,
} from "react-icons/hi2";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { sellerApi } from "../services/sellerApi";
import BrandSelect from "@shared/components/BrandSelect";

const AddProduct = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSelectedMasterProductId = searchParams.get("masterProductId") || "";
  const [isSaving, setIsSaving] = useState(false);
  const [dbCategories, setDbCategories] = useState([]);
  const [isLoadingCats, setIsLoadingCats] = useState(true);

  const isFirstRender = useRef(true);

  // Category selections (initialized from sessionStorage)
  const [selectedHeader, setSelectedHeader] = useState(() => sessionStorage.getItem("add_prod_selectedHeader") || "");
  const [selectedCategory, setSelectedCategory] = useState(() => sessionStorage.getItem("add_prod_selectedCategory") || "");
  const [selectedSubcategory, setSelectedSubcategory] = useState(() => sessionStorage.getItem("add_prod_selectedSubcategory") || "");

  // Brand and product list states (initialized from sessionStorage)
  const [brands, setBrands] = useState(() => {
    try {
      const data = sessionStorage.getItem("add_prod_brands");
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  });
  const [selectedBrand, setSelectedBrand] = useState(() => sessionStorage.getItem("add_prod_selectedBrand") || "");
  const [isLoadingBrands, setIsLoadingBrands] = useState(false);

  const [masterProducts, setMasterProducts] = useState(() => {
    try {
      const data = sessionStorage.getItem("add_prod_masterProducts");
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  });
  const [selectedMasterProductId, setSelectedMasterProductId] = useState(() => sessionStorage.getItem("add_prod_selectedMasterProductId") || "");
  const [selectedProductDetails, setSelectedProductDetails] = useState(() => {
    try {
      const data = sessionStorage.getItem("add_prod_selectedProductDetails");
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  });
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // Listing configuration states
  const [variants, setVariants] = useState(() => {
    try {
      const data = sessionStorage.getItem("add_prod_variants");
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  });
  const [status, setStatus] = useState(() => sessionStorage.getItem("add_prod_status") || "active");

  // Load category tree on mount
  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await sellerApi.getCategoryTree();
        if (res.data.success) {
          setDbCategories(res.data.results || res.data.result || []);
        }
      } catch (error) {
        toast.error("Failed to load categories");
      } finally {
        setIsLoadingCats(false);
      }
    };
    fetchCats();
  }, []);

  // Fetch unique brands in catalog matching categories
  useEffect(() => {
    if (isFirstRender.current) {
      // Skip resetting state on initial mount/refresh
    } else {
      setSelectedBrand("");
      setBrands([]);
      setMasterProducts([]);
      setSelectedMasterProductId("");
      setSelectedProductDetails(null);
      setVariants([]);
    }

    if (!selectedHeader) return;

    const fetchBrands = async () => {
      setIsLoadingBrands(true);
      try {
        const res = await sellerApi.getCatalogBrands({
          headerId: selectedHeader,
          categoryId: selectedCategory || undefined,
          subcategoryId: selectedSubcategory || undefined,
        });
        if (res.data.success) {
          setBrands(res.data.results || []);
        }
      } catch (err) {
        console.error("Failed to load brands", err);
      } finally {
        setIsLoadingBrands(false);
      }
    };
    fetchBrands();
  }, [selectedHeader, selectedCategory, selectedSubcategory]);

  // Fetch master products matching chosen brand and categories
  useEffect(() => {
    if (isFirstRender.current) {
      // Skip resetting state on initial mount/refresh
    } else {
      setSelectedMasterProductId("");
      setMasterProducts([]);
      setSelectedProductDetails(null);
      setVariants([]);
    }

    if (!selectedBrand) return;

    const fetchProducts = async () => {
      setIsLoadingProducts(true);
      try {
        const res = await sellerApi.getCatalogProducts({
          headerId: selectedHeader,
          categoryId: selectedCategory,
          subcategoryId: selectedSubcategory || undefined,
          brand: selectedBrand,
        });
        if (res.data.success) {
          setMasterProducts(res.data.results || []);
        }
      } catch (err) {
        console.error("Failed to load products", err);
      } finally {
        setIsLoadingProducts(false);
      }
    };
    fetchProducts();
  }, [selectedBrand, selectedHeader, selectedCategory, selectedSubcategory]);

  // Flip the first render flag and add save to storage effects
  useEffect(() => {
    isFirstRender.current = false;
  }, []);

  // Save to sessionStorage when values change
  useEffect(() => {
    if (selectedHeader) sessionStorage.setItem("add_prod_selectedHeader", selectedHeader);
    else sessionStorage.removeItem("add_prod_selectedHeader");
  }, [selectedHeader]);

  useEffect(() => {
    if (selectedCategory) sessionStorage.setItem("add_prod_selectedCategory", selectedCategory);
    else sessionStorage.removeItem("add_prod_selectedCategory");
  }, [selectedCategory]);

  useEffect(() => {
    if (selectedSubcategory) sessionStorage.setItem("add_prod_selectedSubcategory", selectedSubcategory);
    else sessionStorage.removeItem("add_prod_selectedSubcategory");
  }, [selectedSubcategory]);

  useEffect(() => {
    if (selectedBrand) sessionStorage.setItem("add_prod_selectedBrand", selectedBrand);
    else sessionStorage.removeItem("add_prod_selectedBrand");
  }, [selectedBrand]);

  useEffect(() => {
    if (selectedMasterProductId) sessionStorage.setItem("add_prod_selectedMasterProductId", selectedMasterProductId);
    else sessionStorage.removeItem("add_prod_selectedMasterProductId");
  }, [selectedMasterProductId]);

  useEffect(() => {
    if (selectedProductDetails) sessionStorage.setItem("add_prod_selectedProductDetails", JSON.stringify(selectedProductDetails));
    else sessionStorage.removeItem("add_prod_selectedProductDetails");
  }, [selectedProductDetails]);

  useEffect(() => {
    if (variants && variants.length > 0) sessionStorage.setItem("add_prod_variants", JSON.stringify(variants));
    else sessionStorage.removeItem("add_prod_variants");
  }, [variants]);

  useEffect(() => {
    sessionStorage.setItem("add_prod_status", status);
  }, [status]);

  useEffect(() => {
    if (brands && brands.length > 0) sessionStorage.setItem("add_prod_brands", JSON.stringify(brands));
    else sessionStorage.removeItem("add_prod_brands");
  }, [brands]);

  useEffect(() => {
    if (masterProducts && masterProducts.length > 0) sessionStorage.setItem("add_prod_masterProducts", JSON.stringify(masterProducts));
    else sessionStorage.removeItem("add_prod_masterProducts");
  }, [masterProducts]);

  // Auto-load and pre-populate category tree, brand, and product details when navigated with ?masterProductId=
  useEffect(() => {
    if (!preSelectedMasterProductId) return;
    const loadPreSelectedProduct = async () => {
      try {
        const res = await sellerApi.getCatalogProducts({});
        if (res.data.success && Array.isArray(res.data.results)) {
          const prod = res.data.results.find((p) => String(p._id) === String(preSelectedMasterProductId));
          if (prod) {
            const hId = prod.headerId?._id || prod.headerId || "";
            const cId = prod.categoryId?._id || prod.categoryId || "";
            const sId = prod.subcategoryId?._id || prod.subcategoryId || "";
            const brandName = prod.brand || "App";

            setSelectedHeader(hId);
            setSelectedCategory(cId);
            setSelectedSubcategory(sId);
            setSelectedBrand(brandName);
            setMasterProducts([prod]);
            setSelectedMasterProductId(prod._id);
            setSelectedProductDetails(prod);

            const initialVariants = (prod.variants || []).map((v, idx) => ({
              id: Date.now() + idx,
              name: v.name,
              unit: v.unit || prod.unit || "",
              packSize: v.packSize || "",
              price: "",
              salePrice: "",
              stock: "",
              sku: `${prod.slug}-${(v.name || "var").toLowerCase().replace(/[^a-z0-9]/g, "")}`,
            }));

            setVariants(
              initialVariants.length > 0
                ? initialVariants
                : [
                    {
                      id: Date.now(),
                      name: prod.name,
                      unit: prod.unit || "",
                      packSize: prod.packSize || "",
                      price: "",
                      salePrice: "",
                      stock: "",
                      sku: `${prod.slug}`,
                    },
                  ]
            );
          }
        }
      } catch (err) {
        console.error("Failed to load pre-selected master product", err);
      }
    };
    loadPreSelectedProduct();
  }, [preSelectedMasterProductId]);

  // Handles product selection, pre-populating variants
  const handleProductSelect = (productId) => {
    setSelectedMasterProductId(productId);
    const product = masterProducts.find((p) => p._id === productId);
    if (product) {
      setSelectedProductDetails(product);
      // Map variants from master product
      const initialVariants = (product.variants || []).map((v, idx) => ({
        id: Date.now() + idx,
        name: v.name,
        unit: v.unit || product.unit || "",
        packSize: v.packSize || "",
        price: "",
        salePrice: "",
        stock: "",
        sku: `${product.slug}-${v.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
      }));
      setVariants(
        initialVariants.length > 0
          ? initialVariants
          : [
              {
                id: Date.now(),
                name: product.name,
                unit: product.unit || "",
                packSize: product.packSize || "",
                price: "",
                salePrice: "",
                stock: "",
                sku: `${product.slug}`,
              },
            ]
      );
    } else {
      setSelectedProductDetails(null);
      setVariants([]);
    }
  };

  const handleSave = async () => {
    if (!selectedProductDetails) {
      toast.error("Please select a product from the Master Catalog");
      return;
    }

    // Validate pricing & stock parameters
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
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

    setIsSaving(true);
    try {
      // New flow: send only masterProductId + variants (price + stock)
      // All product metadata (name, images, description, brand) comes from master catalog on the backend
      const listingPayload = {
        masterProductId: selectedProductDetails._id,
        status,
        variants: variants.map((v) => ({
          name: v.name,
          price: Number(v.price),
          salePrice: Number(v.salePrice) || 0,
          stock: Number(v.stock),
          sku: v.sku,
        })),
      };

      const response = await sellerApi.createListing(listingPayload);
      const approvalStatus = response?.data?.result?.approvalStatus;

      // Clear preserved form data on successful save
      sessionStorage.removeItem("add_prod_selectedHeader");
      sessionStorage.removeItem("add_prod_selectedCategory");
      sessionStorage.removeItem("add_prod_selectedSubcategory");
      sessionStorage.removeItem("add_prod_selectedBrand");
      sessionStorage.removeItem("add_prod_selectedMasterProductId");
      sessionStorage.removeItem("add_prod_selectedProductDetails");
      sessionStorage.removeItem("add_prod_variants");
      sessionStorage.removeItem("add_prod_status");
      sessionStorage.removeItem("add_prod_brands");
      sessionStorage.removeItem("add_prod_masterProducts");

      if (approvalStatus === "pending") {
        toast.success("Product submitted for approval");
      } else {
        toast.success("Product listed successfully!");
      }
      navigate("/seller/products");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to list product");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    sessionStorage.removeItem("add_prod_selectedHeader");
    sessionStorage.removeItem("add_prod_selectedCategory");
    sessionStorage.removeItem("add_prod_selectedSubcategory");
    sessionStorage.removeItem("add_prod_selectedBrand");
    sessionStorage.removeItem("add_prod_selectedMasterProductId");
    sessionStorage.removeItem("add_prod_selectedProductDetails");
    sessionStorage.removeItem("add_prod_variants");
    sessionStorage.removeItem("add_prod_status");
    sessionStorage.removeItem("add_prod_brands");
    sessionStorage.removeItem("add_prod_masterProducts");
    navigate(-1);
  };

  const selectedHeaderData = dbCategories.find((h) => (h._id || h.id) === selectedHeader);
  const selectedCategoryData = selectedHeaderData?.children?.find(
    (c) => (c._id || c.id) === selectedCategory
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16 px-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Button
          variant="ghost"
          className="pl-0 hover:bg-transparent hover:text-emerald-600 text-slate-600 font-bold transition-all"
          onClick={handleCancel}
        >
          <HiOutlineArrowLeft className="mr-2 h-4 w-4" />
          Back to Catalog
        </Button>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button variant="outline" className="w-full sm:w-auto rounded-xl text-xs font-bold" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !selectedProductDetails}
            className="w-full sm:w-auto min-w-[150px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <HiOutlineArrowPath className="mr-2 h-4 w-4 animate-spin" />
                LISTING...
              </>
            ) : (
              "LIST PRODUCT"
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Product Picker and Price Setup */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Category Finder */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-50">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <HiOutlineFolderOpen className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Choose Category</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Select where the product fits</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5 flex flex-col">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Main Group</label>
                <select
                  value={selectedHeader}
                  onChange={(e) => {
                    setSelectedHeader(e.target.value);
                    setSelectedCategory("");
                    setSelectedSubcategory("");
                  }}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/40 transition-all text-slate-700"
                >
                  <option value="">Select Group</option>
                  {dbCategories.map((h) => (
                    <option key={h._id || h.id} value={h._id || h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 flex flex-col">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setSelectedSubcategory("");
                  }}
                  disabled={!selectedHeader}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/40 transition-all text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select Category</option>
                  {selectedHeaderData?.children?.map((c) => (
                    <option key={c._id || c.id} value={c._id || c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 flex flex-col">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Sub-Category</label>
                <select
                  value={selectedSubcategory}
                  onChange={(e) => setSelectedSubcategory(e.target.value)}
                  disabled={!selectedCategory || !selectedCategoryData?.children?.length}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/40 transition-all text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select Sub-Category</option>
                  {selectedCategoryData?.children?.map((sc) => (
                    <option key={sc._id || sc.id} value={sc._id || sc.id}>
                      {sc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Card 2: Brand & Product Selection */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-50">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <HiOutlineCube className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Select Catalog Item</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Pick brand and item from master catalog</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 flex flex-col">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Brand</label>
                <BrandSelect
                  value={selectedBrand}
                  onChange={(val) => setSelectedBrand(val)}
                  brands={brands}
                  placeholder={isLoadingBrands ? "Loading Brands..." : "Select Brand"}
                  disabled={!selectedCategory || isLoadingBrands}
                  allowNewBrand={false}
                />
              </div>

              <div className="space-y-1.5 flex flex-col">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Product Title</label>
                <select
                  value={selectedMasterProductId}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  disabled={!selectedBrand || isLoadingProducts}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/40 transition-all text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {isLoadingProducts ? "Loading Products..." : "Select Catalog Product"}
                  </option>
                  {masterProducts.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Card 3: Variants Price & Stock Configuration */}
          {selectedProductDetails && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between pb-3 border-b border-slate-50">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                    <HiOutlineSwatch className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Offer Variations</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Set your prices and stock levels</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Listing Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="bg-transparent border-none text-[10px] font-black text-slate-700 outline-none p-0 cursor-pointer focus:ring-0"
                  >
                    <option value="active">ACTIVE</option>
                    <option value="inactive">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                {variants.map((v, index) => (
                  <div
                    key={v.id}
                    className="p-5 bg-slate-50 border border-slate-100 rounded-2xl space-y-4 relative group"
                  >
                    {/* Header info */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/50">
                      <span className="text-xs font-black text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-lg">
                        {v.name} ({v.packSize || "N/A"} {v.unit || ""})
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Base SKU: {v.sku}
                      </span>
                    </div>

                    {/* Form inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                          Price (₹) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={v.price}
                          onKeyDown={(e) => {
                            if (["-", "+", "e", "E"].includes(e.key)) e.preventDefault();
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            const copy = [...variants];
                            copy[index].price = val;
                            setVariants(copy);
                          }}
                          placeholder="e.g. 199"
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/40 text-slate-800"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                          Sale Price (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={v.salePrice}
                          onKeyDown={(e) => {
                            if (["-", "+", "e", "E"].includes(e.key)) e.preventDefault();
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            const copy = [...variants];
                            copy[index].salePrice = val;
                            setVariants(copy);
                          }}
                          placeholder="e.g. 179"
                          className={`w-full px-4 py-2.5 bg-white border rounded-xl text-xs font-bold outline-none text-slate-800 transition-all ${
                            v.salePrice && Number(v.salePrice) > Number(v.price)
                              ? "border-rose-300 focus:ring-rose-500/10 focus:border-rose-500"
                              : "border-slate-200 focus:ring-emerald-500/10 focus:border-emerald-500/40"
                          }`}
                        />
                        {v.salePrice && Number(v.salePrice) > Number(v.price) && (
                          <span className="text-[10px] text-rose-500 font-bold block mt-1">
                            Sale price cannot be greater than regular price
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                          Available Stock <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={v.stock}
                          onKeyDown={(e) => {
                            if (["-", "+", "e", "E"].includes(e.key)) e.preventDefault();
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            const copy = [...variants];
                            copy[index].stock = val;
                            setVariants(copy);
                          }}
                          placeholder="e.g. 50"
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/40 text-slate-800"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Product Details Preview */}
        <div className="lg:col-span-5">
          {selectedProductDetails ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden sticky top-6 animate-in fade-in slide-in-from-right-2 duration-300">
              {/* Product Cover image */}
              <div className="aspect-[4/3] bg-slate-50 relative border-b border-slate-100 flex items-center justify-center overflow-hidden">
                {selectedProductDetails.mainImage ? (
                  <img
                    src={selectedProductDetails.mainImage}
                    alt={selectedProductDetails.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <HiOutlinePhoto className="h-16 w-16 text-slate-200" />
                )}
                <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full">
                  {selectedProductDetails.brand || "NO BRAND"}
                </div>
              </div>

              {/* Specs & Description content */}
              <div className="p-6 space-y-6">
                <div>
                  <h2 className="text-base font-black text-slate-900">{selectedProductDetails.name}</h2>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-[9px] font-mono font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
                      SKU: {selectedProductDetails.sku || "AUTO-ASSIGNED"}
                    </span>
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md uppercase tracking-wider">
                      {selectedProductDetails.headerId?.name || "Group"}
                    </span>
                    <span className="text-[9px] font-black text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md uppercase tracking-wider">
                      {selectedProductDetails.categoryId?.name || "Category"}
                    </span>
                  </div>
                </div>

                {selectedProductDetails.description && (
                  <div className="space-y-1.5">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</h4>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed">
                      {selectedProductDetails.description}
                    </p>
                  </div>
                )}

                {/* Key Features */}
                {selectedProductDetails.keyFeatures && selectedProductDetails.keyFeatures.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Key Features</h4>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {selectedProductDetails.keyFeatures.map((feat, idx) => (
                        <li key={idx} className="flex items-center gap-1.5 text-xs text-slate-600 font-bold">
                          <HiOutlineCheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Specifications */}
                {selectedProductDetails.specifications && selectedProductDetails.specifications.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Specifications</h4>
                    <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
                      {selectedProductDetails.specifications.map((spec, idx) => (
                        <div key={idx} className="flex border-b border-slate-50 last:border-0">
                          <div className="w-1/3 bg-slate-50 p-2.5 font-black text-slate-500 uppercase tracking-wider text-[9px]">{spec.name}</div>
                          <div className="w-2/3 p-2.5 font-bold text-slate-700">{spec.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gallery Images thumbnails preview */}
                {selectedProductDetails.galleryImages && selectedProductDetails.galleryImages.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-50">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gallery Preview</h4>
                    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                      {selectedProductDetails.galleryImages.map((img, idx) => (
                        <div key={idx} className="w-16 h-16 rounded-lg border border-slate-100 bg-slate-50 shrink-0 overflow-hidden">
                          <img src={img} alt={`Gallery ${idx}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 px-6 py-16 text-center flex flex-col items-center justify-center h-full min-h-[300px]">
              <div className="p-4 bg-white rounded-full border border-slate-100 text-slate-400 mb-4 shadow-sm">
                <HiOutlineSparkles className="h-8 w-8 text-slate-300" />
              </div>
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">Catalog Preview</h3>
              <p className="text-xs text-slate-400 font-medium max-w-[280px] mt-1.5 leading-relaxed">
                Select a category, brand, and catalog product on the left to preview details.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddProduct;

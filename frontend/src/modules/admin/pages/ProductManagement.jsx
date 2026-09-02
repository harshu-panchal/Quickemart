import React, { useState, useMemo, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
    HiOutlinePlus,
    HiOutlineCube,
    HiOutlineMagnifyingGlass,
    HiOutlineFunnel,
    HiOutlineTrash,
    HiOutlinePencilSquare,
    HiOutlinePhoto,
    HiOutlineArchiveBox,
    HiOutlineTag,
    HiOutlineArrowPath,
    HiOutlineXMark,
    HiOutlineChevronRight,
    HiOutlineCheckCircle,
    HiOutlineExclamationCircle,
    HiOutlineFolderOpen,
    HiOutlineSwatch,
    HiOutlineSquaresPlus,
    HiOutlineLockClosed,
    HiOutlineArrowDownTray
} from 'react-icons/hi2';
import Modal from '@shared/components/ui/Modal';
import Pagination from '@shared/components/ui/Pagination';
import BulkImportModal from '../components/BulkImportModal';
import BrandSelect from '@shared/components/BrandSelect';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const ProductManagement = () => {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]); // All categories for dropdowns
    const [availableBrands, setAvailableBrands] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [viewMode, setViewMode] = useState('catalog');

    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all'); // Added filterStatus
    const [filterApprovalStatus, setFilterApprovalStatus] = useState('all');
    const [filterStockStatus, setFilterStockStatus] = useState('all');
    const [sortBy, setSortBy] = useState('newest');
    const [moderationCounts, setModerationCounts] = useState({
        all: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        active: 0,
        lowStock: 0,
        outOfStock: 0
    });
    const [catalogCounts, setCatalogCounts] = useState({
        all: 0,
        active: 0,
        inactive: 0
    });
    const [moderatingActionId, setModeratingActionId] = useState('');

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [itemToReject, setItemToReject] = useState(null);
    const [rejectionNote, setRejectionNote] = useState('');
    const [editingItem, setEditingItem] = useState(null);
    const [modalTab, setModalTab] = useState('general');
    const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        sku: '',
        description: '',
        price: '',
        salePrice: '',
        stock: '',
        lowStockAlert: 5,
        unit: 'packet',
        header: '',
        categoryId: '',
        subcategoryId: '',
        status: 'active',
        isFeatured: false,
        tags: '',
        weight: '',
        brand: '',
        mainImage: null,
        galleryImages: [],
        galleryLabels: [],
        variants: [
            { id: Date.now(), name: 'Default', price: '', salePrice: '', stock: '', sku: '' }
        ]
    });

    const [viewingVariants, setViewingVariants] = useState(null);
    const [isVariantsViewModalOpen, setIsVariantsViewModalOpen] = useState(false);

    const fetchCategories = async () => {
        try {
            const response = await adminApi.getCategoryTree();
            if (response.data.success) {
                setCategories(response.data.results || response.data.result || []);
            }
        } catch (error) {
            console.error('Failed to fetch categories');
        }
    };

    const fetchBrands = async () => {
        try {
            const response = await adminApi.getCatalogBrands();
            if (response.data.success) {
                setAvailableBrands(response.data.results || []);
            }
        } catch (error) {
            console.error('Failed to fetch catalog brands');
        }
    };

    const fetchProducts = async (requestedPage = 1) => {
        setIsLoading(true);
        try {
            const params = { page: requestedPage, limit: pageSize };
            if (searchTerm) params.search = searchTerm;
            if (filterCategory !== 'all') params.category = filterCategory;
            if (filterStatus !== 'all') params.status = filterStatus;
            if (sortBy) params.sort = sortBy;

            if (viewMode === 'catalog') {
                const response = await adminApi.getMasterProducts(params);
                if (response.data.success) {
                    setProducts(response.data.results || response.data.result || []);
                    setTotal(response.data.total || 0);
                    setPage(response.data.page || requestedPage);
                    setCatalogCounts({
                        all: Number(response.data.counts?.all || response.data.total || 0),
                        active: Number(response.data.counts?.active || 0),
                        inactive: Number(response.data.counts?.inactive || 0)
                    });
                }
            } else {
                if (filterApprovalStatus !== 'all') params.approvalStatus = filterApprovalStatus;
                if (filterStockStatus !== 'all') params.stockStatus = filterStockStatus;

                const response = await adminApi.getProductModerationList(params);
                if (response.data.success) {
                    const payload = response.data.result || {};
                    const list = Array.isArray(payload.items) ? payload.items : (response.data.results || []);
                    setProducts(list);
                    setTotal(typeof payload.total === 'number' ? payload.total : list.length);
                    setPage(typeof payload.page === 'number' ? payload.page : requestedPage);
                    setModerationCounts({
                        all: Number(payload?.counts?.all || 0),
                        pending: Number(payload?.counts?.pending || 0),
                        approved: Number(payload?.counts?.approved || 0),
                        rejected: Number(payload?.counts?.rejected || 0),
                        active: Number(payload?.counts?.active || 0),
                        lowStock: Number(payload?.counts?.lowStock || 0),
                        outOfStock: Number(payload?.counts?.outOfStock || 0),
                    });
                }
            }
        } catch (error) {
            toast.error('Failed to fetch products');
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportExcel = async () => {
        setIsExporting(true);
        const toastId = toast.loading('Preparing Excel download...');
        try {
            const params = { page: 1, limit: 10000 };
            if (searchTerm) params.search = searchTerm;
            if (filterCategory !== 'all') params.category = filterCategory;
            if (filterStatus !== 'all') params.status = filterStatus;
            if (sortBy) params.sort = sortBy;

            let exportList = [];
            let fileName = '';
            let sheetName = '';

            if (viewMode === 'catalog') {
                const response = await adminApi.getMasterProducts(params);
                if (response.data?.success) {
                    exportList = response.data.results || response.data.result || [];
                }
                fileName = `Master_Catalog_Products_${new Date().toISOString().split('T')[0]}.xlsx`;
                sheetName = 'Master Catalog';
            } else {
                if (filterApprovalStatus !== 'all') params.approvalStatus = filterApprovalStatus;
                if (filterStockStatus !== 'all') params.stockStatus = filterStockStatus;

                const response = await adminApi.getProductModerationList(params);
                if (response.data?.success) {
                    const payload = response.data.result || {};
                    exportList = Array.isArray(payload.items) ? payload.items : (response.data.results || []);
                }
                fileName = `Seller_Listings_Products_${new Date().toISOString().split('T')[0]}.xlsx`;
                sheetName = 'Seller Listings';
            }

            if (!exportList || exportList.length === 0) {
                toast.dismiss(toastId);
                toast.error('No products available to export');
                setIsExporting(false);
                return;
            }

            const excelRows = exportList.map((item) => {
                let variantString = '';
                if (Array.isArray(item.variants) && item.variants.length > 0) {
                    variantString = item.variants
                        .map((v) => (typeof v === 'string' ? v : (v.name || v.unit || v.packSize || '').trim()))
                        .filter(Boolean)
                        .join(', ');
                }
                if (!variantString) {
                    variantString = item.unit || item.packSize || 'Default';
                }

                if (viewMode === 'catalog') {
                    return {
                        'Brand': item.brand || 'N/A',
                        'Product Name': item.name || '',
                        'Variant': variantString,
                        'Category': item.categoryId?.name || item.headerId?.name || 'N/A',
                        'Subcategory': item.subcategoryId?.name || 'N/A',
                        'Status': item.status ? String(item.status).toUpperCase() : 'N/A'
                    };
                } else {
                    return {
                        'Brand': item.brand || item.sellerId?.shopName || 'N/A',
                        'Product Name': item.name || '',
                        'Variant': variantString,
                        'Seller': item.sellerId?.shopName || item.sellerId?.name || 'Admin',
                        'Category': item.categoryId?.name || item.headerId?.name || 'N/A',
                        'Subcategory': item.subcategoryId?.name || 'N/A',
                        'Status': item.approvalStatus ? String(item.approvalStatus).toUpperCase() : 'N/A'
                    };
                }
            });

            const worksheet = XLSX.utils.json_to_sheet(excelRows);
            const columnWidths = Object.keys(excelRows[0] || {}).map((key) => {
                const maxLen = Math.max(
                    key.length,
                    ...excelRows.map((row) => String(row[key] || '').length)
                );
                return { wch: Math.min(Math.max(maxLen + 4, 12), 60) };
            });
            worksheet['!cols'] = columnWidths;

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
            XLSX.writeFile(workbook, fileName);

            toast.dismiss(toastId);
            toast.success(`Exported ${excelRows.length} products to Excel successfully!`);
        } catch (error) {
            console.error('Excel Export Error:', error);
            toast.dismiss(toastId);
            toast.error('Failed to export products to Excel');
        } finally {
            setIsExporting(false);
        }
    };

    useEffect(() => {
        fetchCategories();
        fetchBrands();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchProducts(1);
        }, 500); // Debounce search
        return () => clearTimeout(timer);
    }, [searchTerm, filterCategory, filterStatus, filterApprovalStatus, filterStockStatus, sortBy, pageSize, viewMode]);

    const handleSave = async () => {
        // Meaningful field validation toasts
        if (!formData.name || !String(formData.name).trim()) {
            return toast.error('Product Title is required');
        }
        if (!formData.header) {
            return toast.error('Main Group (Header Category) is required');
        }

        setIsSaving(true);
        try {
            const data = new FormData();
            data.append('name', formData.name.trim());
            data.append('slug', formData.slug);
            data.append('description', formData.description || '');
            data.append('headerId', formData.header);
            // Fallback to Header Category if specific category does not exist / is not selected
            data.append('categoryId', formData.categoryId || formData.header);
            if (formData.subcategoryId) {
                data.append('subcategoryId', formData.subcategoryId);
            }
            data.append('status', formData.status || 'draft');
            data.append('brand', formData.brand || '');
            data.append('unit', formData.unit || '');
            data.append('packSize', formData.weight || formData.packSize || '');
            data.append('tags', formData.tags || '');
            data.append('gstTax', formData.gstTax !== undefined ? formData.gstTax : 0);
            data.append('variants', JSON.stringify(formData.variants || []));

            // Support image preservation/deletion
            const existingGallery = (formData.galleryImages || []).filter(img => typeof img === 'string' && img.startsWith('http'));
            data.append('existingGalleryImages', JSON.stringify(existingGallery));

            if (formData.mainImage && typeof formData.mainImage === 'string' && formData.mainImage.startsWith('http')) {
                data.append('mainImageUrl', formData.mainImage);
            }

            if (formData.mainImageFile) {
                data.append('mainImage', formData.mainImageFile);
            }
            if (formData.galleryFiles && formData.galleryFiles.length > 0) {
                formData.galleryFiles.forEach((file) => data.append('galleryImages', file));
            }

            data.append('sku', formData.sku);
            if (formData.galleryLabels && formData.galleryLabels.length > 0) {
                data.append('galleryLabels', JSON.stringify(formData.galleryLabels));
            }

            // If creating a new product OR in catalog view mode, create/update Master Product
            if (!editingItem || viewMode === 'catalog') {
                if (editingItem) {
                    await adminApi.updateMasterProduct(editingItem._id, data);
                    toast.success('Master product updated successfully');
                } else {
                    await adminApi.createMasterProduct(data);
                    toast.success('Master product created successfully');
                    setViewMode('catalog'); // Switch view mode to Catalog so new product is immediately visible
                }
            } else {
                // Editing an existing seller product in moderation mode
                await adminApi.updateProduct(editingItem._id, data);
                toast.success('Product updated successfully');
            }

            setIsProductModalOpen(false);
            fetchProducts(page);
            fetchBrands();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save product');
        } finally {
            setIsSaving(false);
        }
    };

    const confirmDelete = async () => {
        try {
            if (viewMode === 'catalog') {
                await adminApi.deleteMasterProduct(itemToDelete._id);
                toast.success('Master product deleted');
            } else {
                await adminApi.deleteProduct(itemToDelete._id);
                toast.success('Product deleted');
            }
            setIsDeleteModalOpen(false);
            fetchProducts(page);
        } catch (error) {
            toast.error('Failed to delete product');
        }
    };

    const submitModerationAction = async (product, action, approvalNote = '') => {
        if (!product?._id) return;

        const actionKey = `${action}:${product._id}`;
        setModeratingActionId(actionKey);
        try {
            if (action === 'approve') {
                const res = await adminApi.approveProductModeration(product._id, { approvalNote });
                toast.success(res?.data?.message || 'Product approved successfully');
            } else {
                const res = await adminApi.rejectProductModeration(product._id, { approvalNote });
                toast.success(res?.data?.message || 'Product rejected successfully');
            }
            fetchProducts(page);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update product approval status');
        } finally {
            setModeratingActionId('');
        }
    };

    const handleModerationAction = async (product, action) => {
        if (!product?._id) return;

        if (action === 'reject') {
            setItemToReject(product);
            setRejectionNote(product.approvalNote || '');
            setIsRejectModalOpen(true);
            return;
        }

        submitModerationAction(product, action);
    };

    const confirmReject = async () => {
        const note = rejectionNote.trim();
        if (!note) {
            toast.error('Please enter a rejection reason');
            return;
        }

        await submitModerationAction(itemToReject, 'reject', note);
        setIsRejectModalOpen(false);
        setItemToReject(null);
        setRejectionNote('');
    };

    const IMAGE_LABEL_OPTIONS = ["Front", "Back", "Product details image", "Left side", "Right side"];

    const handleSlotLabelChange = (slotIdx, value) => {
        const nextLabels = [...(formData.galleryLabels || ["", "", "", "", ""])];
        while (nextLabels.length < 5) nextLabels.push("");
        nextLabels[slotIdx] = value;
        setFormData({ ...formData, galleryLabels: nextLabels });
    };

    const handleMainImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            setFormData(prev => ({
                ...prev,
                mainImage: reader.result,
                mainImageFile: file,
            }));
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveMainImage = (e) => {
        if (e) e.stopPropagation();
        setFormData(prev => ({
            ...prev,
            mainImage: null,
            mainImageFile: null,
        }));
    };

    const handleSlotImageUpload = (slotIdx, e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const nextImages = [...(formData.galleryImages || ["", "", "", "", ""])];
            const nextFiles = [...(formData.galleryFiles || [null, null, null, null, null])];
            while (nextImages.length < 5) nextImages.push("");
            while (nextFiles.length < 5) nextFiles.push(null);

            nextImages[slotIdx] = reader.result;
            nextFiles[slotIdx] = file;

            let mainImage = formData.mainImage;
            let mainImageFile = formData.mainImageFile;
            if (!mainImage || slotIdx === 0) {
                mainImage = reader.result;
                mainImageFile = file;
            }

            setFormData({
                ...formData,
                mainImage,
                mainImageFile,
                galleryImages: nextImages,
                galleryFiles: nextFiles
            });
        };
        reader.readAsDataURL(file);
    };

    const handleSlotRemoveImage = (slotIdx) => {
        const nextImages = [...(formData.galleryImages || ["", "", "", "", ""])];
        const nextFiles = [...(formData.galleryFiles || [null, null, null, null, null])];
        const nextLabels = [...(formData.galleryLabels || ["", "", "", "", ""])];

        nextImages[slotIdx] = "";
        nextFiles[slotIdx] = null;
        nextLabels[slotIdx] = "";

        setFormData({
            ...formData,
            galleryImages: nextImages,
            galleryFiles: nextFiles,
            galleryLabels: nextLabels
        });
    };

    const extractIdString = (val) => {
        if (!val) return "";
        if (typeof val === "string") return val;
        if (val._id) return String(val._id);
        if (val.id) return String(val.id);
        return String(val);
    };

    const findCategoryChain = (rawHeaderId, rawCategoryId, rawSubcategoryId, categoryTree) => {
        let headerId = "";
        let categoryId = "";
        let subcategoryId = "";

        const strH = extractIdString(rawHeaderId);
        const strC = extractIdString(rawCategoryId);
        const strS = extractIdString(rawSubcategoryId);

        if (!categoryTree || !categoryTree.length) {
            return { headerId: strH, categoryId: strC, subcategoryId: strS };
        }

        const searchIds = [strS, strC, strH].filter(Boolean);

        for (const targetId of searchIds) {
            for (const h of categoryTree) {
                const hId = extractIdString(h._id || h.id);

                if (hId === targetId) {
                    if (!headerId) headerId = hId;
                }

                if (h.children && Array.isArray(h.children)) {
                    for (const c of h.children) {
                        const cId = extractIdString(c._id || c.id);

                        if (cId === targetId) {
                            headerId = hId;
                            if (!categoryId) categoryId = cId;
                        }

                        if (c.children && Array.isArray(c.children)) {
                            for (const sc of c.children) {
                                const scId = extractIdString(sc._id || sc.id);

                                if (scId === targetId) {
                                    headerId = hId;
                                    categoryId = cId;
                                    subcategoryId = scId;
                                    return { headerId, categoryId, subcategoryId };
                                }
                            }
                        }
                    }
                }
            }
        }

        if (!headerId && strH) headerId = strH;
        if (!categoryId && strC) categoryId = strC;

        return { headerId, categoryId, subcategoryId };
    };

    useEffect(() => {
        if (editingItem && categories && categories.length > 0) {
            const chain = findCategoryChain(
                editingItem.headerId,
                editingItem.categoryId,
                editingItem.subcategoryId,
                categories
            );
            setFormData(prev => ({
                ...prev,
                header: String(chain.headerId || prev.header || ""),
                categoryId: String(chain.categoryId || prev.categoryId || ""),
                subcategoryId: String(chain.subcategoryId || prev.subcategoryId || ""),
            }));
        }
    }, [categories, editingItem]);

    const determineProductGST = (name = "", catName = "", subCatName = "") => {
        const text = `${name} ${catName} ${subCatName}`.toLowerCase();
        if (/coca[\s-]*cola|pepsi|sprite|thums[\s-]*up|mountain[\s-]*dew|fanta|7up|seven[\s-]*up|carbonated|aerated|energy[\s-]*drink|red[\s-]*bull|monster[\s-]*energy|deodorant|perfume|cologne|body[\s-]*spray/.test(text)) return 28;
        if (/fresh[\s-]*fruit|fresh[\s-]*veg|apple|banana|mango|orange|grape|papaya|guava|potato|tomato|onion|spinach|cucumber|carrot|brinjal|cauliflower|cabbage|fresh[\s-]*milk|fresh[\s-]*curd|lassi|buttermilk|fresh[\s-]*poultry|fresh[\s-]*meat|fresh[\s-]*fish|egg|unbranded[\s-]*rice|unbranded[\s-]*atta|common[\s-]*salt/.test(text)) return 0;
        if (/rice|atta|flour|wheat|dal|pulses|besan|suji|maida|oats|poha|edible[\s-]*oil|mustard[\s-]*oil|sunflower[\s-]*oil|groundnut[\s-]*oil|olive[\s-]*oil|ghee|tea|chai|coffee|sugar|salt|turmeric|chilli|coriander|cumin|jeera|garam[\s-]*masala|spice|masala|almond|cashew|raisin|walnut|pistachio|dates|dry[\s-]*fruit|rusk|biscuit|frozen[\s-]*peas|frozen[\s-]*veg|milk/.test(text)) return 5;
        if (/juice|real|tropicana|jam|jelly|ketchup|sauce|pickle|pickle|cheese|butter|condensed[\s-]*milk|ayurvedic|chyawanprash|cough[\s-]*syrup|stationery|notebook|pen|pencil|paper|namkeen|bhujia|ready[\s-]*to[\s-]*eat/.test(text)) return 12;
        if (/soap|shampoo|conditioner|hair[\s-]*oil|face[\s-]*wash|lotion|cream|toothpaste|brush|detergent|surf|washing[\s-]*powder|dishwash|vim|harpic|cleaner|sanitary|pad|diaper|chocolate|dairy[\s-]*milk|kitkat|snickers|wafer|cake|chewing[\s-]*gum|electronic|headphone|earphone|charger|cable|battery|mobile|t[\s-]*shirt|shirt|pant|shoe|cloth/.test(text)) return 18;
        return 5;
    };

    const openModal = (item = null) => {
        if (item) {
            const autoSku = item.sku || `QM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            const existingImages = [];
            if (item.mainImage) existingImages.push(item.mainImage);
            if (Array.isArray(item.galleryImages)) {
                item.galleryImages.forEach(img => {
                    if (img && !existingImages.includes(img)) existingImages.push(img);
                });
            }
            const existingLabels = item.galleryLabels || [];
            while (existingImages.length < 5) existingImages.push("");
            while (existingLabels.length < 5) existingLabels.push("");

            const chain = findCategoryChain(item.headerId, item.categoryId, item.subcategoryId, categories);
            const initialGst = (item.gstTax !== undefined && item.gstTax !== null && Number(item.gstTax) > 0)
                ? Number(item.gstTax)
                : determineProductGST(item.name || '', item.categoryId?.name || '', item.subcategoryId?.name || '');

            setFormData({
                name: item.name || '',
                slug: item.slug || '',
                sku: autoSku,
                description: item.description || '',
                price: item.price || '',
                salePrice: item.salePrice || item.discountPrice || '',
                stock: item.stock || '',
                lowStockAlert: item.lowStockAlert || 5,
                unit: item.unit || 'packet',
                gstTax: initialGst,
                header: String(chain.headerId || ""),
                categoryId: String(chain.categoryId || ""),
                subcategoryId: String(chain.subcategoryId || ""),
                status: item.status || 'active',
                isFeatured: item.isFeatured || false,
                tags: Array.isArray(item.tags) ? item.tags.join(', ') : item.tags || '',
                weight: item.weight || '',
                brand: item.brand || '',
                mainImage: item.mainImage || null,
                galleryImages: existingImages.slice(0, 5),
                galleryLabels: existingLabels.slice(0, 5),
                galleryFiles: [null, null, null, null, null],
                variants: (item.variants && item.variants.length > 0) ? item.variants.map((v, vIdx) => ({
                    ...v,
                    id: v._id || Date.now() + vIdx,
                    sku: v.sku || `${autoSku}-V${vIdx + 1}`
                })) : [
                    {
                        id: Date.now(),
                        name: 'Default',
                        unit: '',
                        packSize: '',
                        sku: `${autoSku}-V1`
                    }
                ]
            });
            setEditingItem(item);
        } else {
            const autoSku = `QM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            setFormData({
                name: '', slug: '', sku: autoSku, description: '', price: '',
                salePrice: '', stock: '', lowStockAlert: 5, unit: 'packet', gstTax: 0,
                header: '', categoryId: '', subcategoryId: '', status: 'active',
                isFeatured: false, tags: '', weight: '', brand: '',
                mainImage: null,
                galleryImages: ["", "", "", "", ""],
                galleryLabels: ["", "", "", "", ""],
                galleryFiles: [null, null, null, null, null],
                variants: [
                    { id: Date.now(), name: 'Default', unit: '', packSize: '', sku: `${autoSku}-V1` }
                ]
            });
            setEditingItem(null);
        }
        setModalTab('general');
        setIsProductModalOpen(true);
    };

    const productsList = Array.isArray(products) ? products : [];
    const getEffectiveStock = (p) => {
        if (p.variants && p.variants.length > 0) {
            return p.variants.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);
        }
        return Number(p.stock) || 0;
    };

    const stats = useMemo(() => {
        if (viewMode === 'catalog') {
            return {
                total: catalogCounts.all,
                active: catalogCounts.active,
                draft: catalogCounts.inactive,
                lowStock: 0,
                outOfStock: 0
            };
        }
        return {
            total: moderationCounts.all || total,
            lowStock: moderationCounts.lowStock || 0,
            outOfStock: moderationCounts.outOfStock || 0,
            active: moderationCounts.active || 0
        };
    }, [viewMode, catalogCounts, moderationCounts, total]);

    const StatusBadge = ({ status, stock }) => {
        if (stock === 0) return <Badge variant="error" className="text-[10px] px-1.5 py-0">Out of Stock</Badge>;
        if (stock <= 10) return <Badge variant="warning" className="text-[10px] px-1.5 py-0">Low Stock</Badge>;
        if (status === 'active') return <Badge variant="success" className="text-[10px] px-1.5 py-0">Active</Badge>;
        return <Badge variant="gray" className="text-[10px] px-1.5 py-0">Draft</Badge>;
    };

    const ApprovalBadge = ({ approvalStatus }) => {
        const normalized = String(approvalStatus || 'approved').toLowerCase();
        if (normalized === 'pending') {
            return <Badge variant="warning" className="text-[10px] px-1.5 py-0">Pending</Badge>;
        }
        if (normalized === 'rejected') {
            return <Badge variant="error" className="text-[10px] px-1.5 py-0">Rejected</Badge>;
        }
        return <Badge variant="success" className="text-[10px] px-1.5 py-0">Approved</Badge>;
    };

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-2 duration-700 pb-16">
            {/* Page Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 className="ds-h1 flex items-center gap-2">
                        Product List
                        <Badge variant="primary" className="text-[9px] px-1.5 py-0 font-bold tracking-wider uppercase">Live</Badge>
                    </h1>
                    <p className="ds-description mt-0.5">Track your items, prices, and how many are left in stock.</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {/* View Mode Toggle */}
                    <div className="flex bg-slate-100 p-1 rounded-xl ring-1 ring-slate-200 shadow-inner">
                        <button
                            onClick={() => {
                                setViewMode('moderation');
                                setFilterApprovalStatus('all');
                                setFilterStatus('all');
                                setFilterStockStatus('all');
                            }}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                viewMode === 'moderation' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                            )}
                        >
                            SELLER LISTINGS
                        </button>
                        <button
                            onClick={() => {
                                setViewMode('catalog');
                                setFilterApprovalStatus('all');
                                setFilterStatus('all');
                                setFilterStockStatus('all');
                            }}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                viewMode === 'catalog' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                            )}
                        >
                            MASTER CATALOG
                        </button>
                    </div>

                    <button
                        onClick={() => setIsBulkImportModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        <HiOutlineSquaresPlus className="h-4 w-4" />
                        BULK LISTING
                    </button>
                    <button
                        onClick={handleExportExcel}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors shadow-sm disabled:opacity-50"
                    >
                        {isExporting ? (
                            <HiOutlineArrowPath className="h-4 w-4 animate-spin text-emerald-600" />
                        ) : (
                            <HiOutlineArrowDownTray className="h-4 w-4 text-emerald-600" />
                        )}
                        DOWNLOAD EXCEL
                    </button>
                    <button
                        onClick={() => openModal()}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-md shadow-brand-200"
                    >
                        <HiOutlinePlus className="h-4 w-4" />
                        ADD PRODUCT
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className={cn("grid gap-4", viewMode === 'catalog' ? "grid-cols-1 md:grid-cols-3" : "grid-cols-2 lg:grid-cols-4")}>
                {(viewMode === 'catalog' ? [
                    { id: 'all', label: 'All Items', val: stats.total, icon: HiOutlineCube, color: 'text-brand-600', bg: 'bg-brand-50' },
                    { id: 'active', label: 'Active Items', val: stats.active, icon: HiOutlineCheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { id: 'draft', label: 'Draft Items', val: stats.draft, icon: HiOutlineExclamationCircle, color: 'text-amber-600', bg: 'bg-amber-50' }
                ] : [
                    { id: 'all', label: 'All Items', val: stats.total, icon: HiOutlineCube, color: 'text-brand-600', bg: 'bg-brand-50' },
                    { id: 'active', label: 'Active Items', val: stats.active, icon: HiOutlineCheckCircle, color: 'text-brand-600', bg: 'bg-brand-50' },
                    { id: 'low', label: 'Low Stock', val: stats.lowStock, icon: HiOutlineExclamationCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { id: 'out', label: 'Out of Stock', val: stats.outOfStock, icon: HiOutlineArchiveBox, color: 'text-rose-600', bg: 'bg-rose-50' }
                ]).map((stat, i) => (
                    <Card
                        key={i}
                        className={cn(
                            "border-none shadow-sm ring-1 p-4 relative overflow-hidden group cursor-pointer transition-all",
                            viewMode === 'catalog'
                                ? (
                                    (stat.id === 'active' && filterStatus === 'active') ||
                                        (stat.id === 'draft' && filterStatus === 'inactive') ||
                                        (stat.id === 'all' && filterStatus === 'all')
                                        ? "ring-2 ring-primary/50 shadow-md bg-slate-50"
                                        : "ring-slate-100 hover:bg-slate-50/30"
                                )
                                : (
                                    (stat.id === 'low' || stat.id === 'out') && filterStockStatus === stat.id
                                        ? "ring-2 ring-primary/50 shadow-md bg-slate-50"
                                        : "ring-slate-100"
                                )
                        )}
                        onClick={() => {
                            if (viewMode === 'catalog') {
                                if (stat.id === 'all') {
                                    setFilterStatus('all');
                                } else if (stat.id === 'active') {
                                    setFilterStatus(prev => prev === 'active' ? 'all' : 'active');
                                } else if (stat.id === 'draft') {
                                    setFilterStatus(prev => prev === 'inactive' ? 'all' : 'inactive');
                                }
                            } else {
                                if (stat.id === 'low' || stat.id === 'out') {
                                    setFilterStockStatus(prev => prev === stat.id ? 'all' : stat.id);
                                }
                            }
                        }}
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

            {viewMode !== 'catalog' && (
                <Card className="border-none shadow-sm ring-1 ring-slate-100 p-3 bg-white/60 backdrop-blur-xl">
                    <div className="flex flex-wrap gap-2">
                        {[
                            { key: 'all', label: 'All', count: moderationCounts.all },
                            { key: 'approved', label: 'Approved', count: moderationCounts.approved },
                            { key: 'pending', label: 'Pending Approval', count: moderationCounts.pending },
                            { key: 'rejected', label: 'Rejected', count: moderationCounts.rejected },
                        ].map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => setFilterApprovalStatus(item.key)}
                                className={cn(
                                    "rounded-xl px-4 py-2 text-xs font-bold transition-all",
                                    filterApprovalStatus === item.key
                                        ? "bg-slate-900 text-white"
                                        : "bg-white ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50"
                                )}
                            >
                                {item.label} ({item.count})
                            </button>
                        ))}
                    </div>
                </Card>
            )}

            {/* Toolbox */}
            <Card className="border-none shadow-sm ring-1 ring-slate-100 p-3 bg-white/60 backdrop-blur-xl">
                <div className="flex flex-col lg:flex-row gap-3 items-center">
                    <div className="relative flex-1 group w-full">
                        <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-all" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search by name, SKU or slug..."
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-100/50 border-none rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/5 transition-all outline-none"
                        />
                    </div>
                    <div className="flex gap-2 shrink-0 w-full lg:w-auto">
                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="flex-1 lg:flex-none px-4 py-2.5 bg-white ring-1 ring-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-primary/5 outline-none appearance-none cursor-pointer"
                        >
                            <option value="all">All Categories</option>
                            {categories.map(h => (
                                <optgroup key={h._id} label={h.name}>
                                    <option value={h._id}>All {h.name}</option>
                                    {(h.children || []).map(c => (
                                        <option key={c._id} value={c._id}>{c.name}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        <button
                            onClick={() => {
                                const nextStatus = filterStatus === 'all' ? 'active' : filterStatus === 'active' ? 'inactive' : 'all';
                                setFilterStatus(nextStatus);
                            }}
                            className={cn(
                                "flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                                filterStatus === 'active' ? "bg-emerald-500 text-white shadow-md shadow-emerald-100" :
                                    filterStatus === 'inactive' ? "bg-amber-500 text-white shadow-md shadow-amber-100" :
                                        "bg-white ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50"
                            )}
                        >
                            <HiOutlineFunnel className="h-4 w-4" />
                            <span>
                                {filterStatus === 'active' ? 'ONLY LIVE' :
                                    filterStatus === 'inactive' ? 'ONLY DRAFT' :
                                        'SHOW ALL'}
                            </span>
                        </button>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="flex-1 lg:flex-none px-4 py-2.5 bg-white ring-1 ring-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-primary/5 outline-none appearance-none cursor-pointer"
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

            {/* Product Table */}
            <Card className="border-none shadow-xl ring-1 ring-slate-100 overflow-hidden rounded-xl">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1180px] table-fixed text-left border-collapse">
                        <colgroup>
                            <col className="w-[24%]" />
                            <col className="w-[13%]" />
                            <col className="w-[11%]" />
                            <col className="w-[12%]" />
                            <col className="w-[14%]" />
                            <col className="w-[11%]" />
                            <col className="w-[15%]" />
                        </colgroup>
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-6 py-3 text-left text-[10px] font-medium text-slate-500 uppercase tracking-[0.18em]">Product</th>
                                {viewMode !== 'catalog' ? (
                                    <th className="px-6 py-3 text-left text-[10px] font-medium text-slate-500 uppercase tracking-[0.18em]">Seller</th>
                                ) : (
                                    <th className="px-6 py-3 text-left text-[10px] font-medium text-slate-500 uppercase tracking-[0.18em]">Brand</th>
                                )}
                                <th className="px-6 py-3 text-left text-[10px] font-medium text-slate-500 uppercase tracking-[0.18em]">Variant</th>
                                <th className="px-6 py-3 text-left text-[10px] font-medium text-slate-500 uppercase tracking-[0.18em]">Category</th>
                                <th className="px-6 py-3 text-left text-[10px] font-medium text-slate-500 uppercase tracking-[0.18em]">Subcategory</th>
                                <th className="px-4 py-3 text-center text-[10px] font-medium text-slate-500 uppercase tracking-[0.18em] whitespace-nowrap">Status</th>
                                <th className="px-4 py-3 text-center text-[10px] font-medium text-slate-500 uppercase tracking-[0.18em] whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <HiOutlineArrowPath className="h-8 w-8 text-primary animate-spin" />
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading Products...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : productsList.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-20 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">No products found</td>
                                </tr>
                            ) : productsList.map((p) => (
                                <tr
                                    key={p._id}
                                    className={cn(
                                        "group transition-colors hover:bg-slate-50/60",
                                        viewMode !== 'catalog' && String(p.approvalStatus || '').toLowerCase() === 'pending' && "bg-amber-50/40"
                                    )}
                                >
                                    {/* Product Column */}
                                    <td className="px-6 py-5 align-middle">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="h-11 w-11 shrink-0 rounded-xl overflow-hidden bg-slate-100 ring-1 ring-slate-200 shadow-sm">
                                                <img src={p.mainImage || p.images?.[0]} alt={p.name} className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-[13px] font-semibold leading-5 text-slate-900" title={p.name}>{p.name}</p>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span className="truncate text-[10px] font-medium uppercase tracking-widest text-slate-400" title={p.unit}>{p.unit}</span>
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                        GST {(p.gstTax !== undefined && p.gstTax !== null && Number(p.gstTax) > 0) ? Number(p.gstTax) : determineProductGST(p.name || '', p.categoryId?.name || '', p.subcategoryId?.name || '')}%
                                                    </span>
                                                </div>
                                                {viewMode !== 'catalog' && p.approvalStatus === 'rejected' && p.approvalNote ? (
                                                    <p className="truncate text-[10px] font-medium text-rose-500" title={p.approvalNote}>
                                                        Note: {p.approvalNote}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>
                                    </td>

                                    {/* Seller or Brand Column */}
                                    <td className="px-6 py-5 align-middle">
                                        {viewMode !== 'catalog' ? (
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]" />
                                                <span className="truncate text-[13px] font-medium text-slate-700" title={p.sellerId?.shopName || 'Admin'}>
                                                    {p.sellerId?.shopName || 'Admin'}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-[13px] font-semibold text-slate-700">
                                                {p.brand || 'N/A'}
                                            </span>
                                        )}
                                    </td>

                                    {/* Variant Column */}
                                    <td
                                        className="px-6 py-5 cursor-pointer align-middle transition-colors group/variant hover:bg-purple-50/60"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setViewingVariants(p);
                                            setIsVariantsViewModalOpen(true);
                                        }}
                                    >
                                        {p.variants && p.variants.length > 0 ? (
                                            <div className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-1 text-purple-700 ring-1 ring-purple-100 transition-transform group-hover/variant:-translate-y-0.5">
                                                <HiOutlineSwatch className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                                                <span className="text-[12px] font-medium whitespace-nowrap">
                                                    {p.variants.length} Variant{p.variants.length > 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-[12px] font-medium text-slate-400">No variants</span>
                                        )}
                                    </td>

                                    {/* Category Column */}
                                    <td className="px-6 py-5 align-middle">
                                        <span
                                            className="inline-block max-w-full rounded-full bg-slate-100 px-3 py-1 text-[12px] font-medium text-slate-700 ring-1 ring-slate-200 truncate"
                                            title={p.categoryId?.name || 'N/A'}
                                        >
                                            {p.categoryId?.name || 'N/A'}
                                        </span>
                                    </td>

                                    {/* Subcategory Column */}
                                    <td className="px-6 py-5 align-middle">
                                        <span
                                            className="inline-block max-w-full rounded-full bg-slate-50 px-3 py-1 text-[12px] font-medium text-slate-600 ring-1 ring-slate-100 truncate"
                                            title={p.subcategoryId?.name || 'N/A'}
                                        >
                                            {p.subcategoryId?.name || 'N/A'}
                                        </span>
                                    </td>


                                    {/* Status Column */}
                                    <td className="px-4 py-5 text-center align-middle whitespace-nowrap">
                                        <div className="flex flex-col items-center gap-1">
                                            {viewMode === 'catalog' ? (
                                                <Badge variant={p.status === 'active' ? 'success' : 'gray'} className="text-[10px] px-1.5 py-0 font-bold uppercase tracking-wider">
                                                    {p.status === 'active' ? 'ACTIVE' : 'DRAFT'}
                                                </Badge>
                                            ) : (
                                                <>
                                                    <StatusBadge status={p.status} stock={getEffectiveStock(p)} />
                                                    <ApprovalBadge approvalStatus={p.approvalStatus} />
                                                </>
                                            )}
                                        </div>
                                    </td>

                                    {/* Actions Column */}
                                    <td className="px-4 py-5 text-center align-middle">
                                        <div className="flex items-center justify-center gap-2">
                                            {viewMode !== 'catalog' && (
                                                <>
                                                    {String(p.approvalStatus || '').toLowerCase() !== 'approved' && (
                                                        <button
                                                            onClick={() => handleModerationAction(p, 'approve')}
                                                            disabled={moderatingActionId === `approve:${p._id}`}
                                                            className="flex h-9 w-9 shrink-0 items-center justify-center hover:bg-emerald-50 hover:text-emerald-600 rounded-xl transition-all text-slate-400 shadow-sm ring-1 ring-slate-100 disabled:opacity-60"
                                                            title="Approve product"
                                                        >
                                                            <HiOutlineCheckCircle className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                    {String(p.approvalStatus || '').toLowerCase() !== 'rejected' && (
                                                        <button
                                                            onClick={() => handleModerationAction(p, 'reject')}
                                                            disabled={moderatingActionId === `reject:${p._id}`}
                                                            className="flex h-9 w-9 shrink-0 items-center justify-center hover:bg-amber-50 hover:text-amber-600 rounded-xl transition-all text-slate-400 shadow-sm ring-1 ring-slate-100 disabled:opacity-60"
                                                            title="Reject product"
                                                        >
                                                            <HiOutlineXMark className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                            <button
                                                onClick={() => openModal(p)}
                                                className="flex h-9 w-9 shrink-0 items-center justify-center hover:bg-white hover:text-primary rounded-xl transition-all text-slate-400 shadow-sm ring-1 ring-slate-100"
                                            >
                                                <HiOutlinePencilSquare className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => (setItemToDelete(p), setIsDeleteModalOpen(true))}
                                                className="flex h-9 w-9 shrink-0 items-center justify-center hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all text-slate-400 shadow-sm ring-1 ring-slate-100"
                                            >
                                                <HiOutlineTrash className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="px-6 py-3 border-t border-slate-100">
                    <Pagination
                        page={page}
                        totalPages={Math.ceil(total / pageSize) || 1}
                        total={total}
                        pageSize={pageSize}
                        onPageChange={(p) => fetchProducts(p)}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setPage(1);
                        }}
                        loading={isLoading}
                    />
                </div>
            </Card>

            {/* Super Detailed Modal */}
            <AnimatePresence>
                {isProductModalOpen && (
                    <div
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-12 overflow-hidden overscroll-contain touch-pan-y"
                        onWheelCapture={(e) => e.stopPropagation()}
                    >
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
                            className="w-full max-w-5xl relative z-10 bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
                        >
                            {/* Modal Header */}
                            <div className="flex items-center justify-between p-6 border-b border-slate-100">
                                <div className="flex items-center space-x-3">
                                    <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
                                        <HiOutlineCube className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="admin-h3">
                                            Edit Product
                                        </h3>
                                        <div className="flex items-center space-x-2 mt-0.5">
                                            <Badge variant="primary" className="text-[7px] font-bold uppercase tracking-widest px-1">SYSTEM</Badge>
                                            <HiOutlineChevronRight className="h-2.5 w-2.5 text-slate-300" />
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{formData.sku || 'PENDING SKU'}</span>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setIsProductModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                                    <HiOutlineXMark className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="flex flex-col lg:flex-row flex-1 min-h-0 min-h-[400px] max-h-[calc(100vh-200px)] overflow-hidden">
                                {/* Modal Sidebar Tabs */}
                                <div className="lg:w-1/4 bg-slate-50/50 border-r border-slate-100 p-4 space-y-1 overflow-y-auto overscroll-contain scrollbar-hide min-h-0">
                                    {[
                                        { id: 'general', label: 'General Info', icon: HiOutlineTag },
                                        { id: 'variants', label: 'Item Variants', icon: HiOutlineSwatch },
                                        { id: 'category', label: 'Groups', icon: HiOutlineFolderOpen },
                                        { id: 'media', label: 'Photos', icon: HiOutlinePhoto }
                                    ].map((tab) => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setModalTab(tab.id)}
                                            className={cn(
                                                "w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs font-bold transition-all",
                                                modalTab === tab.id
                                                    ? "bg-white text-primary shadow-sm ring-1 ring-slate-100"
                                                    : "text-slate-500 hover:bg-slate-100"
                                            )}
                                        >
                                            <tab.icon className="h-4 w-4" />
                                            <span>{tab.label}</span>
                                        </button>
                                    ))}

                                    <div className="pt-8 px-4">
                                        <div className="p-4 bg-brand-50 rounded-2xl border border-brand-100">
                                            <p className="text-[9px] font-bold text-brand-600 uppercase tracking-widest mb-1">Status</p>
                                            <select
                                                value={formData.status}
                                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                                className="w-full bg-transparent border-none text-xs font-bold text-brand-700 outline-none p-0 cursor-pointer"
                                            >
                                                <option value="active">PUBLISHED</option>
                                                <option value="inactive">DRAFT</option>
                                            </select>
                                        </div>
                                        <div className="mt-3 p-4 bg-brand-50 rounded-2xl border border-brand-100 flex items-center justify-between">
                                            <p className="text-[9px] font-bold text-brand-600 uppercase tracking-widest">Featured</p>
                                            <input
                                                type="checkbox"
                                                checked={formData.isFeatured}
                                                onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                                                className="h-4 w-4 rounded border-brand-300 text-primary focus:ring-primary"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Modal Content Area */}
                                <div className="flex-1 p-4 overflow-y-auto overscroll-contain touch-pan-y min-h-0">
                                    {modalTab === 'general' && (
                                        <div className="ds-section-spacing animate-in fade-in slide-in-from-right-2 duration-300">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-1.5 flex flex-col">
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Product Title</label>
                                                    <input
                                                        value={formData.name}
                                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                        className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm font-semibold outline-none ring-primary/5 focus:ring-2"
                                                        placeholder="e.g. Premium Basmati Rice"
                                                    />
                                                </div>
                                                <div className="space-y-1.5 flex flex-col">
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Web Address</label>
                                                    <div className="flex items-center bg-slate-50 rounded-xl px-4 py-2.5">
                                                        <span className="text-[10px] text-slate-400 font-bold mr-1">/product/</span>
                                                        <input
                                                            value={formData.slug}
                                                            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                                                            className="flex-1 bg-transparent border-none text-sm text-slate-500 font-semibold outline-none"
                                                            placeholder="premium-basmati-rice"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5 flex flex-col">
                                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">About this item</label>
                                                <textarea
                                                    value={formData.description}
                                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                    onWheel={(e) => e.stopPropagation()}
                                                    onTouchMove={(e) => e.stopPropagation()}
                                                    className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl text-sm font-semibold min-h-[160px] max-h-[260px] outline-none resize-none overflow-y-auto custom-scrollbar"
                                                    placeholder="Describe the item here..."
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-1.5 flex flex-col">
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Brand Name</label>
                                                    <BrandSelect
                                                        value={formData.brand}
                                                        onChange={(val) => setFormData({ ...formData, brand: val })}
                                                        brands={availableBrands}
                                                        placeholder="e.g. Amul, boAt..."
                                                    />
                                                </div>
                                                <div className="space-y-1.5 flex flex-col">
                                                    <div className="flex items-center justify-between ml-1">
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Product Code (SKU)</label>
                                                        <span className="text-[8px] font-extrabold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wider">Auto-Assigned</span>
                                                    </div>
                                                    <input
                                                        value={formData.sku}
                                                        readOnly
                                                        className="w-full px-4 py-2.5 bg-slate-200/80 border-none rounded-xl text-sm font-mono font-bold outline-none cursor-not-allowed text-slate-700 select-all"
                                                        placeholder="AUTO-GENERATED"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2 flex flex-col pt-2">
                                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">GST Tax Rate (%)</label>
                                                <div className="flex items-center space-x-2">
                                                    {[0, 5, 12, 18, 28].map((slab) => (
                                                        <button
                                                            key={slab}
                                                            type="button"
                                                            onClick={() => setFormData({ ...formData, gstTax: slab })}
                                                            className={cn(
                                                                "px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all border",
                                                                Number(formData.gstTax) === slab
                                                                    ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                                                                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                                                            )}
                                                        >
                                                            {slab}%
                                                        </button>
                                                    ))}
                                                    <div className="flex-1 min-w-[90px]">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="28"
                                                            value={formData.gstTax}
                                                            onChange={(e) => setFormData({ ...formData, gstTax: e.target.value })}
                                                            className="w-full px-3 py-2 bg-slate-100 border-none rounded-xl text-xs font-bold outline-none"
                                                            placeholder="Custom %"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {modalTab === 'category' && (
                                        <div className="ds-section-spacing animate-in fade-in slide-in-from-right-2 duration-300">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-1.5 flex flex-col">
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Main Group (Header) <span className="text-rose-500">*</span></label>
                                                    <select
                                                        value={String(formData.header || "")}
                                                        onChange={(e) => setFormData({ ...formData, header: e.target.value, categoryId: '', subcategoryId: '' })}
                                                        className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm font-bold outline-none cursor-pointer"
                                                    >
                                                        <option value="">Select Main Group</option>
                                                        {categories.map(h => <option key={String(h._id || h.id)} value={String(h._id || h.id)}>{h.name}</option>)}
                                                    </select>
                                                </div>
                                                <div className="space-y-1.5 flex flex-col">
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Specific Category <span className="text-slate-300 font-normal">(Optional)</span></label>
                                                    <select
                                                        value={String(formData.categoryId || "")}
                                                        onChange={(e) => setFormData({ ...formData, categoryId: e.target.value, subcategoryId: '' })}
                                                        disabled={!formData.header}
                                                        className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm font-bold outline-none cursor-pointer disabled:opacity-50"
                                                    >
                                                        <option value="">Select Category</option>
                                                        {categories.find(h => String(h._id || h.id) === String(formData.header))?.children?.map(c => (
                                                            <option key={String(c._id || c.id)} value={String(c._id || c.id)}>{c.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5 flex flex-col">
                                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Sub-Category <span className="text-slate-300 font-normal">(Optional)</span></label>
                                                <select
                                                    value={String(formData.subcategoryId || "")}
                                                    onChange={(e) => setFormData({ ...formData, subcategoryId: e.target.value })}
                                                    disabled={!formData.categoryId}
                                                    className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm font-bold outline-none cursor-pointer disabled:opacity-50"
                                                >
                                                    <option value="">Select Sub-Category</option>
                                                    {categories.find(h => String(h._id || h.id) === String(formData.header))?.children?.find(c => String(c._id || c.id) === String(formData.categoryId))?.children?.map(sc => (
                                                        <option key={String(sc._id || sc.id)} value={String(sc._id || sc.id)}>{sc.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    {modalTab === 'variants' && (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-sm font-bold text-slate-900">Product Variants</h4>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, variants: [...formData.variants, { id: Date.now(), name: '', price: '', salePrice: '', stock: '', sku: '' }] })}
                                                    className="rounded-xl bg-rose-50 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-rose-600 transition-colors hover:bg-rose-100"
                                                >
                                                    + ADD
                                                </button>
                                            </div>
                                            <div className="space-y-3">
                                                {formData.variants.map((v, i) => (
                                                    <div key={v.id} className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4 shadow-sm">
                                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                            <div className="space-y-1.5">
                                                                <label className="ml-1 text-[8px] font-bold uppercase tracking-widest text-slate-400">Variant Name</label>
                                                                <input
                                                                    value={v.name}
                                                                    onChange={e => {
                                                                        const news = [...formData.variants];
                                                                        news[i].name = e.target.value;
                                                                        setFormData({ ...formData, variants: news });
                                                                    }}
                                                                    placeholder="500g"
                                                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none ring-0 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <label className="ml-1 text-[8px] font-bold uppercase tracking-widest text-slate-400">Unit</label>
                                                                <input
                                                                    value={v.unit || ''}
                                                                    onChange={e => {
                                                                        const news = [...formData.variants];
                                                                        news[i].unit = e.target.value;
                                                                        setFormData({ ...formData, variants: news });
                                                                    }}
                                                                    placeholder="e.g. g, ml, packet"
                                                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none ring-0 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <label className="ml-1 text-[8px] font-bold uppercase tracking-widest text-slate-400">Pack Size</label>
                                                                <input
                                                                    value={v.packSize || ''}
                                                                    onChange={e => {
                                                                        const news = [...formData.variants];
                                                                        news[i].packSize = e.target.value;
                                                                        setFormData({ ...formData, variants: news });
                                                                    }}
                                                                    placeholder="e.g. 500, 250"
                                                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none ring-0 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <label className="ml-1 text-[8px] font-bold uppercase tracking-widest text-slate-400">SKU</label>
                                                                <div className="flex items-start gap-2">
                                                                    <input
                                                                        value={v.sku}
                                                                        onChange={e => {
                                                                            const news = [...formData.variants];
                                                                            news[i].sku = e.target.value;
                                                                            setFormData({ ...formData, variants: news });
                                                                        }}
                                                                        placeholder="mango-001"
                                                                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none ring-0 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setFormData({ ...formData, variants: formData.variants.filter((_, idx) => idx !== i) })}
                                                                        className="mt-0.5 rounded-xl p-2 text-rose-500 transition-colors hover:bg-rose-50"
                                                                        aria-label="Delete variant"
                                                                    >
                                                                        <HiOutlineTrash className="h-4 w-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {modalTab === 'media' && (
                                        <div className="ds-section-spacing animate-in fade-in slide-in-from-right-2 duration-300 space-y-6">
                                            {/* Main Cover Photo Section */}
                                            <div className="space-y-3 pb-4 border-b border-slate-100">
                                                <div className="flex flex-col">
                                                    <label className="text-xs font-bold text-slate-900">Main Cover Photo</label>
                                                    <span className="text-[10px] text-slate-400 font-medium">Primary cover image displayed on product cards and search</span>
                                                </div>
                                                <div className="w-44 aspect-square rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center group hover:border-primary hover:bg-primary/5 transition-all cursor-pointer overflow-hidden relative shadow-xs">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                                        onChange={handleMainImageUpload}
                                                    />
                                                    {formData.mainImage ? (
                                                        <div className="w-full h-full relative group">
                                                            <img src={formData.mainImage} alt="Main Preview" className="w-full h-full object-cover" />
                                                            <button
                                                                type="button"
                                                                onClick={handleRemoveMainImage}
                                                                className="absolute top-2 right-2 p-1.5 rounded-xl bg-slate-900/80 text-white hover:bg-rose-600 transition-colors z-20 shadow-md"
                                                                title="Remove cover photo"
                                                            >
                                                                <HiOutlineTrash className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center p-3 text-center">
                                                            <HiOutlinePhoto className="h-9 w-9 text-slate-300 group-hover:text-primary transition-colors mb-1" />
                                                            <p className="text-[10px] text-slate-400 font-bold group-hover:text-primary">UPLOAD COVER</p>
                                                            <span className="text-[8px] text-slate-300 mt-0.5">PNG, JPG up to 5MB</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* 5-Slot Photo Manager */}
                                            <div className="space-y-3">
                                                <div className="space-y-1">
                                                    <h4 className="text-sm font-bold text-slate-900">Additional Product Photos (5 Slots)</h4>
                                                    <p className="text-xs text-slate-500 font-medium">
                                                        Select the image type first (e.g. Front, Back) to unlock the upload box for that slot. Selected image types cannot be chosen again.
                                                    </p>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                                                    {[0, 1, 2, 3, 4].map((slotIdx) => {
                                                        const currentImg = formData.galleryImages?.[slotIdx] || "";
                                                        const currentLabel = formData.galleryLabels?.[slotIdx] || "";

                                                        return (
                                                            <div key={slotIdx} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3 shadow-sm flex flex-col justify-between">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                                                        Slot {slotIdx + 1}
                                                                    </span>
                                                                    {currentImg ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleSlotRemoveImage(slotIdx)}
                                                                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                                                                            title="Remove image"
                                                                        >
                                                                            <HiOutlineTrash className="h-4 w-4" />
                                                                        </button>
                                                                    ) : null}
                                                                </div>

                                                                {/* Image Type Selection Dropdown */}
                                                                <div className="space-y-1">
                                                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Image Type</label>
                                                                    <select
                                                                        value={currentLabel}
                                                                        onChange={(e) => handleSlotLabelChange(slotIdx, e.target.value)}
                                                                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-primary/20 text-slate-700"
                                                                    >
                                                                        <option value="">Select Type</option>
                                                                        {IMAGE_LABEL_OPTIONS.map((opt) => {
                                                                            const isSelectedElsewhere = formData.galleryLabels?.some(
                                                                                (lbl, idx) => idx !== slotIdx && lbl === opt
                                                                            );
                                                                            return (
                                                                                <option key={opt} value={opt} disabled={isSelectedElsewhere}>
                                                                                    {opt}{isSelectedElsewhere ? " (Selected elsewhere)" : ""}
                                                                                </option>
                                                                            );
                                                                        })}
                                                                    </select>
                                                                </div>

                                                                {/* Conditional Upload Box - Visible ONLY when Image Type is selected */}
                                                                {currentLabel ? (
                                                                    <div className="relative aspect-square w-full rounded-xl border-2 border-dashed border-slate-200 bg-white overflow-hidden flex flex-col items-center justify-center group hover:border-primary transition-all cursor-pointer">
                                                                        <input
                                                                            type="file"
                                                                            accept="image/*"
                                                                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                                                            onChange={(e) => handleSlotImageUpload(slotIdx, e)}
                                                                        />
                                                                        {currentImg ? (
                                                                            <div className="w-full h-full relative">
                                                                                <img src={currentImg} alt={`Slot ${slotIdx + 1}`} className="w-full h-full object-cover" />
                                                                                <span className="absolute bottom-2 left-2 right-2 text-center text-[9px] font-bold bg-slate-900/80 text-white px-2 py-1 rounded-lg backdrop-blur-xs">
                                                                                    {currentLabel}
                                                                                </span>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex flex-col items-center p-4 text-center">
                                                                                <HiOutlinePhoto className="h-8 w-8 text-slate-300 group-hover:text-primary transition-colors mb-1" />
                                                                                <span className="text-[10px] font-bold text-slate-400 group-hover:text-primary">Upload {currentLabel}</span>
                                                                                <span className="text-[8px] text-slate-300 mt-0.5">PNG, JPG up to 5MB</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <div className="aspect-square w-full rounded-xl border border-dashed border-slate-200 bg-slate-100/60 flex flex-col items-center justify-center p-4 text-center">
                                                                        <HiOutlineLockClosed className="h-6 w-6 text-slate-300 mb-1" />
                                                                        <span className="text-[10px] font-bold text-slate-400">Select Image Type First</span>
                                                                        <span className="text-[8px] text-slate-400/80 mt-0.5">Upload unlocks after selecting type</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                                <button
                                    onClick={() => setIsProductModalOpen(false)}
                                    className="px-6 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-100"
                                >
                                    CLOSE
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="bg-slate-900 text-white px-10 py-2.5 rounded-xl text-xs font-bold shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50"
                                >
                                    {isSaving ? 'SAVING...' : 'SAVE CHANGES'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <Modal
                isOpen={isRejectModalOpen}
                onClose={() => {
                    if (moderatingActionId === `reject:${itemToReject?._id}`) return;
                    setIsRejectModalOpen(false);
                    setItemToReject(null);
                    setRejectionNote('');
                }}
                title="Reject Product"
                size="sm"
                footer={
                    <>
                        <button
                            type="button"
                            onClick={() => {
                                setIsRejectModalOpen(false);
                                setItemToReject(null);
                                setRejectionNote('');
                            }}
                            disabled={moderatingActionId === `reject:${itemToReject?._id}`}
                            className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
                        >
                            CANCEL
                        </button>
                        <button
                            type="button"
                            onClick={confirmReject}
                            disabled={moderatingActionId === `reject:${itemToReject?._id}`}
                            className="px-6 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {moderatingActionId === `reject:${itemToReject?._id}` ? 'REJECTING...' : 'REJECT PRODUCT'}
                        </button>
                    </>
                }
            >
                <div className="space-y-5 py-2">
                    <div className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3">
                        <p className="text-xs font-black text-slate-900 line-clamp-2">
                            {itemToReject?.name || 'Selected product'}
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-rose-500">
                            Rejection reason required
                        </p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Reason for seller
                        </label>
                        <textarea
                            value={rejectionNote}
                            onChange={(e) => setRejectionNote(e.target.value)}
                            rows={5}
                            autoFocus
                            placeholder="Tell the seller what needs to be fixed before resubmitting..."
                            className="w-full resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:ring-2 focus:ring-rose-100"
                        />
                    </div>
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title="Confirm Deletion"
                size="sm"
                footer={
                    <>
                        <button
                            onClick={() => setIsDeleteModalOpen(false)}
                            className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
                        >
                            CANCEL
                        </button>
                        <button
                            onClick={confirmDelete}
                            className="px-6 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all active:scale-95"
                        >
                            DELETE PRODUCT
                        </button>
                    </>
                }
            >
                <div className="flex flex-col items-center text-center py-4">
                    <div className="h-16 w-16 bg-rose-50 rounded-full flex items-center justify-center mb-4">
                        <HiOutlineExclamationCircle className="h-10 w-10 text-rose-500" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 mb-2 uppercase tracking-tight">Delete Product?</h3>
                    <p className="text-sm text-slate-500 font-medium">
                        Are you sure you want to delete <span className="font-bold text-slate-900">"{itemToDelete?.name}"</span>?
                        This action cannot be undone.
                    </p>
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
                            {viewingVariants?.mainImage || viewingVariants?.images?.[0] || viewingVariants?.galleryImages?.[0] ? (
                                <img src={viewingVariants.mainImage || viewingVariants.images?.[0] || viewingVariants.galleryImages?.[0]} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <HiOutlineCube className="h-8 w-8 text-slate-200" />
                            )}
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-900 leading-tight">{viewingVariants?.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant="primary" className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5">{viewingVariants?.categoryId?.name || 'Category'}</Badge>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Master SKU: {viewingVariants?.sku || viewingVariants?._id?.slice(-6).toUpperCase() || 'N/A'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-sm bg-white">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Variant Specification</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Unit Price</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Available Stock</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Variant SKU</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {viewingVariants?.variants?.map((v, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/30 transition-all cursor-default">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-700 group-hover:text-primary transition-colors">{v.name}</span>
                                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Variation {idx + 1}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className={cn("text-xs font-bold", v.salePrice > 0 ? "text-slate-400 line-through scale-90" : "text-slate-900")}>₹{v.price}</span>
                                                {v.salePrice > 0 && <span className="text-xs font-bold text-brand-600">₹{v.salePrice}</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <Badge variant={v.stock === 0 ? "rose" : v.stock <= 10 ? "amber" : "emerald"} className="text-[10px] font-black uppercase tracking-widest px-2 shadow-sm">
                                                {v.stock === 0 ? 'OUT OF STOCK' : `${v.stock} UNITS`}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-[10px] font-bold text-slate-400 font-mono tracking-tighter uppercase bg-slate-100 px-2 py-1 rounded-lg">
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

            <BulkImportModal
                isOpen={isBulkImportModalOpen}
                onClose={() => setIsBulkImportModalOpen(false)}
                onSuccess={() => fetchProducts(1)}
            />

        </div>
    );
};

export default ProductManagement;


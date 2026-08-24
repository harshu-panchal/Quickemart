import axiosInstance from '@core/api/axios';

/**
 * Admin catalog endpoints: categories and products (moderation included).
 * Per-domain split (P4.5).
 */
export const adminCatalogApi = {
    // Category Management
    getCategories: (params) => axiosInstance.get('/admin/categories', { params }),
    getCategoryTree: () => axiosInstance.get('/admin/categories?tree=true'),
    createCategory: (formData) =>
        axiosInstance.post('/admin/categories', formData),
    updateCategory: (id, formData) =>
        axiosInstance.put(`/admin/categories/${id}`, formData),
    deleteCategory: (id) => axiosInstance.delete(`/admin/categories/${id}`),
    getParentUnits: () => axiosInstance.get('/admin/categories?flat=true'),

    // Product Management
    getProducts: (params) => axiosInstance.get('/products', { params }),
    getProductModerationList: (params) =>
        axiosInstance.get('/products/moderation', { params }),
    approveProductModeration: (id, data = {}) =>
        axiosInstance.patch(`/products/moderation/${id}/approve`, data),
    rejectProductModeration: (id, data = {}) =>
        axiosInstance.patch(`/products/moderation/${id}/reject`, data),
    createProduct: (formData) => axiosInstance.post('/products', formData),
    updateProduct: (id, formData) =>
        axiosInstance.put(`/products/${id}`, formData),
    deleteProduct: (id) => axiosInstance.delete(`/products/${id}`),
    bulkImportCatalog: (formData) => 
        axiosInstance.post('/admin/catalog/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }),
    getImportStatus: (taskId) =>
        axiosInstance.get(`/admin/catalog/import/status/${taskId}`),
    downloadImportTemplate: () => 
        axiosInstance.get('/admin/catalog/template', { responseType: 'blob' }),
    getMasterProducts: (params) =>
        axiosInstance.get('/admin/catalog', { params }),
    createMasterProduct: (formData) =>
        axiosInstance.post('/admin/catalog', formData),
    updateMasterProduct: (id, formData) =>
        axiosInstance.put(`/admin/catalog/${id}`, formData),
    deleteMasterProduct: (id) =>
        axiosInstance.delete(`/admin/catalog/${id}`),
    getCatalogBrands: (params) =>
        axiosInstance.get('/products/catalog/brands', { params }),
};

export default adminCatalogApi;

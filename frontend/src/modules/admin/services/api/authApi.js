import axiosInstance from '@core/api/axios';

/**
 * Admin authentication and profile endpoints.
 *
 * Part of the per-domain split introduced in refactor P4.5. The aggregate
 * `adminApi` object continues to expose these via re-export at
 * `../adminApi.js`, so existing imports continue to work unchanged.
 */
export const adminAuthApi = {
    login: (data) => axiosInstance.post('/admin/login', data),
    signup: (data) => axiosInstance.post('/admin/signup', data),
    getProfile: () => axiosInstance.get('/admin/profile'),
    updateProfile: (data) => axiosInstance.put('/admin/profile', data),
    updatePassword: (data) => axiosInstance.put('/admin/profile/password', data),

    // Employee Role Assignment APIs
    getPublicEmployees: () => axiosInstance.get('/admin/public-employees'),
    getEmployees: () => axiosInstance.get('/admin/employees'),
    createEmployee: (data) => axiosInstance.post('/admin/role-assign', data),
    updateEmployee: (id, data) => axiosInstance.put(`/admin/role-assign/${id}`, data),
    deleteEmployee: (id) => axiosInstance.delete(`/admin/role-assign/${id}`),
};

export default adminAuthApi;

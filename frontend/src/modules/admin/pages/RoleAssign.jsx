import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShieldCheck,
    UserPlus,
    Mail,
    Lock,
    User,
    KeyRound,
    Edit3,
    Trash2,
    XCircle,
    Eye,
    EyeOff,
    Search,
    RefreshCw,
    ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../services/adminApi';

const RoleAssign = () => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // New Employee Form State
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'product', // Product Manager role
    });

    // Edit Modal State
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [editFormData, setEditFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'product',
        isActive: true,
    });
    const [showEditPassword, setShowEditPassword] = useState(false);

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            const res = await adminApi.getEmployees();
            console.log('Get employees response payload:', res.data);
            const list = res.data?.results || res.data?.result || [];
            if (Array.isArray(list)) {
                setEmployees(list);
            }
        } catch (err) {
            console.error('Error loading employees:', err);
            toast.error(err.response?.data?.message || 'Failed to fetch employee list');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEmployees();
    }, []);

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCreateEmployee = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        const pwd = formData.password.trim();
        if (pwd.length < 10) {
            toast.error('Password must be at least 10 characters long.');
            setSubmitting(false);
            return;
        }
        if (!/[a-z]/.test(pwd) || !/[A-Z]/.test(pwd) || !/[0-9]/.test(pwd)) {
            toast.error('Password must contain lowercase, uppercase, and numbers.');
            setSubmitting(false);
            return;
        }

        try {
            const res = await adminApi.createEmployee({
                name: formData.name,
                email: formData.email,
                password: formData.password,
                role: formData.role,
                permissions: ['products', 'categories'],
            });

            if (res.data?.success) {
                toast.success('Employee credentials created successfully!');
                setFormData({
                    name: '',
                    email: '',
                    password: '',
                    role: 'product',
                });
                await fetchEmployees();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create employee credentials');
        } finally {
            setSubmitting(false);
        }
    };

    const handleOpenEdit = (emp) => {
        setEditingEmployee(emp);
        setEditFormData({
            name: emp.name || '',
            email: emp.email || '',
            password: '',
            role: emp.role || 'product',
            isActive: emp.isActive !== false,
        });
    };

    const handleUpdateEmployee = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const updatePayload = {
                name: editFormData.name,
                email: editFormData.email,
                role: editFormData.role,
                isActive: editFormData.isActive,
                permissions: ['products', 'categories'],
            };

            if (editFormData.password && editFormData.password.trim() !== '') {
                updatePayload.password = editFormData.password;
            }

            const res = await adminApi.updateEmployee(editingEmployee._id, updatePayload);
            if (res.data?.success) {
                toast.success('Employee account updated successfully!');
                setEditingEmployee(null);
                await fetchEmployees();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update employee account');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteEmployee = async (id, name) => {
        if (!window.confirm(`Are you sure you want to delete credentials for ${name}?`)) return;
        try {
            const res = await adminApi.deleteEmployee(id);
            if (res.data?.success) {
                toast.success('Employee credential deleted.');
                await fetchEmployees();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete employee account');
        }
    };

    const filteredEmployees = employees.filter(emp =>
        emp.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.role?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="p-6 md:p-10 space-y-10 max-w-7xl mx-auto font-['Outfit',_sans-serif]">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-6">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-brand-50 text-brand-600 rounded-2xl">
                            <ShieldCheck className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Role Assignment & Credentials</h1>
                            <p className="text-sm text-gray-600 font-semibold mt-1">Define employee login email & password and assign feature permissions</p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={fetchEmployees}
                    className="flex items-center gap-2 px-5 py-3 bg-white hover:bg-gray-50 text-gray-900 font-extrabold rounded-2xl text-xs transition-all border border-gray-300 shadow-sm w-fit cursor-pointer"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh List
                </button>
            </div>

            {/* Grid Container: Left = Create Form, Right = Employee List */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Create Employee Card */}
                <div className="lg:col-span-5 bg-white rounded-3xl p-8 border border-gray-200 shadow-md h-fit space-y-6">
                    <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                            <UserPlus className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-gray-900">Assign New Role & Login</h2>
                            <p className="text-xs text-gray-500 font-semibold">Create credentials for staff/employee</p>
                        </div>
                    </div>

                    <form onSubmit={handleCreateEmployee} className="space-y-4">
                        {/* Name Input */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-gray-800 flex items-center gap-1.5 uppercase tracking-wide">
                                <User className="w-3.5 h-3.5 text-gray-500" /> Full Name
                            </label>
                            <input
                                type="text"
                                name="name"
                                required
                                value={formData.name}
                                onChange={handleFormChange}
                                placeholder="e.g. Rahul Sharma"
                                className="w-full px-4 py-3.5 bg-gray-50 border border-gray-300 rounded-2xl text-sm font-bold text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-50/50 transition-all"
                            />
                        </div>

                        {/* Email Input */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-gray-800 flex items-center gap-1.5 uppercase tracking-wide">
                                <Mail className="w-3.5 h-3.5 text-gray-500" /> Employee Email
                            </label>
                            <input
                                type="email"
                                name="email"
                                required
                                value={formData.email}
                                onChange={handleFormChange}
                                placeholder="rahul@quickemart.com"
                                className="w-full px-4 py-3.5 bg-gray-50 border border-gray-300 rounded-2xl text-sm font-bold text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-50/50 transition-all"
                            />
                        </div>

                        {/* Password Input */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-gray-800 flex items-center gap-1.5 uppercase tracking-wide">
                                <Lock className="w-3.5 h-3.5 text-gray-500" /> Assign Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    required
                                    minLength={10}
                                    value={formData.password}
                                    onChange={handleFormChange}
                                    placeholder="Min 10 chars (Aa1...)"
                                    className="w-full pl-4 pr-12 py-3.5 bg-gray-50 border border-gray-300 rounded-2xl text-sm font-bold text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-50/50 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800 focus:outline-none cursor-pointer"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <p className="text-[11px] text-gray-500 font-semibold leading-tight">Must be at least 10 chars with uppercase, lowercase, and numbers.</p>
                        </div>

                        {/* Role Select - Scoped to Staff/Employee roles only */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-gray-800 flex items-center gap-1.5 uppercase tracking-wide">
                                <KeyRound className="w-3.5 h-3.5 text-gray-500" /> Assigned Access Role
                            </label>
                            <select
                                name="role"
                                value={formData.role}
                                onChange={handleFormChange}
                                className="w-full px-4 py-3.5 bg-gray-50 border border-gray-300 rounded-2xl text-sm font-black text-gray-900 outline-none focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-50/50 transition-all cursor-pointer"
                            >
                                <option value="product">📦 Product Manager (Product & Category Access Only)</option>
                            </select>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-4 bg-[#0a0c10] hover:bg-gray-800 text-white rounded-2xl font-black text-sm shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-4 cursor-pointer"
                        >
                            {submitting ? (
                                <RefreshCw className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    <span>Save Employee Credential</span>
                                    <UserPlus className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Employee List Section */}
                <div className="lg:col-span-7 bg-white rounded-3xl p-8 border border-gray-200 shadow-md space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                        <div>
                            <h2 className="text-lg font-black text-gray-900">Defined Employee Credentials</h2>
                            <p className="text-xs text-gray-500 font-bold">Total Accounts: {employees.length}</p>
                        </div>

                        {/* Search Bar */}
                        <div className="relative w-full sm:w-64">
                            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search employees..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:border-brand-500 transition-all"
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div className="py-16 text-center text-gray-600 text-sm font-bold flex items-center justify-center gap-2">
                            <RefreshCw className="w-5 h-5 animate-spin text-brand-600" />
                            Loading employee accounts...
                        </div>
                    ) : filteredEmployees.length === 0 ? (
                        <div className="py-16 text-center space-y-3">
                            <div className="w-12 h-12 bg-gray-100 text-gray-500 rounded-2xl flex items-center justify-center mx-auto">
                                <ShieldAlert className="w-6 h-6" />
                            </div>
                            <p className="text-sm font-bold text-gray-700">No employee accounts found.</p>
                            <p className="text-xs text-gray-500 font-semibold">Use the form on the left to define new employee credentials.</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                            {filteredEmployees.map((emp) => (
                                <div
                                    key={emp._id}
                                    className="p-5 rounded-2xl bg-gray-50 border border-gray-200 hover:border-brand-400 hover:bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-base font-black text-gray-900">{emp.name}</h3>
                                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                emp.role === 'product'
                                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                                    : 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                                            }`}>
                                                {emp.role === 'product' ? 'Product Manager' : 'Super Admin'}
                                            </span>
                                            {emp.isActive === false && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-800">Deactivated</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4 text-xs font-extrabold text-gray-600">
                                            <span className="flex items-center gap-1">
                                                <Mail className="w-3.5 h-3.5 text-gray-400" /> {emp.email}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleOpenEdit(emp)}
                                            className="px-3.5 py-2 bg-white hover:bg-gray-100 text-gray-900 rounded-xl text-xs font-black border border-gray-300 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                                        >
                                            <Edit3 className="w-3.5 h-3.5" /> Edit
                                        </button>
                                        <button
                                            onClick={() => handleDeleteEmployee(emp._id, emp.name)}
                                            className="p-2 bg-white hover:bg-red-50 text-red-600 rounded-xl border border-gray-300 transition-all shadow-sm cursor-pointer"
                                            title="Delete Credentials"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Employee Modal */}
            <AnimatePresence>
                {editingEmployee && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-3xl p-8 max-w-lg w-full border border-gray-200 shadow-2xl space-y-6"
                        >
                            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900">Edit Employee Account</h3>
                                    <p className="text-xs text-gray-500 font-semibold">Update email, password, or permissions</p>
                                </div>
                                <button
                                    onClick={() => setEditingEmployee(null)}
                                    className="p-2 text-gray-500 hover:text-gray-800 rounded-xl hover:bg-gray-100 cursor-pointer"
                                >
                                    <XCircle className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleUpdateEmployee} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-black text-gray-800 uppercase tracking-wide">Full Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={editFormData.name}
                                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-2xl text-sm font-bold text-gray-900 outline-none focus:bg-white focus:border-brand-500"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black text-gray-800 uppercase tracking-wide">Email Address</label>
                                    <input
                                        type="email"
                                        required
                                        value={editFormData.email}
                                        onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-2xl text-sm font-bold text-gray-900 outline-none focus:bg-white focus:border-brand-500"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black text-gray-800 uppercase tracking-wide">Change Password (Leave empty to keep current)</label>
                                    <div className="relative">
                                        <input
                                            type={showEditPassword ? 'text' : 'password'}
                                            value={editFormData.password}
                                            onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                                            placeholder="Enter new password..."
                                            className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-300 rounded-2xl text-sm font-bold text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:border-brand-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowEditPassword(!showEditPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 cursor-pointer"
                                        >
                                            {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black text-gray-800 uppercase tracking-wide">Role</label>
                                    <select
                                        value={editFormData.role}
                                        onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-2xl text-sm font-black text-gray-900 outline-none focus:bg-white focus:border-brand-500 cursor-pointer"
                                    >
                                        <option value="product">Product Manager (Products & Categories)</option>
                                    </select>
                                </div>

                                <div className="flex items-center gap-3 pt-2">
                                    <input
                                        type="checkbox"
                                        id="isActiveCheck"
                                        checked={editFormData.isActive}
                                        onChange={(e) => setEditFormData({ ...editFormData, isActive: e.target.checked })}
                                        className="w-4 h-4 text-brand-600 rounded cursor-pointer"
                                    />
                                    <label htmlFor="isActiveCheck" className="text-xs font-black text-gray-800 cursor-pointer">
                                        Account Active & Enabled for Login
                                    </label>
                                </div>

                                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => setEditingEmployee(null)}
                                        className="px-5 py-2.5 bg-gray-100 text-gray-800 rounded-xl text-xs font-black cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="px-6 py-2.5 bg-[#0a0c10] text-white rounded-xl text-xs font-black shadow-md hover:bg-gray-800 transition-all flex items-center gap-2 cursor-pointer"
                                    >
                                        {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default RoleAssign;

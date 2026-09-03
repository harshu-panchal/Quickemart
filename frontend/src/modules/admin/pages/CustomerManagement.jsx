import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import {
    Users,
    Search,
    Download,
    Eye,
    Phone,
    ShoppingBag,
    MoreVertical,
    UserPlus,
    RotateCw,
    Activity,
    Loader2,
    X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import Pagination from '@shared/components/ui/Pagination';
import ExportDateModal from '@shared/components/ui/ExportDateModal';
import { filterRecordsByDateRange } from '@shared/utils/dateFilterUtils';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';

const CustomerManagement = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [isExporting, setIsExporting] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [addForm, setAddForm] = useState({ name: '', phone: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleCreateCustomer = async (e) => {
        e.preventDefault();
        const cleanName = addForm.name.trim();
        const cleanPhone = addForm.phone.trim().replace(/\D/g, '');

        if (!cleanName) {
            toast.error("Please enter full name");
            return;
        }
        if (cleanPhone.length !== 10) {
            toast.error("Please enter a valid 10-digit mobile number");
            return;
        }

        try {
            setIsSubmitting(true);
            const { data } = await adminApi.createCustomer({ name: cleanName, phone: cleanPhone });
            if (data.success) {
                toast.success(`Customer "${cleanName}" added successfully!`);
                setIsAddModalOpen(false);
                setAddForm({ name: '', phone: '' });
                fetchCustomers(1);
            } else {
                toast.error(data.message || "Failed to create customer");
            }
        } catch (error) {
            console.error("Error creating customer:", error);
            toast.error(error.response?.data?.message || "Failed to create customer");
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchCustomers(1);
        }, 500);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSize, searchTerm, filterStatus]);
    const fetchCustomers = async (requestedPage = 1) => {
        try {
            setLoading(true);
            const params = { page: requestedPage, limit: pageSize };
            if (searchTerm.trim()) params.search = searchTerm.trim();
            if (filterStatus !== 'all') params.status = filterStatus;
            const { data } = await adminApi.getUsers(params);
            if (data.success) {
                const payload = data.result || {};
                const list = Array.isArray(payload.items) ? payload.items : (data.results || []);
                setCustomers(list);
                if (typeof payload.total === 'number') {
                    setTotal(payload.total);
                } else {
                    setTotal(list.length);
                }
                if (typeof payload.page === 'number') {
                    setPage(payload.page);
                } else {
                    setPage(requestedPage);
                }
            }
        } catch (error) {
            console.error("Error fetching customers:", error);
            toast.error("Failed to load customers");
        } finally {
            setLoading(false);
        }
    };

    const stats = useMemo(() => {
        const safeCustomers = Array.isArray(customers) ? customers : [];
        return {
            total: total,
            active: safeCustomers.filter(c => c.status === 'active').length,
            newToday: safeCustomers.filter(c => {
                const today = new Date().toISOString().split('T')[0];
                const joined = new Date(c.joinedDate).toISOString().split('T')[0];
                return joined === today;
            }).length
        };
    }, [customers, total]);

    const filteredCustomers = useMemo(() => {
        const safeCustomers = Array.isArray(customers) ? customers : [];
        return safeCustomers.filter(c => {
            const matchesSearch = (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (c.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (c.phone || '').includes(searchTerm);
            const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
            return matchesSearch && matchesStatus;
        });
    }, [customers, searchTerm, filterStatus]);

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    const handlePerformExport = async ({ preset, customFrom, customTo }) => {
        setIsExporting(true);
        const toastId = toast.loading("Generating Customer Excel database...");
        try {
            const params = { page: 1, limit: 10000 };
            if (searchTerm.trim()) params.search = searchTerm.trim();
            if (filterStatus !== 'all') params.status = filterStatus;

            const { data } = await adminApi.getUsers(params);
            if (data.success) {
                const payload = data.result || {};
                const rawList = Array.isArray(payload.items) ? payload.items : (data.results || []);

                const list = filterRecordsByDateRange(rawList, preset, customFrom, customTo, ['createdAt', 'createdDate']);

                if (!list || list.length === 0) {
                    toast.dismiss(toastId);
                    toast.error("No customers found matching the date range");
                    setIsExporting(false);
                    setIsExportModalOpen(false);
                    return;
                }

                const excelRows = list.map((customer) => {
                    const stats = customer.stats || {};
                    const totalOrders = stats.totalOrders != null ? stats.totalOrders : (customer.totalOrders || 0);
                    const totalSpent = stats.totalSpent != null ? stats.totalSpent : (customer.totalSpent || customer.totalPurchase || 0);
                    const avgOrderVal = totalOrders > 0 ? Math.round(totalSpent / totalOrders) : 0;
                    const addressObj = customer.address || {};

                    return {
                        "Customer ID": customer._id || customer.id || "N/A",
                        "Customer Name": customer.name || "N/A",
                        "Mobile": customer.phone || "N/A",
                        "Email": customer.email || "N/A",
                        "City": addressObj.city || customer.city || "N/A",
                        "Area": addressObj.area || customer.area || "N/A",
                        "Registration Date": customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('en-GB') : "N/A",
                        "Total Orders": totalOrders,
                        "Delivered": stats.deliveredOrders != null ? stats.deliveredOrders : (customer.deliveredCount || 0),
                        "Cancelled": stats.cancelledOrders != null ? stats.cancelledOrders : (customer.cancelledCount || 0),
                        "Total Purchase": totalSpent,
                        "Average Order Value": avgOrderVal,
                        "Wallet Balance": customer.walletBalance || 0,
                        "Refund Amount": stats.totalRefunded || 0,
                        "Coupon Used": stats.couponsUsedCount || 0,
                        "Last Order Date": customer.lastOrderDate || customer.lastOrderAt ? new Date(customer.lastOrderDate || customer.lastOrderAt).toLocaleDateString('en-GB') : "Never",
                        "Rating": customer.rating != null ? customer.rating : "N/A",
                        "Customer Status": customer.status ? String(customer.status).toUpperCase() : (customer.isActive === false ? "INACTIVE" : "ACTIVE"),
                    };
                });

                const worksheet = XLSX.utils.json_to_sheet(excelRows);
                const columnWidths = Object.keys(excelRows[0] || {}).map((key) => {
                    const maxLen = Math.max(key.length, ...excelRows.map((row) => String(row[key] || '').length));
                    return { wch: Math.min(Math.max(maxLen + 4, 12), 50) };
                });
                worksheet['!cols'] = columnWidths;

                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");

                const dateStr = new Date().toISOString().split('T')[0];
                const fileName = `Customer_Database_Report_${dateStr}.xlsx`;
                XLSX.writeFile(workbook, fileName);

                toast.dismiss(toastId);
                toast.success(`Exported ${excelRows.length} customers to Excel successfully!`);
                setIsExportModalOpen(false);
            } else {
                toast.dismiss(toastId);
                toast.error("Failed to export customers");
            }
        } catch (error) {
            console.error("Export error:", error);
            toast.dismiss(toastId);
            toast.error("An error occurred during export");
        } finally {
            setIsExporting(false);
        }
    };

    const getTimeAgo = (date) => {
        if (!date) return 'Never';
        const now = new Date();
        const past = new Date(date);
        const diffInMs = now - past;
        const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));

        if (diffInHours < 1) return 'Recently';
        if (diffInHours < 24) return `${diffInHours}h ago`;
        const diffInDays = Math.floor(diffInHours / 24);
        return `${diffInDays}d ago`;
    };

    return (
        <div className="ds-section-spacing">
            <PageHeader
                title="Customers"
                description="Manage and track all customer accounts"
                badge={
                    <div className="ds-stat-card-icon bg-brand-50">
                        <Users className="ds-icon-lg text-brand-600" />
                    </div>
                }
                actions={
                    <>
                        <button
                            onClick={() => setIsExportModalOpen(true)}
                            disabled={isExporting}
                            className="ds-btn ds-btn-md bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 shadow-md disabled:opacity-50"
                        >
                            {isExporting ? <RotateCw className="ds-icon-sm animate-spin text-white" /> : <Download className="ds-icon-sm text-white" />}
                            {isExporting ? 'EXPORTING EXCEL...' : 'EXPORT EXCEL'}
                        </button>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="ds-btn ds-btn-md bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                        >
                            <UserPlus className="ds-icon-sm" />
                            NEW CUSTOMER
                        </button>
                    </>
                }
            />

            {/* Quick Stats Grid */}
            <div className="ds-grid-cards-3">
                <StatCard
                    label="Total Customers"
                    value={stats.total}
                    icon={Users}
                    color="text-brand-600"
                    bg="bg-brand-50"
                />
                <StatCard
                    label="Active Users"
                    value={stats.active}
                    icon={Activity}
                    color="text-brand-600"
                    bg="bg-brand-50"
                />
                <StatCard
                    label="New Today"
                    value={stats.newToday}
                    icon={UserPlus}
                    color="text-brand-600"
                    bg="bg-brand-50"
                />
            </div>

            {/* Filter & Search Bar */}
            <Card className="ds-card-compact">
                <div className="flex flex-col lg:flex-row gap-3">
                    <div className="flex-1 relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 ds-icon-sm text-gray-400 group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            placeholder="Search by name, email or phone..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="ds-input pl-9"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex bg-gray-100 p-0.5 rounded-lg">
                            {['all', 'active', 'inactive'].map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setFilterStatus(status)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-md ds-caption transition-all",
                                        filterStatus === status ? "bg-white text-primary shadow-sm" : "text-gray-400 hover:text-gray-600"
                                    )}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Card>

            {/* Customer List Table */}
            <Card className="overflow-hidden relative min-h-[400px]">
                {loading && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-8 w-8 text-primary animate-spin" />
                            <p className="ds-caption text-gray-500 font-medium">Loading Customers...</p>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="ds-table">
                        <thead className="ds-table-header">
                            <tr>
                                <th className="ds-table-header-cell">Customer</th>
                                <th className="ds-table-header-cell">Activity</th>
                                <th className="ds-table-header-cell">Total Spend</th>
                                <th className="ds-table-header-cell">Status</th>
                                <th className="ds-table-header-cell text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!loading && filteredCustomers.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="p-4 bg-gray-50 rounded-full">
                                                <Users className="h-8 w-8 text-gray-300" />
                                            </div>
                                            <p className="ds-h4 text-gray-400">No customers found</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredCustomers.map((cust) => (
                                    <tr key={cust.id} className="ds-table-row">
                                        <td className="ds-table-cell">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
                                                    alt=""
                                                    className="h-10 w-10 rounded-lg bg-gray-100 ring-2 ring-white shadow-sm object-cover"
                                                />
                                                <div>
                                                    <p
                                                        onClick={() => navigate(`/admin/customers/${cust.id}`)}
                                                        className="ds-h4 hover:text-primary cursor-pointer transition-colors"
                                                    >
                                                        {cust.name}
                                                    </p>
                                                    <p className="ds-body-sm text-gray-500">{cust.email || 'No email'}</p>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <Phone className="ds-icon-sm text-gray-300" />
                                                        <span className="text-[9px] text-gray-400">{cust.phone}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="ds-table-cell">
                                            <div>
                                                <div className="flex items-center gap-1.5 ds-body font-semibold">
                                                    <ShoppingBag className="ds-icon-sm text-primary" />
                                                    {cust.totalOrders} Orders
                                                </div>
                                                <p className="ds-body-sm text-gray-400 mt-0.5">Last: {getTimeAgo(cust.lastOrderDate)}</p>
                                            </div>
                                        </td>
                                        <td className="ds-table-cell ds-h4">
                                            ₹{(cust.totalSpent || 0).toLocaleString()}
                                        </td>
                                        <td className="ds-table-cell">
                                            <Badge
                                                variant={cust.status === 'active' ? 'success' : 'error'}
                                                className="ds-badge"
                                            >
                                                {cust.status}
                                            </Badge>
                                        </td>
                                        <td className="ds-table-cell text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => navigate(`/admin/customers/${cust.id}`)}
                                                    className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all"
                                                >
                                                    <Eye className="ds-icon-sm" />
                                                </button>
                                                <button className="p-2 bg-gray-50 text-gray-400 rounded-lg hover:bg-gray-900 hover:text-white transition-all">
                                                    <MoreVertical className="ds-icon-sm" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="px-6 py-3 border-t border-gray-100">
                    <Pagination
                        page={page}
                        totalPages={Math.ceil(total / pageSize) || 1}
                        total={total}
                        pageSize={pageSize}
                        onPageChange={(p) => fetchCustomers(p)}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setPage(1);
                        }}
                        loading={loading}
                    />
                </div>
            </Card>

            {/* Add New Customer Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
                    <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 border border-gray-100">
                        <button
                            onClick={() => setIsAddModalOpen(false)}
                            className="absolute top-5 right-5 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-all"
                        >
                            <X className="ds-icon-sm" />
                        </button>

                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                                <UserPlus className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-gray-900">Add New Customer</h3>
                                <p className="text-xs font-semibold text-gray-500">Customer can log in directly via phone & OTP</p>
                            </div>
                        </div>

                        <form onSubmit={handleCreateCustomer} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                    Full Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Rajesh Kumar"
                                    value={addForm.name}
                                    onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-medium text-sm transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                    Mobile Number <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <span className="absolute left-4 top-3.5 text-sm font-bold text-gray-400">+91</span>
                                    <input
                                        type="tel"
                                        required
                                        maxLength={10}
                                        placeholder="10-digit mobile number"
                                        value={addForm.phone}
                                        onChange={(e) => setAddForm((prev) => ({ ...prev, phone: e.target.value.replace(/\D/g, '') }))}
                                        className="w-full pl-14 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-bold text-sm tracking-wider transition-all"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 py-3 px-4 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Creating...</span>
                                        </>
                                    ) : (
                                        <span>Create Customer</span>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Export Date Modal */}
            <ExportDateModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onConfirmExport={handlePerformExport}
                isExporting={isExporting}
                title="Export Customers Excel Database"
            />
        </div>
    );
};

export default CustomerManagement;

import React, { useState, useEffect } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import Input from "@shared/components/ui/Input";
import Modal from "@shared/components/ui/Modal";
import Pagination from "@shared/components/ui/Pagination";
import {
  ShieldAlert,
  Scale,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  Search,
  Plus,
  RefreshCw,
  Edit,
  Eye,
  FileText,
  DollarSign,
  TrendingDown,
  History,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { BlurFade } from "@/components/ui/blur-fade";
import { MagicCard } from "@/components/ui/magic-card";
import axiosInstance from "@core/api/axios";

const customFetch = async (url, options = {}) => {
  const cleanUrl = url.startsWith('/api/') ? url.substring(4) : url;
  const method = (options.method || "GET").toLowerCase();
  const body = options.body ? JSON.parse(options.body) : undefined;
  try {
    let res;
    if (method === "get") {
      res = await axiosInstance.get(cleanUrl);
    } else if (method === "post") {
      res = await axiosInstance.post(cleanUrl, body);
    } else if (method === "put") {
      res = await axiosInstance.put(cleanUrl, body);
    } else if (method === "delete") {
      res = await axiosInstance.delete(cleanUrl);
    }
    return res.data;
  } catch (error) {
    return error.response?.data || { success: false, message: error.response?.data?.message || error.message || "Request failed" };
  }
};

const SlaPenaltyManagement = () => {
  const [activeTab, setActiveTab] = useState("violations");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);

  // Violations State
  const [violations, setViolations] = useState([]);
  const [violationsPage, setViolationsPage] = useState(1);
  const [violationsTotalPages, setViolationsTotalPages] = useState(1);
  const [violationsTotal, setViolationsTotal] = useState(0);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Rules State
  const [rules, setRules] = useState([]);
  const [editingRule, setEditingRule] = useState(null);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [ruleHistoryModal, setRuleHistoryModal] = useState(null);

  // Detail / Action Modals
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [actionReason, setActionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Form for Manual Violation Record
  const [recordForm, setRecordForm] = useState({
    category: "ACCEPTANCE_DELAY",
    orderId: "",
    sellerId: "",
    amountOverride: "",
    description: "",
  });

  const fetchSummary = async () => {
    try {
      const res = await customFetch("/api/admin/sla/summary");
      if (res?.success) setSummary(res.result);
    } catch (error) {
      console.error("Failed to fetch SLA summary:", error);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await customFetch("/api/admin/sla/rules");
      // handleResponse puts arrays in .results
      if (res?.success && Array.isArray(res.results)) {
        setRules(res.results);
      } else if (res?.success && Array.isArray(res.result)) {
        setRules(res.result);
      } else {
        setRules([]);
      }
    } catch (error) {
      console.error("Failed to fetch SLA rules:", error);
      setRules([]);
    }
  };

  const fetchViolations = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: violationsPage,
        limit: 15,
        ...(selectedCategoryFilter && { category: selectedCategoryFilter }),
        ...(selectedStatusFilter && { status: selectedStatusFilter }),
        ...(searchQuery && { search: searchQuery }),
      });
      const res = await customFetch(`/api/admin/sla/violations?${query}`);
      if (res?.success) {
        // handleResponse puts objects in .result
        const payload = res.result || {};
        setViolations(Array.isArray(payload.items) ? payload.items : []);
        setViolationsTotalPages(payload.totalPages || 1);
        setViolationsTotal(payload.total || 0);
      }
    } catch (error) {
      toast.error("Failed to fetch SLA violations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    fetchRules();
  }, []);

  useEffect(() => {
    if (activeTab === "violations") {
      fetchViolations();
    }
  }, [activeTab, violationsPage, selectedCategoryFilter, selectedStatusFilter, searchQuery]);

  const handleUpdateRule = async (e) => {
    e.preventDefault();
    if (!editingRule) return;
    setActionLoading(true);
    try {
      const res = await customFetch(`/api/admin/sla/rules/${editingRule._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingRule),
      });
      if (res?.success) {
        toast.success("SLA Rule updated successfully!");
        setIsRuleModalOpen(false);
        setEditingRule(null);
        fetchRules();
      } else {
        toast.error(res?.message || "Failed to update rule");
      }
    } catch (error) {
      toast.error(error.message || "Failed to update rule");
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveViolation = async (id) => {
    setActionLoading(true);
    try {
      const res = await customFetch(`/api/admin/sla/violations/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes: actionReason }),
      });
      if (res?.success) {
        toast.success("Violation approved & penalty deducted from seller wallet!");
        setIsDetailModalOpen(false);
        setActionReason("");
        fetchViolations();
        fetchSummary();
      } else {
        toast.error(res?.message || "Approval failed");
      }
    } catch (error) {
      toast.error(error.message || "Approval failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectViolation = async (id) => {
    setActionLoading(true);
    try {
      const res = await customFetch(`/api/admin/sla/violations/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes: actionReason }),
      });
      if (res?.success) {
        toast.success("Violation rejected.");
        setIsDetailModalOpen(false);
        setActionReason("");
        fetchViolations();
        fetchSummary();
      } else {
        toast.error(res?.message || "Rejection failed");
      }
    } catch (error) {
      toast.error(error.message || "Rejection failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleWaiveViolation = async (id) => {
    if (!actionReason.trim()) {
      toast.error("Please enter a mandatory waiver reason");
      return;
    }
    setActionLoading(true);
    try {
      const res = await customFetch(`/api/admin/sla/violations/${id}/waive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waiverReason: actionReason }),
      });
      if (res?.success) {
        toast.success("Violation waived! Penalty credited back if previously debited.");
        setIsDetailModalOpen(false);
        setActionReason("");
        fetchViolations();
        fetchSummary();
      } else {
        toast.error(res?.message || "Waiver failed");
      }
    } catch (error) {
      toast.error(error.message || "Waiver failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveDispute = async (id, outcome) => {
    setActionLoading(true);
    try {
      const res = await customFetch(`/api/admin/sla/violations/${id}/resolve-dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, notes: actionReason }),
      });
      if (res?.success) {
        toast.success(`Dispute resolved with outcome: ${outcome}`);
        setIsDetailModalOpen(false);
        setActionReason("");
        fetchViolations();
        fetchSummary();
      } else {
        toast.error(res?.message || "Dispute resolution failed");
      }
    } catch (error) {
      toast.error(error.message || "Dispute resolution failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordManualViolation = async (e) => {
    e.preventDefault();
    if (!recordForm.orderId) {
      toast.error("Order ID is required");
      return;
    }
    setActionLoading(true);
    try {
      const res = await customFetch("/api/admin/sla/violations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recordForm),
      });
      if (res?.success) {
        toast.success("Manual violation recorded successfully!");
        setIsRecordModalOpen(false);
        setRecordForm({ category: "ACCEPTANCE_DELAY", orderId: "", sellerId: "", amountOverride: "", description: "" });
        fetchViolations();
        fetchSummary();
      } else {
        toast.error(res?.message || "Failed to record violation");
      }
    } catch (error) {
      toast.error(error.message || "Failed to record violation");
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "APPROVED":
        return <Badge variant="success" className="bg-emerald-100 text-emerald-800 font-bold">APPROVED & DEDUCTED</Badge>;
      case "PENDING_APPROVAL":
        return <Badge variant="warning" className="bg-amber-100 text-amber-800 font-bold">PENDING APPROVAL</Badge>;
      case "DISPUTED":
        return <Badge variant="destructive" className="bg-purple-100 text-purple-800 font-bold">DISPUTED BY SELLER</Badge>;
      case "WAIVED":
        return <Badge className="bg-blue-100 text-blue-800 font-bold">WAIVED / REVERSED</Badge>;
      case "REJECTED":
        return <Badge className="bg-slate-200 text-slate-700 font-bold">REJECTED</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Page Header */}
      <BlurFade delay={0.1}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
              <ShieldAlert className="h-7 w-7 text-indigo-600" />
              SLA & Penalty Management
            </h1>
            <p className="text-slate-600 text-sm mt-1 font-medium">
              Configure SLA violation rules, review allegations, resolve disputes, and monitor auditable seller deductions.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setIsRecordModalOpen(true)}
              className="bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-md">
              <Plus className="h-4 w-4 mr-2" />
              Report Violation
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                fetchSummary();
                fetchRules();
                fetchViolations();
              }}
              className="border-slate-200 font-bold">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </BlurFade>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <BlurFade delay={0.15}>
          <MagicCard className="p-6 border-none shadow-md bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Total Violations</span>
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <h3 className="text-3xl font-black text-slate-900">{summary?.totalViolations || 0}</h3>
            <p className="text-xs text-amber-600 font-bold mt-2">
              {summary?.pendingApprovalCount || 0} pending admin review
            </p>
          </MagicCard>
        </BlurFade>

        <BlurFade delay={0.2}>
          <MagicCard className="p-6 border-none shadow-md bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Total Deducted</span>
              <TrendingDown className="h-5 w-5 text-rose-500" />
            </div>
            <h3 className="text-3xl font-black text-slate-900">
              ₹{(summary?.totalDeductedPenalties || 0).toLocaleString()}
            </h3>
            <p className="text-xs text-slate-500 font-bold mt-2">
              Assessed: ₹{(summary?.totalCalculatedPenalties || 0).toLocaleString()}
            </p>
          </MagicCard>
        </BlurFade>

        <BlurFade delay={0.25}>
          <MagicCard className="p-6 border-none shadow-md bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Active Disputes</span>
              <Scale className="h-5 w-5 text-purple-600" />
            </div>
            <h3 className="text-3xl font-black text-purple-900">{summary?.disputedCount || 0}</h3>
            <p className="text-xs text-purple-600 font-bold mt-2">Requires admin resolution</p>
          </MagicCard>
        </BlurFade>

        <BlurFade delay={0.3}>
          <MagicCard className="p-6 border-none shadow-md bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Waived Penalties</span>
              <CheckCircle className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="text-3xl font-black text-slate-900">{summary?.waivedCount || 0}</h3>
            <p className="text-xs text-blue-600 font-bold mt-2">Reversed via compensating ledger</p>
          </MagicCard>
        </BlurFade>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab("violations")}
          className={`pb-3 font-bold text-sm transition-all border-b-2 ${
            activeTab === "violations"
              ? "border-indigo-600 text-indigo-600 font-black"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}>
          Violations & Approvals ({violationsTotal})
        </button>
        <button
          onClick={() => setActiveTab("rules")}
          className={`pb-3 font-bold text-sm transition-all border-b-2 ${
            activeTab === "rules"
              ? "border-indigo-600 text-indigo-600 font-black"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}>
          SLA Rule Configuration ({(Array.isArray(rules) ? rules.length : 0)})
        </button>
      </div>

      {/* TAB 1: VIOLATIONS */}
      {activeTab === "violations" && (
        <BlurFade delay={0.35}>
          <Card className="border-none shadow-xl bg-white p-6">
            {/* Filters Toolbar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search by ID or reason..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 text-xs font-semibold rounded-lg bg-slate-50"
                  />
                </div>
                <select
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                  className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                  <option value="">All Categories</option>
                  <option value="ACCEPTANCE_DELAY">Acceptance Delay</option>
                  <option value="DISPATCH_DELAY">Dispatch Delay</option>
                  <option value="POST_ACCEPTANCE_CANCEL">Post-Acceptance Cancel</option>
                  <option value="EXPIRED_PRODUCT">Expired Product</option>
                  <option value="DEFECTIVE_WRONG_ITEM">Defective / Wrong Item</option>
                  <option value="FAKE_UNACCEPTED_SUPPLY">Fake / Counterfeit</option>
                </select>

                <select
                  value={selectedStatusFilter}
                  onChange={(e) => setSelectedStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                  <option value="">All Statuses</option>
                  <option value="PENDING_APPROVAL">Pending Approval</option>
                  <option value="APPROVED">Approved</option>
                  <option value="DISPUTED">Disputed</option>
                  <option value="WAIVED">Waived</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
            </div>

            {/* Violations Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-xs font-black text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Violation ID</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Order / Seller</th>
                    <th className="px-4 py-3">Penalty</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 font-bold text-slate-400">
                        Loading SLA violations...
                      </td>
                    </tr>
                  ) : !Array.isArray(violations) || violations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 font-bold text-slate-400">
                        No SLA violations match the current filter.
                      </td>
                    </tr>
                  ) : (
                    (Array.isArray(violations) ? violations : []).map((v) => (
                      <tr key={v._id} className="hover:bg-slate-50/80 transition-all">
                        <td className="px-4 py-4 font-black text-slate-900">{v.violationId}</td>
                        <td className="px-4 py-4">
                          <span className="px-2 py-1 bg-slate-100 rounded text-[10px] font-black uppercase text-slate-700">
                            {v.category?.replace(/_/g, " ") || "VIOLATION"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-bold text-slate-900">
                            Order #{v.orderSnapshot?.orderId || v.orderId?.orderId || "N/A"}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {v.sellerId?.shopName || v.sellerId?.name || "Seller"}
                          </p>
                        </td>
                        <td className="px-4 py-4 font-black text-rose-600 text-sm">
                          ₹{v.calculatedPenalty}
                        </td>
                        <td className="px-4 py-4">{getStatusBadge(v.status)}</td>
                        <td className="px-4 py-4 text-slate-500 font-bold">
                          {new Date(v.createdAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Button
                            onClick={() => {
                              setSelectedViolation(v);
                              setActionReason("");
                              setIsDetailModalOpen(true);
                            }}
                            variant="outline"
                            className="h-8 px-3 text-xs font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Review
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {violationsTotal > 0 && (
              <div className="mt-6 border-t pt-4">
                <Pagination
                  page={violationsPage}
                  totalPages={violationsTotalPages}
                  total={violationsTotal}
                  pageSize={15}
                  onPageChange={(p) => setViolationsPage(p)}
                />
              </div>
            )}
          </Card>
        </BlurFade>
      )}

      {/* TAB 2: SLA RULES CONFIGURATION */}
      {activeTab === "rules" && (
        <BlurFade delay={0.35}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(Array.isArray(rules) ? rules : []).map((rule) => (
              <Card key={rule._id} className="p-6 border-none shadow-md bg-white flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <Badge variant="outline" className="text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border-indigo-200">
                      Version {rule.version}
                    </Badge>
                    <Badge className={rule.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>
                      {rule.isActive ? "ACTIVE" : "DISABLED"}
                    </Badge>
                  </div>
                  <h3 className="font-black text-slate-900 text-base mb-1">{rule.title}</h3>
                  <p className="text-xs text-slate-500 font-medium mb-4 leading-relaxed">{rule.description}</p>

                  <div className="space-y-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100 mb-4">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-bold">Formula:</span>
                      <span className="font-black text-slate-900">{rule.formulaType}</span>
                    </div>
                    {rule.formulaType !== "PERCENTAGE" && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-bold">Fixed Penalty:</span>
                        <span className="font-black text-indigo-600">₹{rule.fixedAmount}</span>
                      </div>
                    )}
                    {rule.formulaType !== "FIXED" && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-bold">Percentage:</span>
                        <span className="font-black text-indigo-600">{rule.percentage}%</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-bold">Max Cap:</span>
                      <span className="font-bold text-slate-700">{rule.maxPenaltyAmount ? `₹${rule.maxPenaltyAmount}` : "None"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-bold">Grace Period:</span>
                      <span className="font-bold text-slate-700">{rule.gracePeriodMinutes} mins</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-bold">Admin Approval:</span>
                      <span className={`font-black ${rule.requiresAdminApproval ? "text-amber-600" : "text-emerald-600"}`}>
                        {rule.requiresAdminApproval ? "REQUIRED" : "AUTO-DEDUCT"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <Button
                    onClick={() => {
                      setEditingRule({ ...rule });
                      setIsRuleModalOpen(true);
                    }}
                    className="flex-1 text-xs font-bold bg-slate-900 text-white hover:bg-slate-800">
                    <Edit className="h-3.5 w-3.5 mr-1" />
                    Configure Rule
                  </Button>
                  <Button
                    onClick={() => setRuleHistoryModal(rule)}
                    variant="outline"
                    className="text-xs font-bold border-slate-200">
                    <History className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </BlurFade>
      )}

      {/* MODAL: RULE EDIT FORM */}
      <Modal isOpen={isRuleModalOpen} onClose={() => setIsRuleModalOpen(false)} title="Configure SLA Rule">
        {editingRule && (
          <form onSubmit={handleUpdateRule} className="space-y-4 text-xs font-bold text-slate-700">
            <div>
              <label className="block mb-1">Rule Title</label>
              <Input
                value={editingRule.title}
                onChange={(e) => setEditingRule({ ...editingRule, title: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block mb-1">Description</label>
              <textarea
                className="w-full p-2 border rounded-lg text-xs font-medium"
                rows={2}
                value={editingRule.description}
                onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1">Formula Type</label>
                <select
                  value={editingRule.formulaType}
                  onChange={(e) => setEditingRule({ ...editingRule, formulaType: e.target.value })}
                  className="w-full p-2 border rounded-lg text-xs font-bold bg-white">
                  <option value="FIXED">FIXED</option>
                  <option value="PERCENTAGE">PERCENTAGE</option>
                  <option value="COMBINED">COMBINED (Fixed + %)</option>
                </select>
              </div>
              <div>
                <label className="block mb-1">Fixed Amount (₹)</label>
                <Input
                  type="number"
                  value={editingRule.fixedAmount}
                  onChange={(e) => setEditingRule({ ...editingRule, fixedAmount: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1">Percentage (%)</label>
                <Input
                  type="number"
                  value={editingRule.percentage}
                  onChange={(e) => setEditingRule({ ...editingRule, percentage: e.target.value })}
                />
              </div>
              <div>
                <label className="block mb-1">Max Penalty Cap (₹)</label>
                <Input
                  type="number"
                  placeholder="Leave empty for unlimited"
                  value={editingRule.maxPenaltyAmount ?? ""}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      maxPenaltyAmount: e.target.value === "" ? null : e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1">Grace Period (Minutes)</label>
                <Input
                  type="number"
                  value={editingRule.gracePeriodMinutes}
                  onChange={(e) => setEditingRule({ ...editingRule, gracePeriodMinutes: e.target.value })}
                />
              </div>
              <div>
                <label className="block mb-1">Dispute Window (Days)</label>
                <Input
                  type="number"
                  value={editingRule.disputeWindowDays}
                  onChange={(e) => setEditingRule({ ...editingRule, disputeWindowDays: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-6 py-2 border-y border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingRule.requiresAdminApproval}
                  onChange={(e) => setEditingRule({ ...editingRule, requiresAdminApproval: e.target.checked })}
                />
                Require Admin Approval
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingRule.isActive}
                  onChange={(e) => setEditingRule({ ...editingRule, isActive: e.target.checked })}
                />
                Rule Active
              </label>
            </div>

            <div>
              <label className="block mb-1">Reason for Update (Audit Log)</label>
              <Input
                placeholder="E.g. Adjusted penalty for festival season"
                value={editingRule.changeReason || ""}
                onChange={(e) => setEditingRule({ ...editingRule, changeReason: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <Button type="button" variant="outline" onClick={() => setIsRuleModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={actionLoading} className="bg-indigo-600 text-white font-bold">
                {actionLoading ? "Saving..." : "Save Rule Version"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL: RULE VERSION HISTORY */}
      <Modal isOpen={Boolean(ruleHistoryModal)} onClose={() => setRuleHistoryModal(null)} title={`Version History: ${ruleHistoryModal?.title}`}>
        <div className="space-y-4 max-h-[400px] overflow-y-auto">
          {!Array.isArray(ruleHistoryModal?.versionHistory) || ruleHistoryModal.versionHistory.length === 0 ? (
            <p className="text-xs text-slate-500 font-bold text-center py-6">No previous versions recorded.</p>
          ) : (
            (Array.isArray(ruleHistoryModal?.versionHistory) ? ruleHistoryModal.versionHistory : []).map((ver, idx) => (
              <div key={idx} className="p-3 bg-slate-50 rounded-lg border text-xs font-semibold space-y-1">
                <div className="flex justify-between font-black text-slate-900">
                  <span>Version {ver.version}</span>
                  <span className="text-slate-500">
                    {new Date(ver.effectiveFrom || ver.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-slate-600 font-bold">
                  Formula: {ver.formulaType} | Fixed: ₹{ver.fixedAmount} | %: {ver.percentage}%
                </p>
                {ver.changeReason && <p className="text-indigo-600 italic">"{ver.changeReason}"</p>}
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* MODAL: VIOLATION DETAIL & ACTION REVIEW */}
      <Modal isOpen={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)} title={`Violation Review: ${selectedViolation?.violationId}`}>
        {selectedViolation && (
          <div className="space-y-5 text-xs font-semibold text-slate-800">
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-500 block">Category</span>
                <span className="font-black text-slate-900 text-sm">{selectedViolation.category.replace(/_/g, " ")}</span>
              </div>
              <div>{getStatusBadge(selectedViolation.status)}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-rose-50 rounded-lg border border-rose-100">
                <span className="text-[10px] font-black text-rose-600 uppercase">Calculated Penalty</span>
                <p className="text-xl font-black text-rose-700">₹{selectedViolation.calculatedPenalty}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border">
                <span className="text-[10px] font-black text-slate-500 uppercase">Seller</span>
                <p className="font-black text-slate-900">
                  {selectedViolation.sellerId?.shopName || selectedViolation.sellerId?.name || "Seller"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-bold text-slate-900">Description / Reason:</p>
              <p className="p-2.5 bg-slate-50 rounded border text-slate-700 leading-relaxed">
                {selectedViolation.description}
              </p>
            </div>

            {selectedViolation.dispute?.isDisputed && (
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200 space-y-1">
                <p className="font-black text-purple-900 flex items-center gap-1">
                  <Scale className="h-4 w-4" /> Seller Dispute Filed
                </p>
                <p className="text-slate-700 font-medium">"{selectedViolation.dispute.reason}"</p>
                {selectedViolation.dispute.evidenceUrl && (
                  <a
                    href={selectedViolation.dispute.evidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 font-bold underline inline-flex items-center gap-1 mt-1">
                    View Dispute Evidence <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}

            {/* Evidence List */}
            {Array.isArray(selectedViolation?.evidence) && selectedViolation.evidence.length > 0 && (
              <div>
                <p className="font-bold text-slate-900 mb-2">Attached Evidence:</p>
                <div className="flex flex-wrap gap-2">
                  {(Array.isArray(selectedViolation?.evidence) ? selectedViolation.evidence : []).map((ev, i) => (
                    <a
                      key={i}
                      href={ev.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-bold flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" /> Evidence #{i + 1}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Mandatory Reason Input for Actions */}
            <div>
              <label className="block font-bold mb-1">Admin Action Note / Mandatory Waiver Reason</label>
              <textarea
                className="w-full p-2 border rounded-lg text-xs font-medium bg-slate-50"
                rows={2}
                placeholder="Enter notes or reason for waiver/approval/dispute decision..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {selectedViolation.status === "PENDING_APPROVAL" && (
                <>
                  <Button
                    onClick={() => handleApproveViolation(selectedViolation._id)}
                    disabled={actionLoading}
                    className="bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700">
                    Approve & Deduct
                  </Button>
                  <Button
                    onClick={() => handleRejectViolation(selectedViolation._id)}
                    disabled={actionLoading}
                    variant="outline"
                    className="text-xs font-bold border-rose-200 text-rose-700 hover:bg-rose-50">
                    Reject Allegation
                  </Button>
                </>
              )}

              {selectedViolation.status === "DISPUTED" && (
                <>
                  <Button
                    onClick={() => handleResolveDispute(selectedViolation._id, "OVERTURNED")}
                    disabled={actionLoading}
                    className="bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700">
                    Overturn Penalty (Waive)
                  </Button>
                  <Button
                    onClick={() => handleResolveDispute(selectedViolation._id, "UPHELD")}
                    disabled={actionLoading}
                    className="bg-purple-700 text-white font-bold text-xs hover:bg-purple-800">
                    Upheld Penalty
                  </Button>
                </>
              )}

              {selectedViolation.status !== "WAIVED" && (
                <Button
                  onClick={() => handleWaiveViolation(selectedViolation._id)}
                  disabled={actionLoading}
                  variant="outline"
                  className="text-xs font-bold border-blue-200 text-blue-700 hover:bg-blue-50">
                  Waive & Reverse Penalty
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => setIsDetailModalOpen(false)}
                className="ml-auto text-xs font-bold">
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: MANUAL VIOLATION REPORT */}
      <Modal isOpen={isRecordModalOpen} onClose={() => setIsRecordModalOpen(false)} title="Report SLA Violation Manually">
        <form onSubmit={handleRecordManualViolation} className="space-y-4 text-xs font-bold text-slate-700">
          <div>
            <label className="block mb-1">Violation Category</label>
            <select
              value={recordForm.category}
              onChange={(e) => setRecordForm({ ...recordForm, category: e.target.value })}
              className="w-full p-2 border rounded-lg text-xs font-bold bg-white">
              <option value="ACCEPTANCE_DELAY">Acceptance Delay</option>
              <option value="DISPATCH_DELAY">Dispatch Delay</option>
              <option value="POST_ACCEPTANCE_CANCEL">Post-Acceptance Seller Cancellation</option>
              <option value="EXPIRED_PRODUCT">Expired / Near-Expiry Product</option>
              <option value="DEFECTIVE_WRONG_ITEM">Defective / Wrong / Missing Item</option>
              <option value="FAKE_UNACCEPTED_SUPPLY">Fake / Counterfeit Supply</option>
            </select>
          </div>

          <div>
            <label className="block mb-1">Order MongoDB ID or Order Ref ID</label>
            <Input
              placeholder="Enter Order ID"
              value={recordForm.orderId}
              onChange={(e) => setRecordForm({ ...recordForm, orderId: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block mb-1">Seller ID (Optional if order has seller)</label>
            <Input
              placeholder="Optional Seller ID"
              value={recordForm.sellerId}
              onChange={(e) => setRecordForm({ ...recordForm, sellerId: e.target.value })}
            />
          </div>

          <div>
            <label className="block mb-1">Override Penalty Amount (₹) (Optional)</label>
            <Input
              type="number"
              placeholder="Leave empty to use formula calculation"
              value={recordForm.amountOverride}
              onChange={(e) => setRecordForm({ ...recordForm, amountOverride: e.target.value })}
            />
          </div>

          <div>
            <label className="block mb-1">Violation Description / Customer Complaint Details</label>
            <textarea
              className="w-full p-2 border rounded-lg text-xs font-medium"
              rows={3}
              placeholder="Describe evidence or customer complaint details..."
              value={recordForm.description}
              onChange={(e) => setRecordForm({ ...recordForm, description: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button type="button" variant="outline" onClick={() => setIsRecordModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={actionLoading} className="bg-indigo-600 text-white font-bold">
              {actionLoading ? "Processing..." : "Record Violation"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SlaPenaltyManagement;

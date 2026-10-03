import React, { useState, useEffect, useMemo, useCallback } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Pagination from "@shared/components/ui/Pagination";
import { adminApi } from "../services/adminApi";
import { useToast } from "@shared/components/ui/Toast";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  HiOutlineMagnifyingGlass,
  HiOutlineClock,
  HiOutlineShieldExclamation,
  HiOutlineUserGroup,
  HiOutlineArrowPath,
  HiOutlineXMark,
  HiOutlineFunnel,
  HiOutlineArrowDownTray,
  HiOutlineGlobeAlt,
  HiOutlineSparkles,
  HiOutlineInformationCircle,
} from "react-icons/hi2";
import { Loader2 } from "lucide-react";
import { MagicCard } from "@/components/ui/magic-card";
import { BlurFade } from "@/components/ui/blur-fade";

const UserActivity = () => {
  const { showToast } = useToast();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalToday: 0,
    criticalAlertsToday: 0,
    loginsToday: 0,
    rolesCount: { customer: 0, seller: 0, delivery: 0, admin: 0 },
  });

  // Filters state
  const [activeRoleTab, setActiveRoleTab] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  // Timeline Drawer State
  const [selectedUserForTimeline, setSelectedUserForTimeline] = useState(null);
  const [timelineLogs, setTimelineLogs] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const res = await adminApi.getUserActivityStats();
      if (res.data?.success) {
        setStats(res.data.result || {});
      }
    } catch (err) {
      console.error("Failed to fetch activity stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchActivities = useCallback(async (requestedPage = 1) => {
    try {
      setLoading(true);
      const params = {
        page: requestedPage,
        limit: pageSize,
        role: activeRoleTab,
        category: selectedCategory,
        severity: selectedSeverity,
        search: debouncedSearch,
      };
      const res = await adminApi.getUserActivities(params);
      if (res.data?.success) {
        const payload = res.data.result || {};
        setActivities(payload.items || []);
        setTotal(payload.total || 0);
        setPage(payload.page || requestedPage);
      }
    } catch (err) {
      console.error("Failed to fetch user activities:", err);
      showToast("Failed to fetch activity logs", "error");
    } finally {
      setLoading(false);
    }
  }, [pageSize, activeRoleTab, selectedCategory, selectedSeverity, debouncedSearch, showToast]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchActivities(page);
  }, [fetchActivities, page]);

  // Open user timeline drawer
  const handleOpenTimeline = async (userItem) => {
    const identifier = userItem.userCustomId || userItem.userId || userItem.userName;
    setSelectedUserForTimeline(userItem);
    try {
      setTimelineLoading(true);
      const res = await adminApi.getUserTimeline(identifier, { limit: 50 });
      if (res.data?.success) {
        setTimelineLogs(res.data.result || []);
      }
    } catch (err) {
      console.error("Failed to fetch user timeline:", err);
      showToast("Could not load user timeline", "error");
    } finally {
      setTimelineLoading(false);
    }
  };

  // Export CSV function
  const handleExportCSV = () => {
    if (!activities.length) {
      showToast("No activity logs to export", "warning");
      return;
    }
    try {
      const headers = ["Timestamp", "User Name", "Role", "Custom ID", "Action", "Category", "Severity", "Description", "IP Address"];
      const rows = activities.map((item) => [
        `"${new Date(item.createdAt).toLocaleString()}"`,
        `"${item.userName || "System"}"`,
        `"${(item.role || "").toUpperCase()}"`,
        `"${item.userCustomId || item.userId || "N/A"}"`,
        `"${item.action || ""}"`,
        `"${item.category || ""}"`,
        `"${item.severity || ""}"`,
        `"${(item.description || "").replace(/"/g, '""')}"`,
        `"${item.ipAddress || ""}"`,
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `user_activities_${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Exported activity log to CSV", "success");
    } catch (err) {
      showToast("Failed to export logs", "error");
    }
  };

  const roleTabs = [
    { id: "all", label: "All Roles" },
    { id: "customer", label: "Customers" },
    { id: "seller", label: "Sellers" },
    { id: "delivery", label: "Delivery" },
    { id: "admin", label: "Admins" },
  ];

  const categories = ["all", "AUTH", "ORDER", "WISHLIST", "SEARCH", "INVENTORY", "PAYOUT", "PROFILE", "SECURITY", "SYSTEM"];
  const severities = ["all", "INFO", "WARNING", "CRITICAL"];

  const getCategoryBadgeStyle = (category) => {
    switch ((category || "").toUpperCase()) {
      case "SEARCH":
        return "bg-amber-100 text-amber-800 border-amber-300";
      case "WISHLIST":
        return "bg-pink-100 text-pink-800 border-pink-300";
      case "ORDER":
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "AUTH":
        return "bg-indigo-100 text-indigo-800 border-indigo-300";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getSeverityBadge = (severity) => {
    switch ((severity || "").toUpperCase()) {
      case "CRITICAL":
        return <Badge variant="danger" className="bg-rose-50 text-rose-600 border-rose-200 font-black text-[9px] uppercase">Critical</Badge>;
      case "WARNING":
        return <Badge variant="warning" className="bg-amber-50 text-amber-600 border-amber-200 font-black text-[9px] uppercase">Warning</Badge>;
      default:
        return <Badge variant="info" className="bg-sky-50 text-sky-600 border-sky-200 font-black text-[9px] uppercase">Info</Badge>;
    }
  };

  const getRoleBadgeStyle = (role) => {
    switch ((role || "").toLowerCase()) {
      case "admin":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "seller":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "delivery":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "customer":
        return "bg-indigo-100 text-indigo-700 border-indigo-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  return (
    <div className="space-y-6 pb-16 font-['Outfit']">
      {/* Page Header */}
      <BlurFade delay={0.05}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2 tracking-tight">
              User Activity Monitoring
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-brand-100 text-brand-700">
                <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                Live Feed
              </span>
            </h1>
            <p className="text-slate-500 text-sm mt-0.5 font-medium">
              Real-time audit trail, login history, and platform actions across all user roles.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                fetchStats();
                fetchActivities(page);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-sm active:scale-95"
            >
              <HiOutlineArrowPath className={cn("h-4 w-4 text-brand-500", loading && "animate-spin")} />
              Refresh
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-all shadow-md active:scale-95"
            >
              <HiOutlineArrowDownTray className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>
      </BlurFade>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-4">
        <BlurFade delay={0.1}>
          <MagicCard className="p-5 border-none shadow-sm ring-1 ring-slate-100 bg-white group hover:ring-brand-200 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 bg-brand-50 rounded-2xl text-brand-600">
                <HiOutlineClock className="h-6 w-6" />
              </div>
              <span className="text-[10px] font-black text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                24 Hours
              </span>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Actions Today</p>
              <h3 className="text-2xl font-black text-slate-900 mt-0.5">{stats.totalToday || 0}</h3>
            </div>
          </MagicCard>
        </BlurFade>

        <BlurFade delay={0.15}>
          <MagicCard className="p-5 border-none shadow-sm ring-1 ring-slate-100 bg-white group hover:ring-indigo-200 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
                <HiOutlineUserGroup className="h-6 w-6" />
              </div>
              <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Users
              </span>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logins Recorded</p>
              <h3 className="text-2xl font-black text-slate-900 mt-0.5">{stats.loginsToday || 0}</h3>
            </div>
          </MagicCard>
        </BlurFade>

        <BlurFade delay={0.2}>
          <MagicCard className="p-5 border-none shadow-sm ring-1 ring-slate-100 bg-white group hover:ring-rose-200 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 bg-rose-50 rounded-2xl text-rose-600">
                <HiOutlineShieldExclamation className="h-6 w-6" />
              </div>
              <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Critical
              </span>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Security Flags</p>
              <h3 className="text-2xl font-black text-slate-900 mt-0.5">{stats.criticalAlertsToday || 0}</h3>
            </div>
          </MagicCard>
        </BlurFade>
      </div>

      {/* Main Table Container Card */}
      <BlurFade delay={0.3}>
        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl overflow-hidden">
          {/* Role Tabs & Filters Bar */}
          <div className="border-b border-slate-100 bg-slate-50/50 p-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Role Navigation Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
                {roleTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveRoleTab(tab.id);
                      setPage(1);
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap",
                      activeRoleTab === tab.id
                        ? "bg-slate-900 text-white shadow-md shadow-slate-900/10"
                        : "text-slate-600 hover:bg-slate-200/50"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative w-full lg:w-72">
                <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search user, ID, IP or action..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all shadow-sm"
                />
              </div>
            </div>

            {/* Dropdown Filters (Category & Severity) */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200/60 text-xs">
              <div className="flex items-center gap-1.5 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <HiOutlineFunnel className="h-3.5 w-3.5" />
                Filter by:
              </div>

              {/* Category Dropdown */}
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                <span className="text-[10px] font-black text-slate-400 uppercase">Category:</span>
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setPage(1);
                  }}
                  className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer uppercase text-xs"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Severity Dropdown */}
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                <span className="text-[10px] font-black text-slate-400 uppercase">Severity:</span>
                <select
                  value={selectedSeverity}
                  onChange={(e) => {
                    setSelectedSeverity(e.target.value);
                    setPage(1);
                  }}
                  className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer uppercase text-xs"
                >
                  {severities.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {(activeRoleTab !== "all" || selectedCategory !== "all" || selectedSeverity !== "all" || searchTerm) && (
                <button
                  onClick={() => {
                    setActiveRoleTab("all");
                    setSelectedCategory("all");
                    setSelectedSeverity("all");
                    setSearchTerm("");
                    setPage(1);
                  }}
                  className="text-[10px] font-black uppercase text-rose-600 hover:text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md transition-colors"
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>

          {/* Activity Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="py-4 px-6">Timestamp</th>
                  <th className="py-4 px-6">User / Identity</th>
                  <th className="py-4 px-6">Action / Event</th>
                  <th className="py-4 px-6">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="py-20 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <Loader2 className="h-8 w-8 text-brand-600 animate-spin" />
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading activity stream...</p>
                      </div>
                    </td>
                  </tr>
                ) : activities.length > 0 ? (
                  activities.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-50/60 transition-colors group">
                      {/* Timestamp */}
                      <td className="py-4 px-6 font-bold text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <HiOutlineClock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>{new Date(item.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                        </div>
                      </td>

                      {/* User Info */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-700 text-xs uppercase shadow-xs shrink-0">
                            {(item.userName || "U").charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900 truncate capitalize max-w-[140px]">{item.userName || "Guest"}</span>
                              <span className={cn("px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-md border", getRoleBadgeStyle(item.role))}>
                                {item.role}
                              </span>
                            </div>
                            <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
                              ID: {item.userCustomId || item.userId || "N/A"}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Action & Description */}
                      <td className="py-4 px-6">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 text-xs tracking-tight block">{item.action}</span>
                            {item.metadata?.transactionId && (
                              <span className="text-[9px] font-mono bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-black border border-emerald-200">
                                Trans ID: {item.metadata.transactionId}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-medium text-slate-600 mt-0.5 line-clamp-2 max-w-sm">
                            {item.description}
                          </p>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-4 px-6">
                        <span className={cn("px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-md border shadow-2xs", getCategoryBadgeStyle(item.category))}>
                          {item.category}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <HiOutlineInformationCircle className="h-10 w-10 text-slate-300" />
                        <h4 className="text-base font-black text-slate-800 uppercase tracking-tight">No activity logs found</h4>
                        <p className="text-xs font-bold text-slate-400">Try adjusting your role or category filters.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {activities.length > 0 && (
            <div className="p-4 border-t border-slate-100 bg-slate-50/40">
              <Pagination
                page={page}
                totalPages={Math.ceil(total / pageSize) || 1}
                total={total}
                pageSize={pageSize}
                onPageChange={(p) => setPage(p)}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize);
                  setPage(1);
                }}
                loading={loading}
              />
            </div>
          )}
        </Card>
      </BlurFade>

      {/* User Timeline Drawer / Modal */}
      <AnimatePresence>
        {selectedUserForTimeline && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUserForTimeline(null)}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            />

            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative z-10 w-full max-w-md bg-white h-full shadow-2xl flex flex-col font-['Outfit'] border-l border-slate-100"
            >
              {/* Header */}
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <span className="px-2 py-0.5 text-[8px] font-black uppercase tracking-widest bg-brand-500 text-white rounded-md">
                    User Activity Trajectory
                  </span>
                  <h3 className="text-lg font-black mt-1 capitalize leading-tight">
                    {selectedUserForTimeline.userName || "User Profile"}
                  </h3>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                    ID: {selectedUserForTimeline.userCustomId || selectedUserForTimeline.userId || "N/A"}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedUserForTimeline(null)}
                  className="p-2 text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                >
                  <HiOutlineXMark className="h-5 w-5" />
                </button>
              </div>

              {/* Timeline Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {timelineLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="h-8 w-8 text-brand-600 animate-spin" />
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Building Timeline...</p>
                  </div>
                ) : timelineLogs.length > 0 ? (
                  <div className="relative pl-6 border-l-2 border-slate-100 space-y-6">
                    {timelineLogs.map((log, index) => (
                      <div key={log._id || index} className="relative group">
                        {/* Bullet Marker */}
                        <div
                          className={cn(
                            "absolute -left-[31px] top-0.5 h-4 w-4 rounded-full border-2 border-white shadow-sm flex items-center justify-center",
                            log.severity === "CRITICAL"
                              ? "bg-rose-500"
                              : log.severity === "WARNING"
                              ? "bg-amber-500"
                              : "bg-brand-500"
                          )}
                        />

                        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-900 uppercase tracking-wide">
                              {log.action}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400">
                              {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>

                          <p className="text-xs text-slate-600 font-medium leading-relaxed">
                            {log.description}
                          </p>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-200/50 text-[10px] text-slate-400 font-mono">
                            <span>Category: {log.category}</span>
                            <span>IP: {log.ipAddress || "0.0.0.0"}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase">
                    No timeline history recorded.
                  </div>
                )}
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50">
                <button
                  onClick={() => setSelectedUserForTimeline(null)}
                  className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-all"
                >
                  Close Timeline
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserActivity;

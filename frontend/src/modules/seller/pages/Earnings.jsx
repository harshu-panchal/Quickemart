import React, { useState } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import {
  TrendingUp,
  BarChart3,
  IndianRupee,
  Download,
  Banknote,
  ArrowDownToLine,
  Building2,
  ShieldAlert,
  Clock,
  CheckCircle,
  AlertCircle,
  Receipt,
  Scale,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

import { MagicCard } from "@/components/ui/magic-card";
import { BlurFade } from "@/components/ui/blur-fade";
import ShimmerButton from "@/components/ui/shimmer-button";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { exportToCSV } from "@/lib/exportUtils";
import { useSellerEarnings } from "../context/SellerEarningsContext";
import PenaltyDisputeModal from "../components/PenaltyDisputeModal";
import Pagination from "@shared/components/ui/Pagination";

const Earnings = () => {
  const navigate = useNavigate();
  const { earningsData: data, earningsLoading: loading, refreshEarnings } = useSellerEarnings();
  const [selectedPenaltyForDispute, setSelectedPenaltyForDispute] = useState(null);
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);

  // Pagination for Penalties & Payouts
  const [penaltyPage, setPenaltyPage] = useState(1);
  const [payoutPage, setPayoutPage] = useState(1);
  const pageSize = 5;

  const totalEarnings = Number(data?.balances?.totalEarnings ?? data?.balances?.totalRevenue ?? 0);
  const totalDeductions = Number(data?.balances?.totalDeductions ?? 0);
  const netEarnings = Number(data?.balances?.netEarnings ?? Math.max(0, totalEarnings - totalDeductions));
  const availableForPayout = Number(data?.balances?.availableForPayout ?? data?.balances?.availableBalance ?? data?.balances?.settledBalance ?? 0);
  const pendingSettlement = Number(data?.balances?.pendingSettlement ?? data?.balances?.onHoldBalance ?? 0);

  const penalties = Array.isArray(data?.penalties) ? data.penalties : [];
  const payouts = Array.isArray(data?.payouts) ? data.payouts : [];

  const paginatedPenalties = penalties.slice((penaltyPage - 1) * pageSize, penaltyPage * pageSize);
  const paginatedPayouts = payouts.slice((payoutPage - 1) * pageSize, payoutPage * pageSize);

  const getPenaltyStatusBadge = (status) => {
    switch (status) {
      case "APPROVED":
        return <Badge variant="destructive" className="bg-rose-100 text-rose-800 font-bold">DEDUCTED</Badge>;
      case "PENDING_APPROVAL":
        return <Badge variant="warning" className="bg-amber-100 text-amber-800 font-bold">UNDER REVIEW</Badge>;
      case "DISPUTED":
        return <Badge className="bg-purple-100 text-purple-800 font-bold">DISPUTED</Badge>;
      case "WAIVED":
        return <Badge className="bg-blue-100 text-blue-800 font-bold">WAIVED / REFUNDED</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen font-black text-slate-600">
        LOADING SELLER EARNINGS & DEDUCTIONS...
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Top Bar / Header */}
      <BlurFade delay={0.1}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Seller Earnings & Settlement Dashboard
            </h2>
            <p className="text-slate-600 text-sm font-medium mt-0.5">
              Auditable financial summary, SLA deductions, payouts, and dispute submissions.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              onClick={() => {
                const ledger = Array.isArray(data?.ledger) ? data.ledger : [];
                if (ledger.length === 0 && penalties.length === 0) {
                  toast.info("No financial records to export.");
                  return;
                }
                exportToCSV(
                  ledger.map((txn) => ({
                    id: txn.id ?? txn.ref ?? "",
                    type: txn.type ?? "",
                    amount: `₹${Number(txn.amount ?? 0).toLocaleString()}`,
                    status: txn.status ?? "",
                    date: txn.date ?? "",
                    customer: txn.customer ?? "",
                    ref: txn.ref ?? "",
                  })),
                  "Seller_Earnings_Report"
                );
                toast.success("Earnings report downloaded successfully!");
              }}
              variant="outline"
              className="border-slate-200 font-bold">
              <Download className="mr-2 h-4 w-4" />
              Export Report
            </Button>
            <ShimmerButton
              onClick={() => navigate("/seller/withdrawals")}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg">
              <span className="text-white">Request Payout</span>
            </ShimmerButton>
          </div>
        </div>
      </BlurFade>

      {/* Five Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Total Earnings */}
        <BlurFade delay={0.15}>
          <MagicCard className="p-5 border-none shadow-md bg-white flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider">Total Earnings</span>
              <IndianRupee className="h-5 w-5 text-indigo-600" />
            </div>
            <h3 className="text-2xl font-black text-slate-900">₹{totalEarnings.toLocaleString()}</h3>
            <p className="text-[11px] text-slate-500 font-bold mt-2">Gross revenue from orders</p>
          </MagicCard>
        </BlurFade>

        {/* 2. Total Deductions */}
        <BlurFade delay={0.2}>
          <MagicCard className="p-5 border-none shadow-md bg-white flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-rose-600">Total Deductions</span>
              <ShieldAlert className="h-5 w-5 text-rose-600" />
            </div>
            <h3 className="text-2xl font-black text-rose-600">₹{totalDeductions.toLocaleString()}</h3>
            <p className="text-[11px] text-rose-600 font-bold mt-2">Approved SLA penalties</p>
          </MagicCard>
        </BlurFade>

        {/* 3. Net Earnings */}
        <BlurFade delay={0.25}>
          <MagicCard className="p-5 border-none shadow-md bg-white flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600">Net Earnings</span>
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <h3 className="text-2xl font-black text-emerald-700">₹{netEarnings.toLocaleString()}</h3>
            <p className="text-[11px] text-emerald-600 font-bold mt-2">Earnings after deductions</p>
          </MagicCard>
        </BlurFade>

        {/* 4. Available for Payout */}
        <BlurFade delay={0.3}>
          <MagicCard className="p-5 border-none shadow-md bg-white flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">Available Payout</span>
              <Banknote className="h-5 w-5 text-indigo-600" />
            </div>
            <h3 className="text-2xl font-black text-indigo-900">₹{availableForPayout.toLocaleString()}</h3>
            <p className="text-[11px] text-indigo-600 font-bold mt-2">Ready for withdrawal</p>
          </MagicCard>
        </BlurFade>

        {/* 5. Pending Settlement */}
        <BlurFade delay={0.35}>
          <MagicCard className="p-5 border-none shadow-md bg-white flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-600">Pending Hold</span>
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <h3 className="text-2xl font-black text-amber-900">₹{pendingSettlement.toLocaleString()}</h3>
            <p className="text-[11px] text-amber-600 font-bold mt-2">Return window holding</p>
          </MagicCard>
        </BlurFade>
      </div>

      {/* Monthly Chart */}
      <BlurFade delay={0.4}>
        <Card className="p-6 border-none shadow-md bg-white">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              Monthly Revenue & Performance
            </h3>
          </div>
          <div className="h-[280px] w-full min-h-[200px] flex items-center justify-center">
            {(Array.isArray(data?.monthlyChart) ? data.monthlyChart : []).length === 0 ? (
              <p className="text-slate-500 text-sm font-bold">No monthly revenue data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlyChart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }}
                    tickFormatter={(val) => `₹${val}`}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                    formatter={(val) => [`₹${val.toLocaleString()}`, "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={36} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </BlurFade>

      {/* Itemized SLA Penalty History Section */}
      <BlurFade delay={0.45}>
        <Card className="border-none shadow-md bg-white p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rose-600" />
                Itemized SLA Deductions & Penalty History
              </h3>
              <p className="text-slate-500 text-xs font-medium mt-0.5">
                Review assessed penalties, check dispute status, or submit appeals with supporting evidence.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-black uppercase tracking-wider">
                  <th className="px-4 py-3">Violation ID</th>
                  <th className="px-4 py-3">Category / Reason</th>
                  <th className="px-4 py-3">Order Ref</th>
                  <th className="px-4 py-3">Penalty Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                {!Array.isArray(penalties) || penalties.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-400 font-bold">
                      No SLA penalties recorded for your seller account. Great job maintaining high service standards!
                    </td>
                  </tr>
                ) : (
                  paginatedPenalties.map((pen) => (
                    <tr key={pen.id} className="hover:bg-slate-50 transition-all">
                      <td className="px-4 py-4 font-black text-slate-900">{pen.violationId}</td>
                      <td className="px-4 py-4">
                        <p className="font-black text-slate-900">{pen.category?.replace(/_/g, " ")}</p>
                        <p className="text-[11px] text-slate-500 truncate max-w-xs">{pen.description}</p>
                      </td>
                      <td className="px-4 py-4 font-bold text-slate-900">{pen.orderRef}</td>
                      <td className="px-4 py-4 font-black text-rose-600 text-sm">₹{pen.appliedPenalty || pen.calculatedPenalty}</td>
                      <td className="px-4 py-4">{getPenaltyStatusBadge(pen.status)}</td>
                      <td className="px-4 py-4 text-slate-500 font-bold">{pen.date}</td>
                      <td className="px-4 py-4 text-right">
                        <Button
                          onClick={() => {
                            setSelectedPenaltyForDispute(pen);
                            setIsDisputeModalOpen(true);
                          }}
                          variant="outline"
                          className="h-8 px-3 text-xs font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                          <Scale className="h-3.5 w-3.5 mr-1" />
                          {pen.dispute?.isDisputed ? "View Dispute" : "Details & Dispute"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {Array.isArray(penalties) && penalties.length > pageSize && (
            <div className="mt-4 border-t pt-4">
              <Pagination
                page={penaltyPage}
                totalPages={Math.ceil((penalties?.length || 0) / pageSize)}
                total={penalties?.length || 0}
                pageSize={pageSize}
                onPageChange={(p) => setPenaltyPage(p)}
              />
            </div>
          )}
        </Card>
      </BlurFade>

      {/* Payout History Section */}
      <BlurFade delay={0.5}>
        <Card className="border-none shadow-md bg-white p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Receipt className="h-5 w-5 text-indigo-600" />
                Seller Payout & Settlement History
              </h3>
              <p className="text-slate-500 text-xs font-medium mt-0.5">
                Traceable list of all bank payouts generated and settled for your account.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-black uppercase tracking-wider">
                  <th className="px-4 py-3">Payout Ref</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Orders Included</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                {!Array.isArray(payouts) || payouts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-slate-400 font-bold">
                      No payout records yet.
                    </td>
                  </tr>
                ) : (
                  paginatedPayouts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-all">
                      <td className="px-4 py-4 font-black text-slate-900">PAY-{String(p.id).slice(-8)}</td>
                      <td className="px-4 py-4 font-black text-indigo-600 text-sm">₹{p.amount?.toLocaleString()}</td>
                      <td className="px-4 py-4 font-bold text-slate-700">{p.orderCount} order(s)</td>
                      <td className="px-4 py-4">
                        <Badge variant={p.status === "COMPLETED" ? "success" : "warning"} className="font-bold">
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-slate-500 font-bold">{p.date}</td>
                      <td className="px-4 py-4 text-slate-600">{p.remarks}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {Array.isArray(payouts) && payouts.length > pageSize && (
            <div className="mt-4 border-t pt-4">
              <Pagination
                page={payoutPage}
                totalPages={Math.ceil((payouts?.length || 0) / pageSize)}
                total={payouts?.length || 0}
                pageSize={pageSize}
                onPageChange={(p) => setPayoutPage(p)}
              />
            </div>
          )}
        </Card>
      </BlurFade>

      {/* Modal for Penalty Details & Dispute */}
      <PenaltyDisputeModal
        penalty={selectedPenaltyForDispute}
        isOpen={isDisputeModalOpen}
        onClose={() => setIsDisputeModalOpen(false)}
        onDisputeSubmitted={() => {
          refreshEarnings();
        }}
      />
    </div>
  );
};

export default Earnings;

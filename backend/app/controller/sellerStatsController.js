import Order from "../models/order.js";
import Transaction from "../models/transaction.js";
import handleResponse from "../utils/helper.js";
import mongoose from "mongoose";
import Wallet from "../models/wallet.js";
import SlaViolation from "../models/slaViolation.js";
import Payout from "../models/payout.js";
import LedgerEntry from "../models/ledgerEntry.js";
import { getSellerStats as getSellerStatsFromService } from "../services/seller/sellerStatsService.js";

/* ===============================
   GET SELLER DASHBOARD STATS
   Delegates to SellerStatsService (P6.2 — cache-fronted) so the heavy
   $facet aggregation + category pipeline are absorbed for ~60s.
================================ */
export const getSellerStats = async (req, res) => {
    try {
        const result = await getSellerStatsFromService(req.user.id, {
            range: req.query?.range,
        });
        return handleResponse(res, 200, "Stats fetched successfully", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET SELLER EARNINGS / TRANSACTIONS
================================ */
export const getSellerEarnings = async (req, res) => {
    try {
        const sellerId = req.user.id;
        const sellerOid = new mongoose.Types.ObjectId(sellerId);

        const [transactions, violations, payouts] = await Promise.all([
            Transaction.find({ user: sellerId, userModel: 'Seller' })
                .sort({ createdAt: -1 })
                .populate("order", "orderId"),
            SlaViolation.find({
                $or: [
                    ...(sellerOid ? [{ sellerId: sellerOid }] : []),
                    { sellerId: String(sellerId) }
                ]
            })
                .sort({ createdAt: -1 })
                .populate("orderId", "orderId")
                .lean(),
            Payout.find({ beneficiaryId: sellerId, payoutType: 'SELLER' })
                .sort({ createdAt: -1 })
                .lean(),
        ]);

        const settledBalance = transactions
            .filter(t => t.status === 'Settled')
            .reduce((acc, t) => acc + t.amount, 0);

        const pendingPayouts = transactions
            .filter(t => t.type === 'Withdrawal' && (t.status === 'Pending' || t.status === 'Processing'))
            .reduce((acc, t) => acc + Math.abs(t.amount), 0);

        // Fetch wallet for live pending balance (money on hold due to return window)
        const wallet = await Wallet.findOne({ ownerType: 'SELLER', ownerId: sellerId });
        const onHoldBalance = wallet ? wallet.pendingBalance : 0;
        const liveAvailableBalance = wallet ? wallet.availableBalance : settledBalance;

        // Keep "Total Revenue" aligned with Dashboard definition:
        // sum of non-cancelled seller orders from Order collection.
        const [orderRevenueAgg] = await Order.aggregate([
            {
                $match: {
                    seller: sellerOid,
                    status: { $ne: 'cancelled' },
                },
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: { $ifNull: ["$paymentBreakdown.sellerPayoutTotal", { $ifNull: ["$sellerPayout", "$pricing.total"] }] } },
                },
            },
        ]);
        const totalRevenue = Number(orderRevenueAgg?.totalRevenue || 0);

        const totalWithdrawn = transactions
            .filter(t => t.type === 'Withdrawal' && t.status === 'Settled')
            .reduce((acc, t) => acc + Math.abs(t.amount), 0);

        // Calculate Total SLA Deductions
        const totalSlaDeductions = violations
            .filter(v => v.status === 'APPROVED')
            .reduce((acc, v) => acc + (v.appliedPenalty || 0), 0);

        const totalDeductions = totalSlaDeductions;
        const netEarnings = Math.max(0, totalRevenue - totalDeductions);

        // Monthly Revenue Aggregation (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyAggregation = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(sellerId),
                    userModel: 'Seller',
                    type: 'Order Payment',
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                    revenue: { $sum: "$amount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const chartData = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const dateStr = d.toISOString().slice(0, 7);
            const data = monthlyAggregation.find(m => m._id === dateStr);
            chartData.push({
                name: monthNames[d.getMonth()],
                revenue: data ? data.revenue : 0
            });
        }

        const formattedPenalties = violations.map(v => ({
            id: v._id,
            violationId: v.violationId,
            category: v.category,
            orderId: v.orderId?._id || v.orderId,
            orderRef: v.orderSnapshot?.orderId ? `#${v.orderSnapshot.orderId}` : (v.orderId?.orderId ? `#${v.orderId.orderId}` : "N/A"),
            calculatedPenalty: v.calculatedPenalty,
            appliedPenalty: v.appliedPenalty,
            status: v.status,
            description: v.description,
            date: v.createdAt ? new Date(v.createdAt).toISOString().split('T')[0] : "",
            time: v.createdAt ? new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "",
            dispute: v.dispute || {},
        }));

        const formattedPayouts = payouts.map(p => ({
            id: p._id,
            amount: p.amount,
            status: p.status,
            payoutType: p.payoutType,
            processedAt: p.processedAt,
            createdAt: p.createdAt,
            date: p.createdAt ? new Date(p.createdAt).toISOString().split('T')[0] : "",
            remarks: p.remarks || "Regular settlement",
            orderCount: Array.isArray(p.relatedOrderIds) ? p.relatedOrderIds.length : 0,
        }));

        return handleResponse(res, 200, "Earnings fetched successfully", {
            balances: {
                totalEarnings: totalRevenue,
                totalRevenue: totalRevenue,
                totalDeductions: totalDeductions,
                netEarnings: netEarnings,
                availableForPayout: liveAvailableBalance,
                availableBalance: liveAvailableBalance,
                pendingSettlement: onHoldBalance,
                settledBalance: settledBalance,
                pendingPayouts: pendingPayouts,
                onHoldBalance: onHoldBalance,
                totalWithdrawn: totalWithdrawn,
            },
            monthlyChart: chartData,
            penalties: formattedPenalties,
            payouts: formattedPayouts,
            ledger: transactions.map(t => ({
                id: (t.reference || t._id).toString(),
                type: t.type,
                amount: t.amount,
                status: t.status,
                date: t.createdAt ? t.createdAt.toISOString().split('T')[0] : "",
                time: t.createdAt ? t.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "",
                customer: t.type === 'Withdrawal' ? 'Bank Transfer' : 'Customer',
                ref: t.order ? `#${t.order.orderId}` : t.reference || t._id
            }))
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

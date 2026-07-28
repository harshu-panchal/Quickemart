import React from 'react';
import { X, Printer, Store, User, Truck, Clock, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '@core/context/SettingsContext';

const InvoiceModal = ({ isOpen, onClose, order }) => {
    const { settings } = useSettings();
    const appName = settings?.appName || 'QuickeMart';
    const primaryColor = settings?.primaryColor || 'var(--primary, #6366f1)';
    if (!order) return null;

    const subtotal = Number(order.pricing?.subtotal || 0);
    const deliveryFee = Number(order.pricing?.deliveryFee || 0);
    const gstAmount = Number(order.pricing?.gst || 0);
    const tipAmount = Number(order.pricing?.tip || 0);
    const discountAmount = Number(order.pricing?.discount || 0);
    const totalAmount = Number(order.pricing?.total || 0);

    const gstPct = subtotal > 0 && gstAmount > 0
        ? Math.round((gstAmount / subtotal) * 100)
        : (gstAmount > 0 ? 5 : 5);

    // Format date & time cleanly
    const orderDate = order.createdAt
        ? new Date(order.createdAt).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        })
        : "—";

    // Extract seller info
    const sellerName = order.seller?.shopName || order.seller?.name || "QuickeMart Store";
    const sellerPhone = order.seller?.phone || "—";
    const sellerAddress = typeof order.seller?.address === "object"
        ? order.seller?.address?.address || order.seller?.address?.street || "—"
        : String(order.seller?.address || "—");

    // Extract customer info
    const customerName = order.address?.name || order.customer?.name || "Customer";
    const customerPhone = order.address?.phone || order.customer?.phone || "—";
    const customerAddress = order.address?.address || order.address?.fullAddress || "—";

    // Extract delivery partner info
    const deliveryName = order.deliveryBoy?.name || "Assigned Partner";
    const deliveryPhone = order.deliveryBoy?.phone || "—";
    const deliveryVehicle = [order.deliveryBoy?.vehicleType, order.deliveryBoy?.vehicleNumber]
        .filter(Boolean)
        .join(" - ") || "—";

    const items = Array.isArray(order.items) ? order.items : [];

    const handlePrint = () => {
        const printElem = document.getElementById("printable-invoice");
        if (!printElem) return;

        const printWindow = window.open("", "_blank", "width=850,height=950");
        if (!printWindow) {
            window.print();
            return;
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Invoice #${order.orderId || order.id || ''}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                  @page {
                    size: A4 portrait;
                    margin: 8mm;
                  }
                  body {
                    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    background: #ffffff !important;
                    color: #0f172a !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    margin: 0;
                    padding: 10px;
                  }
                </style>
              </head>
              <body>
                ${printElem.outerHTML}
                <script>
                  window.onload = function() {
                    setTimeout(function() {
                      window.print();
                      window.close();
                    }, 400);
                  };
                </script>
              </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
                    />

                    {/* Modal panel — top-anchored with space, scrollable content, sticky print bar */}
                    <div className="fixed inset-0 z-[9999] overflow-y-auto flex justify-center px-3 pb-6 pt-16">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: -16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: -16 }}
                            transition={{ type: "spring", duration: 0.45, bounce: 0.25 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden self-start"
                        >
                            {/* Header row: title + close */}
                            <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0 no-print">
                                <div>
                                    <h2 className="text-base font-black text-slate-800">Tax Invoice</h2>
                                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">#{order.orderId || order.id}</p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 bg-white rounded-full hover:bg-slate-100 transition-colors shadow-sm border border-slate-100"
                                >
                                    <X size={18} className="text-slate-500" />
                                </button>
                            </div>

                            {/* Printable invoice body */}
                            <div className="p-6 md:p-8 space-y-6 text-slate-800 bg-white overflow-y-auto" id="printable-invoice">
                                {/* Header: App Branding + Order Meta */}
                                <div className="flex justify-between items-start pb-4 border-b border-slate-200">
                                    <div>
                                        <h1 className="text-2xl font-black tracking-tight" style={{ color: primaryColor }}>
                                            {appName}
                                        </h1>
                                        <p className="text-xs text-slate-500 mt-0.5">Quick Commerce Platform</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-700 font-extrabold text-[11px] rounded-lg uppercase tracking-wider mb-1">
                                            TAX INVOICE
                                        </span>
                                        <p className="text-xs font-bold text-slate-800">Order ID: #{order.orderId || order.id}</p>
                                        <p className="text-[11px] text-slate-500 flex items-center justify-end gap-1 mt-0.5">
                                            <Clock size={12} className="inline text-slate-400" /> {orderDate}
                                        </p>
                                    </div>
                                </div>

                                {/* Participant Details Grid: Seller, Customer, Delivery */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                    {/* Seller Info */}
                                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                                        <div className="flex items-center gap-1.5 font-bold text-slate-900 mb-1.5 border-b border-slate-200 pb-1">
                                            <Store size={14} className="text-brand-600" />
                                            <span className="uppercase tracking-wider text-[10px]">Seller Details</span>
                                        </div>
                                        <p className="font-bold text-slate-900">{sellerName}</p>
                                        <p className="text-slate-500 leading-snug">{sellerAddress}</p>
                                        <p className="text-slate-500 font-medium">Ph: {sellerPhone}</p>
                                    </div>

                                    {/* User / Customer Info */}
                                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                                        <div className="flex items-center gap-1.5 font-bold text-slate-900 mb-1.5 border-b border-slate-200 pb-1">
                                            <User size={14} className="text-brand-600" />
                                            <span className="uppercase tracking-wider text-[10px]">Customer Details</span>
                                        </div>
                                        <p className="font-bold text-slate-900">{customerName}</p>
                                        <p className="text-slate-500 leading-snug">{customerAddress}</p>
                                        <p className="text-slate-500 font-medium">Ph: {customerPhone}</p>
                                    </div>

                                    {/* Delivery Partner Info */}
                                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                                        <div className="flex items-center gap-1.5 font-bold text-slate-900 mb-1.5 border-b border-slate-200 pb-1">
                                            <Truck size={14} className="text-brand-600" />
                                            <span className="uppercase tracking-wider text-[10px]">Delivery Partner</span>
                                        </div>
                                        <p className="font-bold text-slate-900">{deliveryName}</p>
                                        <p className="text-slate-500 font-medium">Ph: {deliveryPhone}</p>
                                        <p className="text-slate-500 font-medium">Vehicle: {deliveryVehicle}</p>
                                    </div>
                                </div>

                                {/* Items Table */}
                                <div className="border rounded-2xl overflow-hidden border-slate-200">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                                            <tr>
                                                <th className="px-4 py-2.5">#</th>
                                                <th className="px-4 py-2.5">Item Description</th>
                                                <th className="px-4 py-2.5 text-right">Qty</th>
                                                <th className="px-4 py-2.5 text-right">Price</th>
                                                <th className="px-4 py-2.5 text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {items.map((item, idx) => {
                                                const itemName = item.name || item.product?.name || "Product Item";
                                                const qty = Number(item.quantity || item.qty || 1);
                                                const price = Number(item.price || 0);
                                                const itemTotal = qty * price;
                                                return (
                                                    <tr key={idx} className="hover:bg-slate-50/50">
                                                        <td className="px-4 py-2.5 text-slate-400 font-semibold">{idx + 1}</td>
                                                        <td className="px-4 py-2.5 text-slate-900 font-bold">{itemName}</td>
                                                        <td className="px-4 py-2.5 text-slate-600 font-semibold text-right">{qty}</td>
                                                        <td className="px-4 py-2.5 text-slate-600 font-semibold text-right">₹{price}</td>
                                                        <td className="px-4 py-2.5 text-slate-900 font-extrabold text-right">₹{itemTotal}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pricing Breakdown */}
                                <div className="flex flex-col md:flex-row justify-between items-start gap-4 pt-2 border-t border-slate-200">
                                    <div className="text-xs text-slate-500 space-y-1">
                                        <p className="flex items-center gap-1 font-semibold text-slate-700">
                                            <ShieldCheck size={14} className="text-emerald-600" /> Authorized Computer Generated Bill
                                        </p>
                                        <p className="text-[11px] text-slate-400">Payment Mode: {order.paymentMode || order.payment?.method || "COD"}</p>
                                    </div>

                                    <div className="w-full md:w-64 space-y-1.5 text-xs">
                                        <div className="flex justify-between text-slate-600">
                                            <span>Subtotal</span>
                                            <span className="font-bold text-slate-800">₹{subtotal}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-600">
                                            <span>Delivery Fee</span>
                                            <span className="font-bold text-slate-800">
                                                {deliveryFee === 0 ? "FREE" : `₹${deliveryFee}`}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-slate-600">
                                            <span>GST Tax</span>
                                            <span className="font-bold text-slate-800">{gstPct}%</span>
                                        </div>
                                        {tipAmount > 0 && (
                                            <div className="flex justify-between text-slate-600">
                                                <span>Delivery Tip</span>
                                                <span className="font-bold text-slate-800">₹{tipAmount}</span>
                                            </div>
                                        )}
                                        {discountAmount > 0 && (
                                            <div className="flex justify-between text-emerald-600">
                                                <span>Discount</span>
                                                <span className="font-bold">-₹{discountAmount}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-200">
                                            <span>Total Paid</span>
                                            <span className="text-brand-600">₹{totalAmount}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Sticky bottom Print bar */}
                            <div className="flex-shrink-0 bg-white border-t border-slate-100 px-5 py-4 no-print">
                                <button
                                    onClick={handlePrint}
                                    className="w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 text-white shadow-lg shadow-brand-200/40 hover:opacity-90 active:scale-[0.98] transition-all"
                                    style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}
                                >
                                    <Printer size={18} strokeWidth={2.5} />
                                    Print / Download Invoice
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};

export default InvoiceModal;

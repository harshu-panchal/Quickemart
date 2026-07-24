import Product from "../models/product.js";
import StockHistory from "../models/stockHistory.js";
import handleResponse from "../utils/helper.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import {
    createLowStockAlertCandidate,
    isLowStockAlertsEnabled,
} from "../services/lowStockAlertService.js";
import { invalidate, buildKey } from "../services/cacheService.js";

/* ===============================
   ADJUST STOCK MANUALLY
================================ */
export const adjustStock = async (req, res) => {
    try {
        const { productId, type, quantity, note } = req.body;
        const sellerId = req.user.id;

        const product = await Product.findOne({ _id: productId, sellerId });
        if (!product) {
            return handleResponse(res, 404, "Product not found or unauthorized");
        }

        // FIX: Use Math.abs so the Correction type works correctly.
        // The frontend sends `quantity: -value` for Correction, but the backend
        // was doing `product.stock - (-value)` = product.stock + value (double-negative).
        // Now both Restock and Correction work from a positive delta.
        const absChange = Math.abs(Number(quantity));
        const previousStock = Number(product.stock || 0);
        const finalStock = type === 'Restock' ? previousStock + absChange : previousStock - absChange;

        if (finalStock < 0) {
            return handleResponse(res, 400, "Stock cannot be negative");
        }

        // 1. Update root Product stock
        product.stock = finalStock;

        // FIX: Sync variant stock so customer-side totalVariantStock is accurate.
        // Products created via createSellerListing always have variants. If all
        // variant stocks are currently 0 and we are restocking, distribute the new
        // stock evenly across variants so effectiveStock on the customer card > 0.
        if (Array.isArray(product.variants) && product.variants.length > 0) {
            const currentVariantTotal = product.variants.reduce(
                (sum, v) => sum + Number(v.stock || 0),
                0,
            );
            if (type === 'Restock') {
                // Add the restocked amount proportionally (or evenly if all zero)
                const count = product.variants.length;
                if (currentVariantTotal === 0) {
                    // Distribute evenly; give remainder to first variant
                    const perVariant = Math.floor(finalStock / count);
                    const remainder = finalStock % count;
                    product.variants = product.variants.map((v, idx) => ({
                        ...v.toObject ? v.toObject() : v,
                        stock: perVariant + (idx === 0 ? remainder : 0),
                    }));
                } else {
                    // Scale each variant proportionally to the new total
                    product.variants = product.variants.map((v) => ({
                        ...v.toObject ? v.toObject() : v,
                        stock: Math.round((Number(v.stock || 0) / currentVariantTotal) * finalStock),
                    }));
                }
            } else {
                // Correction: reduce variants proportionally (floor each, give remainder to first)
                if (currentVariantTotal > 0 && finalStock >= 0) {
                    const ratio = finalStock / currentVariantTotal;
                    let distributed = 0;
                    const updated = product.variants.map((v) => {
                        const newStock = Math.floor(Number(v.stock || 0) * ratio);
                        distributed += newStock;
                        return { ...v.toObject ? v.toObject() : v, stock: newStock };
                    });
                    // Give any rounding remainder to first variant
                    const diff = finalStock - distributed;
                    if (diff > 0 && updated.length > 0) updated[0].stock += diff;
                    product.variants = updated;
                } else if (finalStock === 0) {
                    product.variants = product.variants.map((v) => ({
                        ...v.toObject ? v.toObject() : v,
                        stock: 0,
                    }));
                }
            }
            product.markModified('variants');
        }

        await product.save();

        // FIX: Invalidate product cache immediately so customers see fresh stock.
        try {
            await invalidate(`cache:catalog:product:${productId}`);
            if (product.slug) {
                await invalidate(`cache:catalog:product:slug-${product.slug.toLowerCase()}`);
            }
            if (product.masterProductId) {
                await invalidate(`cache:catalog:product:${product.masterProductId.toString()}`);
                const master = await Product.db.collection("masterproducts").findOne({ _id: product.masterProductId });
                if (master?.slug) {
                    await invalidate(`cache:catalog:product:slug-${master.slug.toLowerCase()}`);
                }
            }
            await invalidate("cache:catalog:productList:*");
            await invalidate(buildKey("catalog", "productList", "*"));
            await invalidate("cache:sellers:nearby:*");
            await invalidate(buildKey("sellers", "nearby", "*"));
        } catch (_cacheErr) {
            // Non-critical — log silently
        }

        // 2. Create History Entry
        const historyEntry = new StockHistory({
            product: productId,
            seller: sellerId,
            type, // Restock, Correction
            quantity: type === 'Restock' ? absChange : -absChange,
            note: note || `Manual ${type} adjustment`
        });

        await historyEntry.save();

        if (
            type !== 'Restock' &&
            absChange > 0 &&
            await isLowStockAlertsEnabled()
        ) {
            const lowStockAlert = createLowStockAlertCandidate({
                product,
                previousStock,
                currentStock: finalStock,
            });
            if (lowStockAlert) {
                emitNotificationEvent(NOTIFICATION_EVENTS.LOW_STOCK_ALERT, lowStockAlert);
            }
        }

        return handleResponse(res, 200, "Stock adjusted successfully", {
            newStock: product.stock,
            historyEntry
        });

    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   GET STOCK HISTORY LOG
================================ */
export const getStockHistory = async (req, res) => {
    try {
        const sellerId = req.user.id;

        const history = await StockHistory.find({ seller: sellerId })
            .sort({ createdAt: -1 })
            .populate("product", "name sku mainImage");

        return handleResponse(res, 200, "Stock history fetched", history.map(item => ({
            id: item._id,
            productName: item.product?.name || "Deleted Product",
            sku: item.product?.sku || "N/A",
            type: item.type,
            quantity: item.quantity > 0 ? `+${item.quantity}` : `${item.quantity}`,
            date: item.createdAt.toISOString().split('T')[0],
            time: item.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            note: item.note
        })));

    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

import Seller from "../models/seller.js";
import Transaction from "../models/transaction.js";
import { handleResponse, calculateDistance } from "../utils/helper.js";
import mongoose from "mongoose";
import { invalidateSellerName } from "../services/entityNameCache.js";
import { buildKey, invalidate } from "../services/cacheService.js";
import { getShopStatusMeta, isShopCurrentlyOpen } from "../services/shopTimingService.js";

/* ===============================
   GET NEARBY SELLERS
================================ */
export const getNearbySellers = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return handleResponse(res, 400, "Latitude and longitude are required");
    }

    const customerLat = Number(lat);
    const customerLng = Number(lng);

    // Fetch all active/verified sellers
    const sellers = await Seller.find({
      isActive: true,
      isVerified: true,
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [customerLng, customerLat],
          },
          $maxDistance: 100000, // 100km max search area for performance
        },
      },
    }).lean();

    // Filter based on individual service radius and shop timing
    const nearbySellers = sellers.filter((seller) => {
      if (!isShopCurrentlyOpen(seller)) return false;

      const sellerLng = seller.location.coordinates[0];
      const sellerLat = seller.location.coordinates[1];
      const distance = calculateDistance(
        customerLat,
        customerLng,
        sellerLat,
        sellerLng,
      );

      // Add distance to seller object for frontend
      seller.distance = distance;
      seller.shopStatusMeta = getShopStatusMeta(seller);

      return distance <= (seller.serviceRadius || 5);
    });

    return handleResponse(
      res,
      200,
      "Nearby sellers fetched successfully",
      nearbySellers,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REQUEST WITHDRAWAL (Seller)
================================ */
export const requestWithdrawal = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return handleResponse(res, 400, "Please enter a valid amount");
    }

    // 1. Calculate current available balance
    // Consistent with getSellerEarnings logic in sellerStatsController.js
    const transactions = await Transaction.find({
      user: sellerId,
      userModel: "Seller",
    })
      .select("status amount type")
      .lean();

    const settledBalance = transactions
      .filter((t) => t.status === "Settled")
      .reduce((acc, t) => acc + (t.amount || 0), 0);

    const pendingPayouts = transactions
      .filter(
        (t) =>
          t.type === "Withdrawal" &&
          (t.status === "Pending" || t.status === "Processing"),
      )
      .reduce((acc, t) => acc + Math.abs(t.amount || 0), 0);

    const availableBalance = settledBalance - pendingPayouts;

    if (amount > availableBalance) {
      return handleResponse(
        res,
        400,
        `Insufficient balance. Available: ₹${availableBalance}`,
      );
    }

    // 2. Create Withdrawal Transaction
    // Withdrawals have negative amounts per the model comment
    const withdrawal = await Transaction.create({
      user: sellerId,
      userModel: "Seller",
      type: "Withdrawal",
      amount: -Math.abs(amount),
      status: "Pending",
      reference: `WDR-${Date.now()}`,
    });

    return handleResponse(
      res,
      201,
      "Withdrawal request submitted successfully",
      withdrawal,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET SELLER PROFILE
================================ */
export const getSellerProfile = async (req, res) => {
  try {
    const seller = await Seller.findById(req.user.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }
    const sellerObj = seller.toObject();
    sellerObj.shopStatusMeta = getShopStatusMeta(seller);

    return handleResponse(
      res,
      200,
      "Seller profile fetched successfully",
      sellerObj,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE SELLER PROFILE
================================ */
export const updateSellerProfile = async (req, res) => {
  try {
    const {
      name,
      shopName,
      phone,
      alternativePhone,
      address,
      locality,
      pincode,
      city,
      state,
      lat,
      lng,
      radius,
      isActive,
      shopTiming,
    } = req.body;

    // Find seller
    const seller = await Seller.findById(req.user.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    // Update fields if provided
    if (name) seller.name = name;
    if (shopName) seller.shopName = shopName;
    if (phone) seller.phone = phone;
    if (alternativePhone !== undefined) seller.alternativePhone = alternativePhone;
    if (address !== undefined) seller.address = address;
    if (locality !== undefined) seller.locality = locality;
    if (pincode !== undefined) seller.pincode = pincode;
    if (city !== undefined) seller.city = city;
    if (state !== undefined) seller.state = state;
    if (isActive !== undefined) seller.isActive = isActive;

    let timingChanged = false;
    if (shopTiming && typeof shopTiming === "object") {
      if (!seller.shopTiming) {
        seller.shopTiming = { openingTime: "08:00", closingTime: "20:00", isTimingEnabled: true, manualOverride: "auto" };
      }

      if (shopTiming.openingTime !== undefined) {
        if (!/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.test(String(shopTiming.openingTime).trim())) {
          return handleResponse(res, 400, "Invalid opening time format. Use HH:mm (e.g. 08:00)");
        }
        seller.shopTiming.openingTime = String(shopTiming.openingTime).trim();
        timingChanged = true;
      }

      if (shopTiming.closingTime !== undefined) {
        if (!/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.test(String(shopTiming.closingTime).trim())) {
          return handleResponse(res, 400, "Invalid closing time format. Use HH:mm (e.g. 20:00)");
        }
        seller.shopTiming.closingTime = String(shopTiming.closingTime).trim();
        timingChanged = true;
      }

      if (shopTiming.isTimingEnabled !== undefined) {
        seller.shopTiming.isTimingEnabled = Boolean(shopTiming.isTimingEnabled);
        timingChanged = true;
      }

      if (shopTiming.manualOverride !== undefined) {
        if (!["auto", "open", "closed"].includes(shopTiming.manualOverride)) {
          return handleResponse(res, 400, "Invalid manual override option. Allowed: auto, open, closed");
        }
        seller.shopTiming.manualOverride = shopTiming.manualOverride;
        timingChanged = true;
      }
    }

    // Validate and update geo data
    if (lat !== undefined && lng !== undefined) {
      if (lat < -90 || lat > 90)
        return handleResponse(res, 400, "Invalid latitude");
      if (lng < -180 || lng > 180)
        return handleResponse(res, 400, "Invalid longitude");

      seller.location = {
        type: "Point",
        coordinates: [Number(lng), Number(lat)],
      };
    }

    if (radius !== undefined) {
      if (radius < 1 || radius > 100)
        return handleResponse(res, 400, "Radius must be between 1 and 100 km");
      seller.serviceRadius = Number(radius);
    }

    const updatedSeller = await seller.save();

    // Invalidate cached seller name in case shopName changed
    invalidateSellerName(req.user.id).catch((err) => {
      console.warn("[Seller] Name cache invalidation failed:", err.message);
    });

    if (isActive !== undefined || timingChanged || radius !== undefined || (lat !== undefined && lng !== undefined)) {
      Promise.all([
        invalidate(buildKey("sellers", "nearby", "*")),
        invalidate(buildKey("catalog", "productList", "*")),
        invalidate(buildKey("experience", "public", "*")),
        invalidate(buildKey("offersections", "public", "*")),
      ]).catch((err) => {
        console.warn("[Seller] Nearby/catalog/homepage cache invalidation failed:", err.message);
      });
    }

    const resObj = updatedSeller.toObject();
    resObj.shopStatusMeta = getShopStatusMeta(updatedSeller);

    return handleResponse(
      res,
      200,
      "Profile updated successfully",
      resObj,
    );
  } catch (error) {
    // Handle duplicate phone error
    if (error.code === 11000) {
      return handleResponse(res, 400, "Phone number already in use");
    }
    return handleResponse(res, 500, error.message);
  }
};

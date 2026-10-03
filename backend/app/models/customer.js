import mongoose from "mongoose";
import { normalizePhoneNumber } from "../utils/phone.js";
import crypto from "crypto";

/**
 * Generates a 15-character alphanumeric customer ID.
 * Format: CUS + 12 random uppercase alphanumeric chars
 * Example: CUS8F3K9LMTPX2A
 */
function generateCustomerId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const randomPart = Array.from({ length: 12 }, () =>
    chars[crypto.randomInt(0, chars.length)]
  ).join("");
  return `CUS${randomPart}`;
}

const addressSchema = new mongoose.Schema({
    label: {
        type: String,
        enum: ["home", "work", "other"],
        default: "home",
    },
    fullAddress: {
        type: String,
        required: true,
    },
    formattedAddress: String,
    placeId: String,
    landmark: String,
    city: String,
    state: String,
    pincode: String,
    location: {
        lat: Number,
        lng: Number,
    },
});

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            trim: true,
        },

        email: {
            type: String,
            lowercase: true,
            unique: true,
            sparse: true, // phone login users ke liye
        },

        phone: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        password: {
            type: String,
            select: false, // response me password na aaye
        },

        role: {
            type: String,
            enum: ["user", "admin", "delivery", "seller"],
            default: "user",
        },

        /**
         * Human-readable 15-character unique customer identifier.
         * Auto-generated on first save. Format: CUS + 12 alphanumeric chars.
         * Visible to sellers instead of the Mongo _id (privacy layer).
         */
        customerId: {
            type: String,
            unique: true,
            sparse: true, // existing users without it are not affected
            index: true,
        },

        isVerified: {
            type: Boolean,
            default: false,
        },

        otp: {
            type: String,
            select: false,
        },

        otpExpiry: {
            type: Date,
            select: false,
        },

        otpHash: {
            type: String,
            select: false,
        },

        otpExpiresAt: {
            type: Date,
            select: false,
        },

        otpFailedAttempts: {
            type: Number,
            default: 0,
            select: false,
        },

        otpLockedUntil: {
            type: Date,
            select: false,
        },

        otpLastSentAt: {
            type: Date,
            select: false,
        },

        otpSessionVersion: {
            type: Number,
            default: 0,
            select: false,
        },

        addresses: [addressSchema],

        /**
         * @deprecated Phase 4 (P4-7). Use the canonical
         * `Wallet({ownerType:"CUSTOMER", ownerId:<userId>}).availableBalance`
         * via `walletService.getCustomerBalance(userId)` instead.
         *
         * This field remains as a denormalised read-cache for
         * frontend backwards compatibility. Every Wallet credit / debit
         * for a customer now $inc's this field in the same Mongo session
         * (Phase 4 P4-3) so the two stay aligned. Will be removed in
         * Phase 7 after every read site has migrated.
         */
        walletBalance: {
            type: Number,
            default: 0,
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        bio: {
            type: String,
            trim: true,
            default: "",
        },

        lastLogin: Date,
    },
    {
        timestamps: true,
    }
);

userSchema.index({ role: 1, isActive: 1 });

userSchema.pre("validate", function(next) {
    if (this.phone) {
        this.phone = normalizePhoneNumber(this.phone);
    }
    next();
});

// Auto-generate a 15-char customerId on first insert.
// Using pre("save") so it runs for both Customer.create() (signup)
// and User.create() (admin flow) without any call-site changes.
userSchema.pre("save", async function(next) {
    if (this.isNew && !this.customerId) {
        // Retry up to 5 times in the (astronomically unlikely) case of a collision
        for (let i = 0; i < 5; i++) {
            const candidate = generateCustomerId();
            // eslint-disable-next-line no-await-in-loop
            const exists = await mongoose.model("User").exists({ customerId: candidate });
            if (!exists) {
                this.customerId = candidate;
                break;
            }
        }
    }
    next();
});

// Phase 4 P4-8 — reverse virtual to the canonical Wallet document.
//
// Usage:
//   const user = await User.findById(id).populate("wallet");
//   user.wallet.availableBalance  // canonical
//
// This is opt-in via .populate() — existing queries that don't reference
// `wallet` see zero behavioural change.
userSchema.virtual("wallet", {
    ref: "Wallet",
    localField: "_id",
    foreignField: "ownerId",
    justOne: true,
    match: { ownerType: "CUSTOMER" },
});

// Make sure virtuals surface in `.toJSON()` / `.toObject()` so the
// frontend can read them once it migrates.
userSchema.set("toJSON", { virtuals: true });
userSchema.set("toObject", { virtuals: true });

export default mongoose.model("User", userSchema);

import React, { useState } from "react";
import { Mail, Zap, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * CheckoutElectronicsEmailSection
 * Prompts the user to provide their billing email when electronic items are in the cart.
 */
const CheckoutElectronicsEmailSection = React.memo(function CheckoutElectronicsEmailSection({
  email,
  onChangeEmail,
  hasElectronics,
  electronicsCount = 0,
  electronicsItems = [],
}) {
  const [touched, setTouched] = useState(false);
  const isValid = EMAIL_REGEX.test(String(email || "").trim());

  if (!hasElectronics) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-emerald-50/70 via-white to-blue-50/50 rounded-2xl p-4 shadow-sm border-2 border-emerald-500/30 overflow-hidden relative"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
            <Zap size={18} className="fill-current text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-slate-800 text-sm tracking-tight uppercase">
                Electronics Invoice Email
              </h3>
              <span className="bg-emerald-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider">
                Required
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Whichever email you enter below will receive your official bill & warranty invoice copy
            </p>
          </div>
        </div>
      </div>

      {Array.isArray(electronicsItems) && electronicsItems.length > 0 && (
        <div className="mb-3 px-3 py-2 bg-emerald-100/40 rounded-xl border border-emerald-200/50 flex items-center gap-2 text-[11px] text-emerald-900 font-semibold">
          <ShieldCheck size={15} className="text-emerald-700 flex-shrink-0" />
          <span className="truncate">
            Warranty Protection: {electronicsItems.map((i) => i.name || "Item").join(", ")}
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
          <span>Billing Email Address</span>
          {touched && isValid && (
            <span className="text-emerald-600 text-[10px] font-bold flex items-center gap-1">
              <CheckCircle2 size={12} /> Valid email
            </span>
          )}
        </label>
        <div className="relative">
          <Mail
            size={16}
            className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${
              isValid ? "text-emerald-600" : "text-slate-400"
            }`}
          />
          <Input
            type="email"
            placeholder="e.g. yourname@gmail.com"
            value={email || ""}
            onChange={(e) => {
              onChangeEmail(e.target.value);
              if (!touched) setTouched(true);
            }}
            onBlur={() => setTouched(true)}
            className={`pl-10 pr-4 h-11 text-xs rounded-xl bg-white border-2 font-medium transition-all ${
              touched && !isValid
                ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                : isValid
                ? "border-emerald-500/80 focus:border-emerald-600 focus:ring-emerald-100"
                : "border-slate-200 hover:border-slate-300 focus:border-emerald-500"
            }`}
          />
        </div>
        {isValid && (
          <p className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5 pt-1">
            <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
            <span>Bill will be emailed to: <strong className="text-emerald-950 font-black">{email}</strong></span>
          </p>
        )}
        {touched && !isValid && (
          <p className="text-[11px] text-red-500 font-medium flex items-center gap-1 pt-0.5">
            <AlertCircle size={12} /> Please enter a valid email address to receive your bill.
          </p>
        )}
      </div>
    </motion.div>
  );
});

export default CheckoutElectronicsEmailSection;

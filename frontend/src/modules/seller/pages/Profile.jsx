import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  User,
  Mail,
  Phone,
  Store,
  Shield,
  Edit2,
  Save,
  X,
  Rocket,
  Globe,
  MapPin,
  CheckCircle,
  Clock,
} from "lucide-react";
import { sellerApi } from "../services/sellerApi";
import { toast } from "sonner";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import MapPicker from "../../../shared/components/MapPicker";

const SellerProfile = () => {
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    shopName: "",
    phone: "",
    alternativePhone: "",
    email: "",
    lat: null,
    lng: null,
    radius: 5,
    address: "",
    openingTime: "08:00",
    closingTime: "20:00",
    isTimingEnabled: true,
    manualOverride: "auto",
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await sellerApi.getProfile();
      const data = response.data.result;
      setProfile(data);
      setFormData({
        name: data.name || "",
        shopName: data.shopName || "",
        phone: data.phone || "",
        alternativePhone: data.alternativePhone || "",
        email: data.email || "",
        lat: data.location?.coordinates[1] || null,
        lng: data.location?.coordinates[0] || null,
        radius: data.serviceRadius || 5,
        address: data.address || "",
        openingTime: data.shopTiming?.openingTime || "08:00",
        closingTime: data.shopTiming?.closingTime || "20:00",
        isTimingEnabled: data.shopTiming?.isTimingEnabled !== false,
        manualOverride: data.shopTiming?.manualOverride || "auto",
      });
    } catch (error) {
      toast.error("Failed to fetch profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocationSelect = (location) => {
    setFormData((prev) => ({
      ...prev,
      lat: location.lat,
      lng: location.lng,
      radius: location.radius,
      address: location.address,
    }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === "checkbox") {
      setFormData({ ...formData, [name]: checked });
    } else if (name === "name") {
      // Disallow numbers in seller name
      const cleaned = value.replace(/[0-9]/g, "");
      setFormData({ ...formData, [name]: cleaned });
    } else if (name === "phone" || name === "alternativePhone") {
      // Allow only digits, max 10 characters
      const digitsOnly = value.replace(/[^0-9]/g, "").slice(0, 10);
      setFormData({ ...formData, [name]: digitsOnly });
    } else if (name === "email") {
      // Trim spaces, keep as-is otherwise; HTML5 type=email will help validate shape
      setFormData({ ...formData, [name]: value.trimStart() });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Basic phone validation: must be exactly 10 digits
    if (!/^[0-9]{10}$/.test(formData.phone)) {
      toast.error("Please enter a valid 10-digit phone number.");
      return;
    }
    if (formData.alternativePhone) {
      if (!/^[0-9]{10}$/.test(formData.alternativePhone)) {
        toast.error("Please enter a valid 10-digit alternative phone number.");
        return;
      }
      if (formData.alternativePhone === formData.phone) {
        toast.error("Alternative phone number cannot be the same as primary phone number.");
        return;
      }
    }
    // Basic email validation
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: formData.name,
        shopName: formData.shopName,
        phone: formData.phone,
        alternativePhone: formData.alternativePhone || "",
        email: formData.email,
        lat: formData.lat,
        lng: formData.lng,
        radius: formData.radius,
        address: formData.address,
        shopTiming: {
          openingTime: formData.openingTime,
          closingTime: formData.closingTime,
          isTimingEnabled: formData.isTimingEnabled,
          manualOverride: formData.manualOverride,
        },
      };
      const response = await sellerApi.updateProfile(payload);
      const updatedData = response.data?.result;
      if (updatedData) {
        setProfile(updatedData);
      }
      toast.success("Profile updated successfully");
      setIsEditing(false);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async () => {
    try {
      const newStatus = !profile?.isActive;
      const response = await sellerApi.updateProfile({ isActive: newStatus });
      const updatedData = response.data?.result;
      if (updatedData) {
        setProfile(updatedData);
      } else {
        setProfile((prev) => ({ ...prev, isActive: newStatus }));
      }
      toast.success(`Shop is now ${newStatus ? "Active" : "Inactive"}`);
    } catch (error) {
      toast.error("Failed to update shop status");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 font-['Outfit']">
      {/* Header Section */}
      <div className="relative mb-24 px-4">
        {/* Banner Background */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-950 to-black h-64 rounded-lg shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-slate-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
          </div>
        </div>

        {/* Profile Info Row */}
        <div className="absolute bottom-8 left-4 right-4 md:left-8 md:right-8 lg:left-12 lg:right-12 grid grid-cols-1 md:grid-cols-[176px_minmax(0,1fr)_auto] items-center md:items-end gap-6 md:gap-8">
          {/* Avatar Container */}
          <div className="h-44 w-44 rounded-full bg-white p-2 shadow-[0_30px_70px_rgba(0,0,0,0.15)] flex-shrink-0 mx-auto md:mx-0">
            <div className="h-full w-full rounded-full bg-slate-50 flex items-center justify-center border-4 border-slate-50">
              <span className="text-7xl font-black text-slate-900">
                {profile?.name?.charAt(0)}
              </span>
            </div>
          </div>

          {/* Info Block */}
          <div className="min-w-0 pb-2 md:pb-4 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-3">
              <span className="px-4 py-1.5 bg-white/10 backdrop-blur-xl text-white text-[10px] font-black uppercase tracking-[2px] rounded-full border border-white/20">
                {profile?.role}
              </span>
              <button
                onClick={toggleStatus}
                className={`group flex items-center gap-2 px-4 py-1.5 text-[10px] font-black uppercase tracking-[2px] rounded-full border transition-all hover:scale-105 active:scale-95 ${
                  profile?.isActive
                    ? "bg-emerald-500 text-white border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                    : "bg-rose-500 text-white border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.4)]"
                }`}>
                <div
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    profile?.isActive ? "bg-emerald-200" : "bg-rose-200"
                  }`}
                />
                {profile?.isActive ? "Active" : "Inactive"}
              </button>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter drop-shadow-sm mb-1 break-words">
              {profile?.name}
            </h1>
            <p className="text-white/60 font-black tracking-[1px] text-lg">
              {profile?.shopName}
            </p>
            {/* Seller ID badge */}
            {profile?.sellerId && (
              <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 bg-white/10 border border-white/20 rounded-full backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[2px] text-white/80">
                  ID: {profile.sellerId}
                </span>
              </div>
            )}
          </div>

          {/* Action Button */}
          <div className="pb-2 md:pb-4 w-full md:w-auto">
            {!isEditing ? (
              <Button
                onClick={() => setIsEditing(true)}
                className="w-full md:w-auto bg-white/10 backdrop-blur-md text-white border border-white/20 hover:bg-white hover:text-slate-950 transition-all rounded-lg px-6 lg:px-12 py-4 md:py-5 flex items-center justify-center gap-3 md:gap-4 font-black tracking-[2px] md:tracking-[3px] text-xs shadow-[0_20px_40px_rgba(0,0,0,0.1)] hover:scale-[1.03] active:scale-[0.95] whitespace-nowrap">
                <Edit2 size={18} /> EDIT PROFILE
              </Button>
            ) : (
              <div className="w-full md:w-auto flex gap-3 md:gap-4 justify-center md:justify-end">
                <Button
                  onClick={() => setIsEditing(false)}
                  variant="outline"
                  className="h-[64px] w-[64px] flex items-center justify-center bg-white/5 text-white border border-white/20 hover:bg-white hover:text-slate-900 rounded-lg shadow-lg transition-all backdrop-blur-md">
                  <X size={24} className="stroke-[2.5]" />
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="min-w-0 max-w-full bg-white text-slate-950 hover:bg-slate-100 rounded-lg px-5 md:px-8 lg:px-12 py-4 md:py-5 font-black tracking-[2px] md:tracking-[3px] text-xs flex items-center gap-3 md:gap-4 shadow-[0_25px_50px_rgba(0,0,0,0.15)] h-[64px] whitespace-nowrap">
                  {isSaving ? (
                    "UPDATING..."
                  ) : (
                    <>
                      <Save size={20} /> SAVE CHANGES
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Main Info Card */}
        <div className="md:col-span-2 space-y-8">
          <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-lg">
            <h3 className="text-xl font-black text-slate-900 mb-8 border-b border-slate-50 pb-4">
              Business Profile
            </h3>

            <form className="space-y-8">
              {/* Seller ID — read-only display */}
              {profile?.sellerId && (
                <div className="flex items-center gap-3 px-5 py-3 bg-slate-900 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[2px] text-slate-500">Unique Seller ID</p>
                    <p className="text-base font-black text-white tracking-wider">{profile.sellerId}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(profile.sellerId); toast.success("Seller ID copied!"); }}
                    className="ml-auto text-[9px] font-black uppercase tracking-wider text-slate-400 hover:text-white transition-colors border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg"
                  >
                    Copy
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Seller Identity
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <User size={18} />
                    </div>
                    <input
                      type="text"
                      name="name"
                      maxLength={50}
                      pattern="[a-zA-Z\s]*"
                      value={formData.name}
                      onChange={(e) => {
                          e.target.value = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                          handleChange(e);
                      }}
                      disabled={!isEditing}
                      className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-100 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Store Name
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <Store size={18} />
                    </div>
                    <input
                      type="text"
                      name="shopName"
                      value={formData.shopName}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-100 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Contact Number
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <Phone size={18} />
                    </div>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-100 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3 animate-in fade-in slide-in-from-bottom duration-300">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Alternative Phone (Optional)
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                      <Phone size={18} />
                    </div>
                    <input
                      type="tel"
                      name="alternativePhone"
                      value={formData.alternativePhone}
                      onChange={handleChange}
                      disabled={!isEditing}
                      placeholder="e.g. 9876543210"
                      className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-100 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Email Address
                  </label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300">
                      <Mail size={18} />
                    </div>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-100 transition-all disabled:opacity-70"
                    />
                  </div>
                </div>
              </div>
            </form>
          </Card>

          {/* Shop Operating Hours Card */}
          <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-lg">
            <div className="flex flex-wrap justify-between items-center mb-8 border-b border-slate-50 pb-4 gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <Clock size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    Shop Operating Hours
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Set daily store opening and closing times. Products are hidden when shop is closed.
                  </p>
                </div>
              </div>

              {/* Live Status & Quick Edit Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-2 ${
                  profile?.shopStatusMeta?.isOpen
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : "bg-rose-100 text-rose-800 border border-rose-300"
                }`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${profile?.shopStatusMeta?.isOpen ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                  {profile?.shopStatusMeta?.isOpen ? "🟢 OPEN (Online)" : "🔴 CLOSED (Offline)"}
                </span>

                {!isEditing ? (
                  <Button
                    type="button"
                    onClick={() => {
                      setIsEditing(true);
                      toast.info("Edit mode enabled. Change opening & closing times below, then click Save.");
                    }}
                    className="bg-slate-900 text-white hover:bg-black rounded-lg px-5 py-2.5 text-xs font-black tracking-[1px] flex items-center gap-2 shadow-sm transition-all hover:scale-105">
                    <Edit2 size={14} /> EDIT TIMINGS
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSaving}
                    className="bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg px-5 py-2.5 text-xs font-black tracking-[1px] flex items-center gap-2 shadow-sm transition-all hover:scale-105">
                    <Save size={14} /> {isSaving ? "SAVING..." : "SAVE TIMINGS"}
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-6">
              {!isEditing && (
                <div 
                  onClick={() => {
                    setIsEditing(true);
                    toast.info("Edit mode enabled. Adjust times and click Save Timings.");
                  }}
                  className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 flex items-center justify-between gap-3 cursor-pointer hover:bg-amber-100/70 transition-colors"
                >
                  <p className="text-xs font-bold text-amber-900 flex items-center gap-2">
                    <Edit2 size={14} className="text-amber-700" />
                    Inputs are currently locked. Click here or tap "EDIT TIMINGS" above to change store hours.
                  </p>
                  <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 bg-amber-200 text-amber-900 rounded-md">
                    Click to Edit
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Opening Time (Daily)
                  </label>
                  <input
                    type="time"
                    name="openingTime"
                    value={formData.openingTime}
                    onChange={handleChange}
                    disabled={!isEditing}
                    onClick={() => {
                      if (!isEditing) {
                        setIsEditing(true);
                        toast.info("Edit mode enabled for Shop Operating Hours");
                      }
                    }}
                    className={`w-full px-6 py-4 rounded-lg text-base font-black outline-none transition-all ${
                      isEditing
                        ? "bg-white border-2 border-slate-900 text-slate-900 shadow-sm"
                        : "bg-slate-100 border-2 border-transparent text-slate-700 cursor-pointer hover:bg-slate-200"
                    }`}
                  />
                  <span className="text-[11px] font-bold text-slate-400 block ml-1">
                    Default: 08:00 AM (08:00)
                  </span>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Closing Time (Daily)
                  </label>
                  <input
                    type="time"
                    name="closingTime"
                    value={formData.closingTime}
                    onChange={handleChange}
                    disabled={!isEditing}
                    onClick={() => {
                      if (!isEditing) {
                        setIsEditing(true);
                        toast.info("Edit mode enabled for Shop Operating Hours");
                      }
                    }}
                    className={`w-full px-6 py-4 rounded-lg text-base font-black outline-none transition-all ${
                      isEditing
                        ? "bg-white border-2 border-slate-900 text-slate-900 shadow-sm"
                        : "bg-slate-100 border-2 border-transparent text-slate-700 cursor-pointer hover:bg-slate-200"
                    }`}
                  />
                  <span className="text-[11px] font-bold text-slate-400 block ml-1">
                    Default: 08:00 PM (20:00)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-600 ml-1">
                    Manual Mode Override
                  </label>
                  <select
                    name="manualOverride"
                    value={formData.manualOverride}
                    onChange={handleChange}
                    disabled={!isEditing}
                    className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-slate-900 transition-all disabled:opacity-70"
                  >
                    <option value="auto">Automatic (Follow Daily Hours)</option>
                    <option value="open">Force Always Open</option>
                    <option value="closed">Force Always Closed</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-6">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      name="isTimingEnabled"
                      checked={formData.isTimingEnabled}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block">
                      Enforce Daily Operating Hours
                    </span>
                    <span className="text-xs text-slate-500">
                      {formData.isTimingEnabled ? "Enabled - Store goes offline outside operating hours." : "Disabled - Store stays open continuously."}
                    </span>
                  </div>
                </div>
              </div>

              {profile?.shopStatusMeta?.reason && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center gap-3">
                  <Clock size={16} className="text-slate-500 flex-shrink-0" />
                  <p className="text-xs text-slate-700 font-bold">
                    Current Operating Status: <span className="font-medium">{profile.shopStatusMeta.reason}</span>
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Location & Radius Settings Card */}
          <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-lg">
            <div className="flex justify-between items-center mb-8 border-b border-slate-50 pb-4">
              <h3 className="text-xl font-black text-slate-900">
                Location & Service Settings
              </h3>
              {!isEditing && (
                <Button
                  onClick={() => setIsEditing(true)}
                  className="bg-slate-900 text-white hover:bg-black rounded-lg px-6 py-2 text-[10px] font-black tracking-[2px]">
                  MANAGE
                </Button>
              )}
            </div>

            <div className="space-y-6">
              <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100/50 space-y-6">
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div
                      className={`h-12 w-12 rounded-xl flex items-center justify-center transition-all ${
                        formData.lat
                          ? "bg-brand-100 text-brand-600 shadow-[0_8px_20px_-6px_rgba(16,185,129,0.3)]"
                          : "bg-white text-slate-400 shadow-sm"
                      }`}>
                      <MapPin size={24} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-black text-slate-900">
                        {formData.lat
                          ? "Store Location Pin"
                          : "Location Not Defined"}
                      </p>
                      <p className="text-xs text-slate-500 font-medium max-w-[400px] leading-relaxed">
                        {formData.address ||
                          "Click change to precisely mark your shop location on the map for delivery accuracy."}
                      </p>
                    </div>
                  </div>
                  {isEditing && (
                    <Button
                      type="button"
                      onClick={() => setIsMapOpen(true)}
                      className="bg-white text-slate-900 border-2 border-slate-200 hover:border-slate-900 rounded-lg px-8 py-3 text-[10px] font-black tracking-[2px] shadow-sm hover:shadow-md transition-all whitespace-nowrap">
                      CHANGE PIN
                    </Button>
                  )}
                </div>

                {formData.lat && (
                  <div className="pt-6 border-t border-slate-200/60 flex flex-wrap gap-8">
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        Service Radius
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-slate-900">
                          {formData.radius}
                        </span>
                        <span className="text-xs font-bold text-slate-500 bg-slate-200/50 px-2 py-0.5 rounded-md">
                          KM
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        Latitude
                      </span>
                      <span className="text-sm font-bold text-slate-700 tabular-nums">
                        {formData.lat.toFixed(6)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        Longitude
                      </span>
                      <span className="text-sm font-bold text-slate-700 tabular-nums">
                        {formData.lng.toFixed(6)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
                <Shield size={16} className="text-amber-600 mt-0.5" />
                <p className="text-xs text-amber-700 font-medium leading-relaxed">
                  Your shop location and service radius determine which
                  customers can view your products. Ensure the marker is placed
                  exactly at your physical storefront for accurate delivery
                  assignments.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar Card */}
        <div className="space-y-8">
          <Card className="p-8 border-none shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-[40px] bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-800 text-white">
            <h4 className="text-[10px] font-black uppercase tracking-[4px] text-white/40 mb-6">
              Security & Trust
            </h4>
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Shield size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-white/60">
                    Verification
                  </p>
                  <p className="text-sm font-bold">
                    {profile?.isVerified
                      ? "Verified Merchant"
                      : "Verification Pending"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Rocket size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-white/60">
                    Partner Tier
                  </p>
                  <p className="text-sm font-bold">Standard Growth</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Globe size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-white/60">
                    Region
                  </p>
                  <p className="text-sm font-bold">Pan India Reach</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {isMapOpen && (
        <MapPicker
          isOpen={isMapOpen}
          onClose={() => setIsMapOpen(false)}
          onConfirm={handleLocationSelect}
          initialLocation={
            formData.lat ? { lat: formData.lat, lng: formData.lng } : null
          }
          initialRadius={formData.radius}
        />
      )}
    </div>
  );
};

export default SellerProfile;

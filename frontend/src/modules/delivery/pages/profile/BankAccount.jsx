import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Landmark, CreditCard, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { toast } from "sonner";
import { deliveryApi } from "../../services/deliveryApi";

const BankAccount = () => {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [newAccount, setNewAccount] = useState("");
  const [confirmAccount, setConfirmAccount] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [bankName, setBankName] = useState("");
  
  const [accountError, setAccountError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [ifscError, setIfscError] = useState("");

  const loadProfile = async () => {
    try {
      const res = await deliveryApi.getProfile();
      if (res.data?.success) {
        setProfile(res.data.result || res.data.data);
      }
    } catch (error) {
      console.error("Failed to load delivery profile:", error);
      toast.error("Failed to load bank details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleNewAccountChange = (e) => {
    const value = e.target.value.replace(/\D/g, "");
    setNewAccount(value);
    
    if (value.length > 0 && (value.length < 9 || value.length > 18)) {
      setAccountError("Account number must be between 9 and 18 digits");
    } else {
      setAccountError("");
    }
    
    if (confirmAccount && value !== confirmAccount) {
      setConfirmError("Account numbers do not match");
    } else if (confirmAccount) {
      setConfirmError("");
    }
  };

  const handleConfirmAccountChange = (e) => {
    const value = e.target.value.replace(/\D/g, "");
    setConfirmAccount(value);
    
    if (value && value !== newAccount) {
      setConfirmError("Account numbers do not match");
    } else {
      setConfirmError("");
    }
  };

  const handleIfscChange = (e) => {
    const value = e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    setIfscCode(value);
    
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (value.length > 0 && !ifscRegex.test(value)) {
      setIfscError("Invalid IFSC format (e.g. HDFC0001234)");
    } else {
      setIfscError("");
    }
  };

  const maskAccountNumber = (accNum) => {
    if (!accNum) return "XXXXXXXXXXXX";
    const str = String(accNum);
    if (str.length <= 4) return str;
    return "X".repeat(str.length - 4) + str.slice(-4);
  };

  const getBankNameFromIfsc = (ifsc) => {
    if (!ifsc) return "Bank Name";
    const prefix = String(ifsc).substring(0, 4).toUpperCase();
    const banks = {
      "HDFC": "HDFC Bank",
      "SBIN": "State Bank of India",
      "ICIC": "ICICI Bank",
      "BARB": "Bank of Baroda",
      "PUNB": "Punjab National Bank",
      "CNRB": "Canara Bank",
      "UTIB": "Axis Bank",
      "KKBK": "Kotak Mahindra Bank",
      "YESB": "Yes Bank",
      "IBKL": "IDBI Bank",
      "MAHB": "Bank of Maharashtra",
      "UCOB": "UCO Bank",
      "IOBA": "Indian Overseas Bank",
      "UBIN": "Union Bank of India",
      "ANDB": "Andhra Bank",
      "ALLA": "Allahabad Bank",
      "SYNB": "Syndicate Bank",
      "ORBC": "Oriental Bank of Commerce",
      "VIJB": "Vijaya Bank",
      "CORP": "Corporation Bank",
    };
    return banks[prefix] || `${prefix} Bank`;
  };

  const handleUpdate = async () => {
    if (!!accountError || !!confirmError || !!ifscError || !newAccount || !confirmAccount || !ifscCode) return;
    try {
      setUpdating(true);
      const res = await deliveryApi.updateProfile({
        accountNumber: newAccount,
        accountHolder: profile?.accountHolder || profile?.name || "Delivery Partner",
        ifsc: ifscCode,
        bankName: bankName.trim() || undefined
      });
      if (res.data?.success) {
        toast.success("Bank account updated successfully!");
        setProfile(res.data.result || res.data.data);
        setNewAccount("");
        setConfirmAccount("");
        setIfscCode("");
        setBankName("");
      }
    } catch (error) {
      console.error("Failed to update bank account:", error);
      toast.error(error.response?.data?.message || "Failed to update bank details");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const accountHolderVal = profile?.accountHolder || profile?.name || "Not Configured";
  const accountNumberVal = profile?.accountNumber ? maskAccountNumber(profile.accountNumber) : "XXXXXXXXXXXX";
  const ifscVal = profile?.ifsc || "Not Configured";
  const bankNameVal = profile?.bankName || (profile?.ifsc ? getBankNameFromIfsc(profile.ifsc) : "No Bank Assigned");

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">Bank Account</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Bank Card Visual */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          
          <div className="flex justify-between items-start mb-8 relative z-10">
            <Landmark size={32} className="text-white/80" />
            <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-green-500/30 flex items-center">
              <CheckCircle2 size={12} className="mr-1" /> Active
            </span>
          </div>

          <div className="space-y-1 relative z-10">
            <p className="text-gray-400 text-xs uppercase tracking-wider">Account Number</p>
            <p className="font-mono text-2xl tracking-widest">{accountNumberVal}</p>
          </div>

          <div className="flex justify-between items-end mt-8 relative z-10">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Account Holder</p>
              <p className="font-bold text-lg">{accountHolderVal}</p>
            </div>
            <div className="text-right text-sm">
              <p className="text-white font-bold">{bankNameVal}</p>
              <p className="text-gray-400 text-xs">{ifscVal}</p>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-xl flex items-start">
          <AlertTriangle size={20} className="text-yellow-600 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-yellow-800 font-bold text-sm mb-1">Payment Information</h4>
            <p className="text-xs text-yellow-700 leading-relaxed">
              Your weekly earnings will be deposited to this account every Tuesday. 
              Changes to bank details may delay your next payout by up to 7 days.
            </p>
          </div>
        </div>

        {/* Change Request Form */}
        <div className="pt-4">
          <h3 className="ds-h4 text-gray-900 mb-4">Request Change</h3>
          <div className="space-y-4">
            <Input 
              label="New Account Number" 
              placeholder="Enter account number" 
              icon={CreditCard}
              value={newAccount}
              onChange={handleNewAccountChange}
              helperText={accountError}
              error={!!accountError}
            />
            <Input 
              label="Confirm Account Number" 
              placeholder="Re-enter account number" 
              icon={CreditCard}
              value={confirmAccount}
              onChange={handleConfirmAccountChange}
              helperText={confirmError}
              error={!!confirmError}
            />
            <Input 
              label="IFSC Code" 
              placeholder="Enter IFSC code" 
              icon={Landmark}
              value={ifscCode}
              onChange={handleIfscChange}
              helperText={ifscError}
              error={!!ifscError}
              maxLength={11}
            />
            <Input 
              label="Bank Name (Optional)" 
              placeholder="Enter bank name" 
              icon={Landmark}
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
            <Button 
              className="w-full mt-2" 
              variant="outline"
              disabled={updating || !!accountError || !!confirmError || !!ifscError || !newAccount || !confirmAccount || !ifscCode}
              onClick={handleUpdate}
            >
              {updating ? "Updating..." : "Verify & Update"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BankAccount;

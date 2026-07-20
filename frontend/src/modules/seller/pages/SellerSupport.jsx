import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle,
  Phone,
  Mail,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Headphones,
  ArrowLeft,
} from "lucide-react";
import { useSettings } from "@core/context/SettingsContext";
import Card from "@shared/components/ui/Card";
import PageHeader from "@shared/components/ui/PageHeader";

const SellerSupport = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const appName = settings?.appName || "Platform";
  const supportEmail = settings?.supportEmail || "seller-support@quickemart.com";
  const supportPhone = settings?.supportPhone || "+91 98765 43210";

  const faqs = [
    {
      question: "How do I list new products in my store?",
      answer:
        "Go to the 'Products' tab from the sidebar menu and click on '+ Add Product' or 'Bulk Upload' to add items manually or via Excel CSV.",
    },
    {
      question: "When are seller payout / withdrawal requests processed?",
      answer:
        "Withdrawal requests are reviewed and processed by Admin within 24–48 business hours. You can track all payout statuses under 'Money Request' and 'Payment History'.",
    },
    {
      question: "How are commission and handling fees calculated?",
      answer:
        "Commission is charged as a percentage on your seller base price based on category rules. Handling fees are added directly into the customer display price, keeping your base payout intact.",
    },
    {
      question: "What happens if a customer requests a return or refund?",
      answer:
        "Return requests appear under the 'Returns' section of your Seller Panel. Once verified by quality checks, refunds are handled according to platform return policy.",
    },
    {
      question: "How do I update my store operating status or inventory?",
      answer:
        "Use the 'Stock' management page to toggle product availability in real-time or update stock quantities for each product variant.",
    },
  ];

  const [openIndex, setOpenIndex] = useState(null);

  const toggleAccordion = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (window.history.state && window.history.state.idx > 0) {
              navigate(-1);
            } else {
              navigate("/");
            }
          }}
          className="p-2 -ml-2 rounded-full hover:bg-slate-200/60 transition-colors"
        >
          <ArrowLeft size={22} className="text-slate-700" />
        </button>
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Back</span>
      </div>
      <PageHeader
        title="Seller Help & Support"
        description="Get instant assistance, manage store queries, and view frequently asked questions."
        badge={
          <div className="ds-stat-card-icon bg-brand-50">
            <Headphones className="ds-icon-lg text-brand-600" />
          </div>
        }
      />

      {/* Support Contact Channels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <Card
          onClick={() => navigate("/chat")}
          className="p-6 cursor-pointer hover:shadow-xl hover:border-primary/30 transition-all border border-gray-100 flex flex-col items-center text-center group"
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <MessageCircle size={28} />
          </div>
          <h3 className="text-lg font-black text-gray-900 mb-1">Live Chat Support</h3>
          <p className="text-xs text-gray-500 font-medium mb-3">Chat directly with Admin support team</p>
          <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full">
            Start Chat
          </span>
        </Card>

        <Card
          onClick={() => window.location.href = `tel:${supportPhone.replace(/\s+/g, '')}`}
          className="p-6 cursor-pointer hover:shadow-xl hover:border-brand-300 transition-all border border-gray-100 flex flex-col items-center text-center group"
        >
          <div className="w-14 h-14 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Phone size={28} />
          </div>
          <h3 className="text-lg font-black text-gray-900 mb-1">Call Helpline</h3>
          <p className="text-xs text-gray-500 font-medium mb-3">Instant phone assistance for sellers</p>
          <span className="text-xs font-bold text-green-700 bg-green-100 px-3 py-1.5 rounded-full">
            {supportPhone}
          </span>
        </Card>

        <Card
          onClick={() => window.location.href = `mailto:${supportEmail}`}
          className="p-6 cursor-pointer hover:shadow-xl hover:border-purple-300 transition-all border border-gray-100 flex flex-col items-center text-center group"
        >
          <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Mail size={28} />
          </div>
          <h3 className="text-lg font-black text-gray-900 mb-1">Email Support</h3>
          <p className="text-xs text-gray-500 font-medium mb-3">Send seller inquiries & documents</p>
          <span className="text-xs font-bold text-purple-700 bg-purple-100 px-3 py-1.5 rounded-full truncate max-w-[200px]">
            {supportEmail}
          </span>
        </Card>
      </div>

      {/* Seller FAQ Section */}
      <Card className="p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-brand-50 text-brand-600 rounded-2xl">
            <HelpCircle size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900">Seller FAQs</h2>
            <p className="text-xs text-gray-500 font-medium">Quick solutions to common store management questions</p>
          </div>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="border border-gray-100 rounded-2xl overflow-hidden transition-all"
            >
              <button
                onClick={() => toggleAccordion(index)}
                className="w-full p-4 text-left flex justify-between items-center bg-gray-50/50 hover:bg-gray-100/50 transition-colors font-bold text-gray-800 text-sm"
              >
                <span>{faq.question}</span>
                {openIndex === index ? (
                  <ChevronUp size={18} className="text-primary flex-shrink-0" />
                ) : (
                  <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />
                )}
              </button>

              {openIndex === index && (
                <div className="p-4 bg-white text-xs text-gray-600 leading-relaxed border-t border-gray-100">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default SellerSupport;

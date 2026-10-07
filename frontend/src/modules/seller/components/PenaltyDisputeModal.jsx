import React, { useState } from "react";
import Modal from "@shared/components/ui/Modal";
import Button from "@shared/components/ui/Button";
import Input from "@shared/components/ui/Input";
import Badge from "@shared/components/ui/Badge";
import { Scale, AlertCircle, Upload, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import axiosInstance from "@core/api/axios";

const customFetch = async (url, options = {}) => {
  const cleanUrl = url.startsWith('/api/') ? url.substring(4) : url;
  const method = (options.method || "GET").toLowerCase();
  const body = options.body ? JSON.parse(options.body) : undefined;
  let res;
  if (method === "get") {
    res = await axiosInstance.get(cleanUrl);
  } else if (method === "post") {
    res = await axiosInstance.post(cleanUrl, body);
  } else if (method === "put") {
    res = await axiosInstance.put(cleanUrl, body);
  } else if (method === "delete") {
    res = await axiosInstance.delete(cleanUrl);
  }
  return res.data;
};

const PenaltyDisputeModal = ({ penalty, isOpen, onClose, onDisputeSubmitted }) => {
  const [reason, setReason] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!penalty) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("Please enter a dispute reason");
      return;
    }

    setSubmitting(true);
    try {
      const res = await customFetch(`/api/sla/violations/${penalty.id || penalty._id}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim(), evidenceUrl }),
      });

      if (res?.success) {
        toast.success("Dispute submitted successfully! Admin will review your appeal.");
        if (onDisputeSubmitted) onDisputeSubmitted();
        onClose();
      } else {
        toast.error(res?.message || "Failed to submit dispute");
      }
    } catch (error) {
      toast.error(error.message || "Failed to submit dispute");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="SLA Penalty & Dispute Submission">
      <div className="space-y-5 text-xs font-semibold text-slate-800">
        <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 flex items-start justify-between">
          <div>
            <span className="text-[10px] font-black text-rose-600 uppercase tracking-wider block">
              Deduction Amount
            </span>
            <span className="text-2xl font-black text-rose-700">₹{penalty.appliedPenalty || penalty.calculatedPenalty}</span>
            <p className="text-[11px] font-bold text-slate-600 mt-1">
              {penalty.category ? penalty.category.replace(/_/g, " ") : "SLA Penalty"} • Order {penalty.orderRef}
            </p>
          </div>
          <Badge className="bg-rose-200 text-rose-900 font-bold">{penalty.status}</Badge>
        </div>

        <div>
          <p className="font-bold text-slate-900 mb-1">Violation Reason / Details:</p>
          <p className="p-3 bg-slate-50 rounded-lg border text-slate-700 leading-relaxed font-medium">
            {penalty.description || "No detail provided"}
          </p>
        </div>

        {penalty.dispute?.isDisputed ? (
          <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 space-y-2">
            <div className="flex items-center gap-2 font-black text-purple-900 text-sm">
              <CheckCircle2 className="h-5 w-5 text-purple-600" />
              Dispute Under Review
            </div>
            <p className="text-slate-700">
              <span className="font-bold">Submitted Reason:</span> "{penalty.dispute.reason}"
            </p>
            {penalty.dispute.resolutionOutcome && (
              <p className="text-xs font-bold text-purple-800 mt-1">
                Outcome: {penalty.dispute.resolutionOutcome} ({penalty.dispute.resolutionNotes})
              </p>
            )}
          </div>
        ) : penalty.status === "WAIVED" ? (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-blue-900 font-bold">
            This penalty was waived and refunded to your wallet balance.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2 text-indigo-700 font-black">
              <Scale className="h-4 w-4" />
              Submit Dispute / Appeal
            </div>

            <div>
              <label className="block mb-1 font-bold">Dispute Explanation / Reason</label>
              <textarea
                className="w-full p-2.5 border rounded-lg text-xs font-medium bg-slate-50 focus:bg-white transition-all"
                rows={3}
                placeholder="Explain why this penalty should be waived (e.g. rider delay, customer cancellation, system error)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block mb-1 font-bold">Supporting Evidence URL (Optional)</label>
              <Input
                placeholder="Link to invoice, photo proof, or receipt..."
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button type="submit" disabled={submitting} className="bg-indigo-600 text-white font-bold">
                {submitting ? "Submitting..." : "Submit Appeal"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};

export default PenaltyDisputeModal;

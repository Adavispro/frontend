"use client";

import React, { useState, useEffect } from "react";
import {
  Printer,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Lock,
  SpinnerGap,
  X,
  FileText,
  WarningCircle,
  User,
  Info,
} from "@phosphor-icons/react";
import {
  printBatchPdf,
  invokeBrowserPdfPrint,
} from "../equipment/api/reports.api";

export interface ControlledPrintBatchContext {
  batchNo: string;
  lotNo?: string | null;
  equipmentCode?: string | null;
  productName?: string | null;
  currentStatus?: string | null;
  printCount?: number | null;
  lastPrintedBy?: string | null;
  lastPrintedAt?: string | null;
  lastPrintReason?: string | null;
}

export interface ControlledPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result?: {
    batchId?: string;
    equipmentCode?: string | null;
    printCount?: number;
    lastPrintedBy?: string;
    lastPrintedAt?: string;
  }) => void;
  batchContext: ControlledPrintBatchContext;
  currentUser?: {
    userId?: string | null;
    username?: string | null;
    fullName?: string | null;
    role?: string | null;
  };
}

export function ControlledPrintModal({
  isOpen,
  onClose,
  onSuccess,
  batchContext,
  currentUser,
}: ControlledPrintModalProps) {
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setPassword("");
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentUserName =
    currentUser?.fullName ||
    currentUser?.username ||
    currentUser?.userId ||
    "Authenticated User";

  const handlePrintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setErrorMessage("Reason for printing is mandatory and cannot be empty.");
      return;
    }

    if (!password) {
      setErrorMessage("Electronic signature password is required to authorize printing.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await printBatchPdf({
        batchNo: batchContext.batchNo,
        reason: trimmedReason,
        password,
        lotNo: batchContext.lotNo || undefined,
        equipmentCode: batchContext.equipmentCode || undefined,
      });

      // Trigger browser native print flow (opens system print dialog, no disk download)
      invokeBrowserPdfPrint(response.blob);

      onSuccess({
        batchId: response.batchId || batchContext.batchNo,
        equipmentCode: batchContext.equipmentCode,
        printCount: response.printCount,
        lastPrintedBy: response.printedBy,
        lastPrintedAt: response.printedAt,
      });
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Authorization or controlled print generation failed.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] text-slate-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="controlled-print-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl border bg-emerald-50 text-emerald-700 border-emerald-200">
              <Printer className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2
                id="controlled-print-title"
                className="text-base font-bold text-slate-900 flex items-center gap-2"
              >
                Controlled Print Authorization
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Batch:{" "}
                <strong className="font-mono text-slate-700">
                  {batchContext.batchNo}
                </strong>{" "}
                &bull; Controlled GxP PDF Dossier
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form
          onSubmit={handlePrintSubmit}
          className="p-6 space-y-4 overflow-y-auto flex-1 text-sm"
        >
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-2.5 text-xs shadow-xs animate-in fade-in">
              <WarningCircle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {/* Batch Details Summary Pill */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-400 block font-medium">Batch No</span>
                <span className="font-mono font-bold text-slate-800">
                  {batchContext.batchNo}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Lot / Stage</span>
                <span className="text-slate-700 font-medium">
                  {batchContext.lotNo || "-"} &bull; {batchContext.equipmentCode || "-"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Product</span>
                <span className="text-slate-700 font-medium truncate block" title={batchContext.productName || undefined}>
                  {batchContext.productName || "Pharmaceutical Product"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Current Print Count</span>
                <span className="font-mono font-bold text-indigo-700">
                  {batchContext.printCount ?? 0} {batchContext.printCount === 1 ? "print" : "prints"}
                </span>
              </div>
            </div>
          </div>

          {/* Mandatory Reason for Printing */}
          <div className="space-y-1.5">
            <label
              htmlFor="print-reason"
              className="block text-xs font-bold text-slate-800 uppercase tracking-wider"
            >
              Reason for Printing <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="print-reason"
              rows={3}
              required
              disabled={isSubmitting}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Physical batch dossier archiving, Regulatory auditor inspection copy, QA Batch Release Verification..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition disabled:bg-slate-100 disabled:cursor-not-allowed placeholder:text-slate-400"
            />
            <p className="text-[11px] text-slate-400">
              A specific, auditable reason is required before a controlled print can be dispatched.
            </p>
          </div>

          {/* Electronic Signature Authentication */}
          <div className="p-4 bg-emerald-50/50 border border-emerald-200/80 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs border-b border-emerald-200/60 pb-2">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              <span>Electronic Signature Verification</span>
            </div>

            <div className="text-xs text-slate-600 flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-slate-400" />
              <span>
                Signee: <strong className="text-slate-800">{currentUserName}</strong>
              </span>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="print-password"
                className="block text-xs font-semibold text-slate-700"
              >
                Enter System Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="print-password"
                  type="password"
                  required
                  disabled={isSubmitting}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your system password to sign"
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white transition disabled:bg-slate-100"
                />
                <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <p className="text-[11px] text-slate-500 italic leading-relaxed">
              By entering your password, you legally attest under electronic signature standards that you are authorizing this controlled print dispatch. An authoritative immutable record will be appended to the print summary.
            </p>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason.trim() || !password}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <SpinnerGap className="h-4 w-4 animate-spin" />
                  <span>Authorizing & Preparing Print...</span>
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4" />
                  <span>Authorize & Print PDF</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

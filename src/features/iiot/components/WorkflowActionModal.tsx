"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  ArrowRight,
  Lock,
  ChatText,
  WarningCircle,
  SpinnerGap,
  X,
  FileText,
  ClockCountdown,
} from "@phosphor-icons/react";
import {
  executeWorkflowAction,
  executeBulkWorkflowAction,
  type AllowedWorkflowAction,
  type BulkExecutionResult,
} from "../equipment/api/reports.api";

export interface BatchContextInfo {
  batchNo: string;
  lotNo: string;
  equipmentCode: string;
  equipmentName?: string;
  productName?: string;
  currentStatus: string;
}

export interface BulkContextInfo {
  items: Array<{
    batchNo: string;
    lotNo?: string;
    equipmentCode?: string;
    productName?: string;
    currentStatus?: string;
  }>;
  commonAction: AllowedWorkflowAction;
}

export interface WorkflowActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (bulkResult?: BulkExecutionResult) => void;
  action: AllowedWorkflowAction;
  batchContext?: BatchContextInfo;
  bulkContext?: BulkContextInfo;
  tenantId?: string;
  plantId?: string;
}

export function WorkflowActionModal({
  isOpen,
  onClose,
  onSuccess,
  action,
  batchContext,
  bulkContext,
  tenantId,
  plantId,
}: WorkflowActionModalProps) {
  const isBulk = Boolean(bulkContext && bulkContext.items && bulkContext.items.length > 0);
  const singleBatch = batchContext || {
    batchNo: "",
    lotNo: "",
    equipmentCode: "",
    equipmentName: "",
    productName: "",
    currentStatus: "",
  };

  const [comments, setComments] = useState("");
  const [justification, setJustification] = useState("");
  const [additionalInformation, setAdditionalInformation] = useState("");
  const [responseNotes, setResponseNotes] = useState("");
  const [password, setPassword] = useState("");
  const [esignReason, setEsignReason] = useState("Workflow Stage Sign-off & Verification");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkExecutionResult | null>(null);

  const actionCode = (action.actionCode || "").toUpperCase();
  const isRequestAdditionalInfo =
    actionCode === "REQUEST_ADDITIONAL_INFO" ||
    actionCode === "REJECT" ||
    Boolean(action.requiresAdditionalInfo);
  const isSubmitResponse =
    actionCode === "SUBMIT_RESPONSE" ||
    actionCode === "SUBMIT_JUSTIFICATION" ||
    Boolean(action.requiresResponse);
  const isDefer = actionCode === "DEFER" || action.actionType === "DEFER";
  const isApprove = actionCode === "APPROVE" || action.actionType === "APPROVE";

  useEffect(() => {
    if (isOpen) {
      setComments("");
      setJustification("");
      setAdditionalInformation("");
      setResponseNotes("");
      setPassword("");
      setErrorMessage(null);
      setBulkResult(null);

      if (isApprove) {
        setEsignReason(isBulk ? "Bulk Batch Stage Release Approval (21 CFR Part 11)" : "Batch Stage Release Approval (21 CFR Part 11)");
      } else if (isDefer) {
        setEsignReason(isBulk ? "Bulk Batch Decision Deferral (21 CFR Part 11)" : "Batch Decision Deferral (21 CFR Part 11)");
      } else if (isRequestAdditionalInfo) {
        setEsignReason(isBulk ? "Bulk Additional Information Request (21 CFR Part 11)" : "Additional Information Request (21 CFR Part 11)");
      } else if (isSubmitResponse) {
        setEsignReason(isBulk ? "Bulk Response to Additional Information Request (21 CFR Part 11)" : "Response to Additional Information Request (21 CFR Part 11)");
      } else {
        setEsignReason(isBulk ? "Bulk Workflow Stage Transition Sign-off (21 CFR Part 11)" : "Workflow Stage Transition Sign-off (21 CFR Part 11)");
      }
    }
  }, [isOpen, action, isApprove, isDefer, isRequestAdditionalInfo, isSubmitResponse, isBulk]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setBulkResult(null);

    // Validation rules
    if (isRequestAdditionalInfo && !additionalInformation.trim() && !comments.trim()) {
      setErrorMessage("Please specify the additional information or clarification required.");
      return;
    }

    if (isSubmitResponse && !responseNotes.trim() && !comments.trim()) {
      setErrorMessage("Please enter your response / clarification notes.");
      return;
    }

    if (isDefer && !justification.trim() && !comments.trim()) {
      setErrorMessage("Please provide a reason / justification for deferring.");
      return;
    }

    if (action.requiresJustification && !justification.trim() && !comments.trim()) {
      setErrorMessage("Justification is mandatory for this action.");
      return;
    }

    if (action.requiresComment && !comments.trim()) {
      setErrorMessage("Comments are mandatory for this action.");
      return;
    }

    if (action.requiresEsign && !password.trim()) {
      setErrorMessage("Electronic signature password is required under 21 CFR Part 11.");
      return;
    }

    setSubmitting(true);

    try {
      if (isBulk && bulkContext) {
        const result = await executeBulkWorkflowAction({
          actionCode: action.actionCode,
          items: bulkContext.items.map((i) => ({
            batchNo: i.batchNo,
            lotNo: i.lotNo,
            equipmentCode: i.equipmentCode,
            productName: i.productName,
          })),
          password: action.requiresEsign ? password : undefined,
          comments: comments.trim(),
          justification: (justification || comments || additionalInformation || responseNotes).trim(),
          additionalInformation: additionalInformation.trim(),
          responseNotes: responseNotes.trim(),
          esignatureReason: esignReason.trim(),
          tenantId,
          plantId,
        });

        if (result.failureCount > 0) {
          setBulkResult(result);
          // Don't auto-close if there are partial failures so user can see what failed
        } else {
          onSuccess(result);
          onClose();
        }
      } else {
        await executeWorkflowAction({
          batchNo: singleBatch.batchNo,
          lotNo: singleBatch.lotNo,
          equipmentCode: singleBatch.equipmentCode,
          actionCode: action.actionCode,
          password: action.requiresEsign ? password : undefined,
          comments: comments.trim(),
          justification: (justification || comments || additionalInformation || responseNotes).trim(),
          additionalInformation: additionalInformation.trim(),
          responseNotes: responseNotes.trim(),
          esignatureReason: esignReason.trim(),
          tenantId,
        });

        onSuccess();
        onClose();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to execute workflow action.";
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  const getThemeColor = () => {
    if (isApprove) return { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", btn: "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500" };
    if (isDefer) return { bg: "bg-purple-50 text-purple-700 border-purple-200", btn: "bg-purple-600 hover:bg-purple-700 focus:ring-purple-500" };
    if (isRequestAdditionalInfo) return { bg: "bg-amber-50 text-amber-700 border-amber-200", btn: "bg-amber-600 hover:bg-amber-700 focus:ring-amber-500" };
    return { bg: "bg-indigo-50 text-indigo-700 border-indigo-200", btn: "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500" };
  };

  const theme = getThemeColor();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] text-slate-900"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${theme.bg}`}>
              {isDefer ? (
                <ClockCountdown className="h-5 w-5" />
              ) : (
                <ShieldCheck className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                {action.displayName || action.actionName || action.actionCode}
                {isBulk ? (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                    Bulk Action ({bulkContext?.items.length} Tasks)
                  </span>
                ) : (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                    {action.actionCode}
                  </span>
                )}
              </h2>
              {isBulk ? (
                <p className="text-xs text-slate-500">
                  Executing common workflow transition for <strong className="text-slate-800">{bulkContext?.items.length}</strong> selected tasks
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  Batch <strong className="text-slate-800">{singleBatch.batchNo}</strong> • Lot{" "}
                  <strong className="text-slate-800">{singleBatch.lotNo}</strong> • Stage{" "}
                  <strong className="text-slate-800">{singleBatch.equipmentCode}</strong>
                  {singleBatch.productName ? ` • ${singleBatch.productName}` : ""}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Transition Summary Bar */}
        <div className="px-6 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Resulting Status:</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-bold text-emerald-700 font-mono">
              {action.resultingStatus || "UPDATED"}
            </span>
          </div>
          <span className="text-slate-400 font-mono text-[11px]">
            {action.fromStageCode} &rarr; {action.toStageCode || "COMPLETED"}
          </span>
        </div>

        {/* Bulk Affected Tasks Chips */}
        {isBulk && bulkContext && (
          <div className="px-6 py-2 bg-slate-50 border-b border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 mb-1">Selected Batch Tasks:</div>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {bulkContext.items.map((it, idx) => (
                <span
                  key={`${it.batchNo}-${it.equipmentCode}-${idx}`}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-white border border-slate-300 text-slate-700 font-mono shadow-sm"
                >
                  <strong>{it.batchNo}</strong> ({it.equipmentCode || "Stage"})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Bulk Partial Failure / Result Summary Card */}
        {bulkResult ? (
          <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <div className="font-bold text-amber-900 text-sm flex items-center gap-2">
                <WarningCircle className="h-5 w-5 text-amber-600" />
                <span>Bulk Execution Completed with Issues</span>
              </div>
              <p className="text-xs text-amber-800">
                <strong>{bulkResult.successCount}</strong> of {bulkResult.totalRequested} actions executed successfully.
                {" "}<strong>{bulkResult.failureCount}</strong> task(s) could not be completed.
              </p>
            </div>

            {bulkResult.failedItems.length > 0 && (
              <div className="space-y-2">
                <div className="font-semibold text-slate-800 text-xs">Failed Tasks:</div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {bulkResult.failedItems.map((fail, fIdx) => (
                    <div
                      key={`fail-${fail.batchNo}-${fIdx}`}
                      className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start gap-2"
                    >
                      <XCircle className="h-4 w-4 text-rose-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-mono font-bold">
                          {fail.batchNo} • {fail.equipmentCode || fail.lotNo || "Stage"}
                        </div>
                        <div className="text-[11px] text-rose-700">{fail.reason}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  onSuccess(bulkResult);
                  onClose();
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl shadow transition"
              >
                Acknowledge & Refresh
              </button>
            </div>
          </div>
        ) : (
          /* Form Body */
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2 text-xs font-medium">
                <WarningCircle className="h-4 w-4 flex-shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Contextual Input 1: Request Additional Information */}
            {isRequestAdditionalInfo && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800 flex items-center justify-between">
                  <span>Additional Information Required / Request Notes</span>
                  <span className="text-rose-600 font-medium">* Required</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Specify the exact parameters, data, or clarification required from the operator before review..."
                  value={additionalInformation}
                  onChange={(e) => setAdditionalInformation(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:outline-none"
                />
              </div>
            )}

            {/* Contextual Input 2: Submit Response */}
            {isSubmitResponse && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800 flex items-center justify-between">
                  <span>Response / Clarification Details</span>
                  <span className="text-rose-600 font-medium">* Required</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Provide detailed response to the requested information and justification for resubmission..."
                  value={responseNotes}
                  onChange={(e) => setResponseNotes(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            )}

            {/* Contextual Input 3: Deferral Reason */}
            {isDefer && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800 flex items-center justify-between">
                  <span>Reason for Deferral</span>
                  <span className="text-rose-600 font-medium">* Required</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="State the justification and rationale for deferring..."
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:outline-none"
                />
              </div>
            )}

            {/* General Comments */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-800 flex items-center justify-between">
                <span>Operational Comments & Observations</span>
                {action.requiresComment && <span className="text-rose-600 font-medium">* Required</span>}
              </label>
              <textarea
                rows={isRequestAdditionalInfo || isSubmitResponse || isDefer ? 2 : 3}
                placeholder="Enter any additional audit comments or verification notes..."
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* 21 CFR Part 11 Electronic Signature Section */}
            {action.requiresEsign && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                  <Lock className="h-4 w-4 text-indigo-600" />
                  <span>21 CFR Part 11 Electronic Signature Verification</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  By entering your system password, you attest to the accuracy and completeness of this
                  electronic batch record action{isBulk ? " for all selected tasks" : ""}. This constitutes a legally binding electronic signature.
                </p>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 flex items-center justify-between">
                    <span>Enter Password to Sign</span>
                    <span className="text-rose-600 font-medium">* Required</span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Enter your system password..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow transition flex items-center gap-2 ${theme.btn} disabled:opacity-50`}
              >
                {submitting ? (
                  <>
                    <SpinnerGap className="h-4 w-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>{isBulk ? `Confirm & Sign (${bulkContext?.items.length})` : "Confirm & Sign"}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

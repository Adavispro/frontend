"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  WarningCircle,
  FileText,
  ChartLine,
  CheckCircle,
  XCircle,
  ArrowRight,
  ShieldCheck,
  UserCheck,
} from "@phosphor-icons/react";
import { Button, Dialog, Snackbar } from "@/components/ui";
import DataTable, { StatusPill, type DataTableColumn } from "@/components/table/DataTable";
import { useLoginContext } from "@/features/auth/hooks/useCurrentUser";
import {
  getAlarmEventDataPaginated,
  getCppDataPaginated,
  getWorkflowAssignees,
  getWorkflowAuditTrail,
  updateBatchStageApproval,
  type WorkflowAssignee,
  type WorkflowAuditEvent,
} from "@/features/iiot/equipment/api/reports.api";
import type {
  AlarmEventRecord,
  BatchSummary,
  CppRecord,
} from "@/features/iiot/equipment/schemas/reports.schema";

export interface BatchDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchSummary: BatchSummary | null;
  stageEquipmentCode?: string;
  onWorkflowActionComplete?: () => void;
}

type TabType = "BATCH_DATA" | "ALARMS" | "AUDIT_TRAIL" | "TIME_SERIES";

const toText = (value: unknown) =>
  typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();

const toUpper = (value: unknown) => toText(value).toUpperCase();

const toDisplayDate = (value: unknown) => {
  const text = toText(value);
  if (!text) return "-";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
};

export default function BatchDetailModal({
  isOpen,
  onClose,
  batchSummary,
  stageEquipmentCode,
  onWorkflowActionComplete,
}: BatchDetailModalProps) {
  const loginContext = useLoginContext();
  const [activeTab, setActiveTab] = useState<TabType>("BATCH_DATA");
  const [auditEvents, setAuditEvents] = useState<WorkflowAuditEvent[]>([]);
  const [alarms, setAlarms] = useState<AlarmEventRecord[]>([]);
  const [cppData, setCppData] = useState<CppRecord[]>([]);
  const [isLoadingTab, setIsLoadingTab] = useState(false);
  const [assignees, setAssignees] = useState<WorkflowAssignee[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState("");
  const [actionComments, setActionComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"UNDER_REVIEW" | "REVIEWER_REVIEWED" | "APPROVED" | "REJECTED" | null>(null);

  const currentUserId = toUpper(loginContext?.user?.userId);
  const roleCodes = useMemo(() => {
    if (!loginContext || typeof loginContext !== "object") return [];
    const roles = (loginContext as { roles?: unknown[] }).roles;
    if (!Array.isArray(roles)) return [];
    return roles
      .map((r) => {
        if (!r || typeof r !== "object") return "";
        const role = r as Record<string, unknown>;
        return toUpper(role.roleCode ?? role.code ?? role.name ?? role.roleName);
      })
      .filter(Boolean);
  }, [loginContext]);

  const isOperator = useMemo(
    () => roleCodes.includes("PRODUCTION_OPERATOR") || roleCodes.includes("OPERATOR") || currentUserId.includes("OPERATOR"),
    [roleCodes, currentUserId],
  );
  const isReviewer = useMemo(
    () => roleCodes.includes("QA_REVIEWER") || roleCodes.includes("REVIEWER") || currentUserId.includes("REVIEWER"),
    [roleCodes, currentUserId],
  );
  const isSupervisor = useMemo(
    () => roleCodes.includes("SHIFT_SUPERVISOR") || roleCodes.includes("SUPERVISOR") || currentUserId.includes("SUPERVISOR"),
    [roleCodes, currentUserId],
  );
  const isAdmin = useMemo(
    () => roleCodes.includes("SUPER_ADMIN") || roleCodes.includes("PLATFORM_ADMIN") || currentUserId === "SUPER_ADMIN",
    [roleCodes, currentUserId],
  );

  const selectedStage = useMemo(() => {
    if (!batchSummary) return null;
    const stages = Array.isArray((batchSummary as unknown as { stages?: unknown[] }).stages)
      ? ((batchSummary as unknown as { stages?: unknown[] }).stages as Array<Record<string, unknown>>)
      : [];
    if (stageEquipmentCode) {
      const found = stages.find(
        (s) => toUpper(s.equipmentCode) === toUpper(stageEquipmentCode) || toUpper(s.equipmentId) === toUpper(stageEquipmentCode),
      );
      if (found) return found;
    }
    return stages[0] || null;
  }, [batchSummary, stageEquipmentCode]);

  const equipmentCode = toText(selectedStage?.equipmentCode || batchSummary?.equipmentId || stageEquipmentCode);
  const batchNo = toText(batchSummary?.batchNo);
  const lotNo = toText(batchSummary?.lotNo);
  const stageApproval = selectedStage?.approval as Record<string, unknown> | undefined;
  const rawStatus = toUpper(stageApproval?.status) || (toUpper(batchSummary?.overallStatus) === "APPROVED" || toUpper(batchSummary?.overallStatus) === "REJECTED" ? toUpper(batchSummary?.overallStatus) : "PENDING");

  useEffect(() => {
    if (!isOpen || !batchNo || !equipmentCode) return;
    const controller = new AbortController();
    setIsLoadingTab(true);

    const loadData = async () => {
      try {
        const [auditRes, alarmsRes, cppRes] = await Promise.allSettled([
          getWorkflowAuditTrail({ batchNo, lotNo, equipmentCode }, controller.signal),
          getAlarmEventDataPaginated(equipmentCode, { batchNo, lotNo }, controller.signal, { limit: 50 }),
          getCppDataPaginated(equipmentCode, { batchNo, lotNo }, controller.signal, { limit: 100 }),
        ]);

        if (auditRes.status === "fulfilled") setAuditEvents(auditRes.value);
        if (alarmsRes.status === "fulfilled") setAlarms(alarmsRes.value);
        if (cppRes.status === "fulfilled") setCppData(cppRes.value);
      } finally {
        setIsLoadingTab(false);
      }
    };

    void loadData();
    return () => controller.abort();
  }, [isOpen, batchNo, lotNo, equipmentCode]);

  const openActionDialog = async (action: "UNDER_REVIEW" | "REVIEWER_REVIEWED" | "APPROVED" | "REJECTED") => {
    setPendingAction(action);
    setActionError("");
    setActionComments("");
    setSelectedAssignee("");

    if (action === "UNDER_REVIEW" || action === "REVIEWER_REVIEWED") {
      try {
        const list = await getWorkflowAssignees({ targetStatus: action });
        setAssignees(list);
        if (list.length > 0) setSelectedAssignee(list[0].userId);
      } catch {
        setAssignees([]);
      }
    }
    setIsActionDialogOpen(true);
  };

  const handleExecuteAction = async () => {
    if (!pendingAction || !batchNo || !equipmentCode) return;
    if (pendingAction === "REJECTED" && !actionComments.trim()) {
      setActionError("Rejection reason is mandatory.");
      return;
    }
    if ((pendingAction === "UNDER_REVIEW" || pendingAction === "REVIEWER_REVIEWED") && assignees.length > 0 && !selectedAssignee) {
      setActionError("Please select an eligible assignee.");
      return;
    }

    setIsSubmitting(true);
    setActionError("");

    try {
      await updateBatchStageApproval({
        batchNo,
        lotNo,
        equipmentCode,
        status: pendingAction,
        supervisorName: selectedAssignee || undefined,
        comments: actionComments.trim() || `Workflow action: ${pendingAction}`,
        approvedBy: currentUserId || "SYSTEM",
      });

      setSnackbarMessage(`Batch stage successfully transitioned to ${pendingAction.replace("_", " ")}.`);
      setIsActionDialogOpen(false);
      onWorkflowActionComplete?.();

      const updatedAudit = await getWorkflowAuditTrail({ batchNo, lotNo, equipmentCode });
      setAuditEvents(updatedAudit);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to execute workflow action.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const alarmColumns: DataTableColumn<AlarmEventRecord>[] = [
    { key: "eventAt", header: "Timestamp", render: (row) => toDisplayDate(row.eventAt) },
    { key: "severity", header: "Severity", render: (row) => <StatusPill label={toText(row.severity)} className={toUpper(row.severity) === "CRITICAL" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"} /> },
    { key: "eventCategory", header: "Category", render: (row) => toText(row.eventCategory) || "-" },
    { key: "message", header: "Message", render: (row) => toText(row.message) || "-" },
    { key: "status", header: "Status", render: (row) => toText(row.status) || "-" },
  ];

  const cppColumns: DataTableColumn<CppRecord>[] = [
    { key: "observedAt", header: "Timestamp", render: (row) => toDisplayDate(row.observedAt) },
    { key: "parameterCode", header: "Parameter Code", render: (row) => toText(row.parameterCode) || "-" },
    { key: "parameterName", header: "Parameter Name", render: (row) => toText(row.parameterName) || "-" },
    { key: "observedValue", header: "Observed Value", render: (row) => `${row.observedValue ?? "-"} ${toText(row.unit)}` },
    { key: "limits", header: "Standard Limits", render: (row) => row.lowerLimit != null && row.upperLimit != null ? `${row.lowerLimit} - ${row.upperLimit}` : "-" },
  ];

  if (!isOpen || !batchSummary) return null;

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title={`Batch Details — ${batchNo} (${lotNo})`}
        widthClassName="max-w-[1000px]"
        contentClassName="p-6"
      >
        <div className="grid gap-6">
          {/* Header Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 bg-slate-50/80 p-4 rounded-lg border border-slate-200/80 text-xs">
            <div>
              <span className="text-slate-500 block text-[11px]">Product Code</span>
              <span className="font-semibold text-slate-800">{toText(batchSummary.productCode) || "-"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Product Name</span>
              <span className="font-semibold text-slate-800">{toText(batchSummary.productName) || "-"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Equipment Line</span>
              <span className="font-semibold text-slate-800">{equipmentCode}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Stage Status</span>
              <StatusPill
                label={rawStatus}
                className={
                  rawStatus === "APPROVED"
                    ? "bg-emerald-100 text-emerald-700"
                    : rawStatus === "UNDER_REVIEW"
                    ? "bg-amber-100 text-amber-700"
                    : rawStatus === "REVIEWER_REVIEWED"
                    ? "bg-blue-100 text-blue-700"
                    : rawStatus === "REJECTED"
                    ? "bg-rose-100 text-rose-700"
                    : "bg-slate-100 text-slate-700"
                }
              />
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Requested By</span>
              <span className="font-medium text-slate-700">{toText(selectedStage?.requestedBy || stageApproval?.requestedBy) || "-"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Assigned Owner</span>
              <span className="font-medium text-slate-700">{toText(selectedStage?.supervisorName) || "-"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Stage Start</span>
              <span className="font-medium text-slate-700">{toDisplayDate(selectedStage?.stageStartAt || batchSummary.batchStartAt)}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Stage End</span>
              <span className="font-medium text-slate-700">{toDisplayDate(selectedStage?.stageEndAt || batchSummary.batchEndAt)}</span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-slate-200 gap-6 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("BATCH_DATA")}
              className={`pb-2.5 flex items-center gap-1.5 transition-colors ${
                activeTab === "BATCH_DATA"
                  ? "border-b-2 border-primary text-primary"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <FileText size={16} /> Batch Information
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("ALARMS")}
              className={`pb-2.5 flex items-center gap-1.5 transition-colors ${
                activeTab === "ALARMS"
                  ? "border-b-2 border-primary text-primary"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <WarningCircle size={16} /> Alarms & Events ({alarms.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("AUDIT_TRAIL")}
              className={`pb-2.5 flex items-center gap-1.5 transition-colors ${
                activeTab === "AUDIT_TRAIL"
                  ? "border-b-2 border-primary text-primary"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <ShieldCheck size={16} /> Workflow Audit Trail ({auditEvents.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("TIME_SERIES")}
              className={`pb-2.5 flex items-center gap-1.5 transition-colors ${
                activeTab === "TIME_SERIES"
                  ? "border-b-2 border-primary text-primary"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <ChartLine size={16} /> Time-Series Parameters ({cppData.length})
            </button>
          </div>

          {/* Tab Contents */}
          <div className="min-h-[260px] max-h-[400px] overflow-y-auto">
            {activeTab === "BATCH_DATA" && (
              <div className="grid gap-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <h4 className="font-semibold text-slate-800 mb-2">Stage Lifecycle Summary</h4>
                    <p className="text-slate-600 mb-1"><strong>Overall Status:</strong> {toText(batchSummary.overallStatus) || "IN_PROGRESS"}</p>
                    <p className="text-slate-600 mb-1"><strong>Execution Status:</strong> {toText(selectedStage?.executionStatus) || "COMPLETED"}</p>
                    <p className="text-slate-600"><strong>Equipment Type:</strong> {toText(selectedStage?.equipmentType) || "-"}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <h4 className="font-semibold text-slate-800 mb-2">Verification & Governance</h4>
                    <p className="text-slate-600 mb-1"><strong>Transitioned By:</strong> {toText(stageApproval?.transitionedBy || stageApproval?.approvedBy) || "-"}</p>
                    <p className="text-slate-600 mb-1"><strong>Transitioned At:</strong> {toDisplayDate(stageApproval?.transitionedAt || stageApproval?.approvedAt)}</p>
                    <p className="text-slate-600"><strong>Comments:</strong> {toText(stageApproval?.comments) || "None recorded"}</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "ALARMS" && (
              <DataTable
                title="Alarm & Event Records"
                columns={alarmColumns}
                rows={alarms}
                getRowKey={(row, idx) => toText(row.id) || `${toText(row.eventAt)}-${idx}`}
                emptyText={isLoadingTab ? "Loading alarms..." : "No alarms or warning events recorded for this stage."}
              />
            )}

            {activeTab === "AUDIT_TRAIL" && (
              <div className="space-y-3">
                {auditEvents.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    {isLoadingTab ? "Loading audit trail..." : "No previous workflow transition audit records found."}
                  </div>
                ) : (
                  auditEvents.map((evt, idx) => (
                    <div key={evt._id || idx} className="flex items-start gap-3 bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm text-xs">
                      <div className="mt-0.5 text-primary">
                        <Clock size={16} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">
                            {evt.previousStatus || "START"} <ArrowRight className="inline mx-1" size={12} /> {evt.newStatus}
                          </span>
                          <span className="text-slate-400 text-[11px]">{toDisplayDate(evt.timestamp || evt.createdAt)}</span>
                        </div>
                        <p className="text-slate-600 mt-1">
                          Actor: <strong>{evt.userId}</strong> ({evt.userRole || "User"})
                        </p>
                        {evt.comments && (
                          <p className="text-slate-500 mt-0.5 bg-slate-50 p-1.5 rounded border border-slate-100">
                            Reason/Comments: {evt.comments}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "TIME_SERIES" && (
              <DataTable
                title="Critical Process Parameters (CPP)"
                columns={cppColumns}
                rows={cppData}
                getRowKey={(row, idx) => toText(row.id) || `${toText(row.observedAt)}-${idx}`}
                emptyText={isLoadingTab ? "Loading telemetry..." : "No CPP time-series data found."}
              />
            )}
          </div>

          {/* Action Buttons Footer */}
          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <div className="flex items-center gap-2">
              {isOperator && rawStatus === "PENDING" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void openActionDialog("UNDER_REVIEW")}
                  className="bg-[#0B63C9] text-white text-xs h-8 px-4"
                >
                  <UserCheck className="mr-1.5" size={14} /> Send for Review
                </Button>
              )}

              {isReviewer && rawStatus === "UNDER_REVIEW" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void openActionDialog("REVIEWER_REVIEWED")}
                  className="bg-[#0B63C9] text-white text-xs h-8 px-4"
                >
                  <CheckCircle className="mr-1.5" size={14} /> Send for Approval
                </Button>
              )}

              {(isSupervisor || isAdmin) && (rawStatus === "REVIEWER_REVIEWED" || rawStatus === "UNDER_REVIEW") && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void openActionDialog("APPROVED")}
                    className="bg-[#0D8A58] text-white text-xs h-8 px-4 hover:bg-[#0B7A4D]"
                  >
                    <CheckCircle className="mr-1.5" size={14} /> Approve
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => void openActionDialog("REJECTED")}
                    className="text-xs h-8 px-4"
                  >
                    <XCircle className="mr-1.5" size={14} /> Reject
                  </Button>
                </>
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-slate-600 hover:text-slate-900 text-xs h-8 px-4"
            >
              Close
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Workflow Action Confirmation Dialog */}
      {isActionDialogOpen && (
        <Dialog
          isOpen={isActionDialogOpen}
          onClose={() => setIsActionDialogOpen(false)}
          title={`Confirm Action: ${pendingAction?.replace("_", " ")}`}
          widthClassName="max-w-[480px]"
          contentClassName="p-5"
        >
          <div className="grid gap-4 text-xs">
            <p className="text-slate-600">
              You are transitioning stage <strong>{equipmentCode}</strong> for batch <strong>{batchNo}</strong> to{" "}
              <strong className="text-primary">{pendingAction?.replace("_", " ")}</strong>.
            </p>

            {(pendingAction === "UNDER_REVIEW" || pendingAction === "REVIEWER_REVIEWED") && (
              <label className="grid gap-1.5">
                <span className="font-semibold text-slate-700">
                  Select {pendingAction === "UNDER_REVIEW" ? "Reviewer" : "Approving Supervisor"}{" "}
                  <span className="text-red-500">*</span>
                </span>
                <select
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                  className="rounded border border-slate-300 px-3 py-2 text-xs bg-white outline-none focus:border-primary"
                >
                  {assignees.length === 0 ? (
                    <option value="">No eligible users found</option>
                  ) : (
                    assignees.map((user) => (
                      <option key={user.userId} value={user.userId}>
                        {user.fullName} ({user.userId}) — {user.roleName || user.title || "Eligible"}
                      </option>
                    ))
                  )}
                </select>
              </label>
            )}

            <label className="grid gap-1.5">
              <span className="font-semibold text-slate-700">
                Comments / Reason {pendingAction === "REJECTED" ? <span className="text-red-500">*</span> : "(Optional)"}
              </span>
              <textarea
                value={actionComments}
                onChange={(e) => setActionComments(e.target.value)}
                rows={3}
                placeholder={pendingAction === "REJECTED" ? "Mandatory rejection reason..." : "Enter workflow comments..."}
                className="rounded border border-slate-300 p-2.5 text-xs outline-none focus:border-primary"
              />
            </label>

            {actionError && (
              <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-xs">
                {actionError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsActionDialogOpen(false)}
                disabled={isSubmitting}
                className="text-xs h-8 px-3"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleExecuteAction}
                isLoading={isSubmitting}
                className={`text-xs h-8 px-4 text-white ${
                  pendingAction === "REJECTED" ? "bg-rose-600 hover:bg-rose-700" : "bg-primary"
                }`}
              >
                Confirm & Submit
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      <Snackbar
        open={Boolean(snackbarMessage)}
        title="Workflow Update"
        message={snackbarMessage}
        variant="success"
        onClose={() => setSnackbarMessage("")}
      />
    </>
  );
}

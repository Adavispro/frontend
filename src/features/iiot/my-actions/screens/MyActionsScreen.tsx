"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  CheckCircle,
  Clock,
  ShieldCheck,
  Funnel,
  MagnifyingGlass,
  ArrowClockwise,
  ArrowCounterClockwise,
  UserCheck,
  CheckSquare,
  Lock,
  CaretUp,
  CaretDown,
} from "@phosphor-icons/react";
import { useLoginContext } from "@/features/auth/hooks/useCurrentUser";
import {
  getBatchSummaryPaginated,
  getWorkflowDashboardCounts,
  getAllowedActions,
  deduplicateAllowedActions,
  type AllowedWorkflowAction,
  type WorkflowDashboardCounts,
  type BulkExecutionResult,
} from "@/features/iiot/equipment/api/reports.api";
import type { BatchSummary } from "@/features/iiot/equipment/schemas/reports.schema";
import Pagination from "@/components/ui/Pagination";
import { WorkflowActionModal } from "../../components/WorkflowActionModal";
import WorkflowActivityCard from "../components/WorkflowActivityCard";
import { ROUTES } from "@/config/routes";

interface MyActionItem {
  id: string;
  batchNo: string;
  lotNo: string;
  productCode: string;
  productName: string;
  equipmentCode: string;
  equipmentName?: string;
  equipmentType: string;
  workflowStage: string;
  stageSequence: number;
  rawStatus: string;
  displayStatus: string;
  lastAction?: string;
  lastActionAt?: string;
  allowedActions: AllowedWorkflowAction[];
  summaryRef: BatchSummary;
}

type SortField = "batchNo" | "productName" | "equipmentCode" | "workflowStage" | "rawStatus" | "lastActionAt";
type SortDirection = "asc" | "desc";

const toText = (value: unknown) =>
  typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();

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
  }).format(date);
};

const getStatusBadge = (status: string) => {
  const normalized = status.toUpperCase();
  if (normalized === "APPROVED" || normalized === "COMPLETED") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (normalized === "REVIEWER_REVIEWED" || normalized === "PENDING_APPROVAL") {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }
  if (normalized === "UNDER_REVIEW" || normalized === "IN_REVIEW") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  if (normalized === "RETURNED_TO_OPERATOR" || normalized === "REJECTED") {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }
  if (normalized === "DEFERRED") {
    return "bg-purple-50 text-purple-700 border-purple-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
};

export default function MyActionsScreen() {
  const router = useRouter();
  const loginContext = useLoginContext();
  const [items, setItems] = useState<MyActionItem[]>([]);
  const [counts, setCounts] = useState<WorkflowDashboardCounts>({
    pendingMyAction: 0,
    pendingReview: 0,
    pendingApproval: 0,
    completedActions: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [equipmentTypeFilter, setEquipmentTypeFilter] = useState("ALL");

  // Multi-Selection State
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("lastActionAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal State (Single & Bulk)
  const [modalAction, setModalAction] = useState<AllowedWorkflowAction | null>(null);
  const [selectedItem, setSelectedItem] = useState<MyActionItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [bulkModalAction, setBulkModalAction] = useState<AllowedWorkflowAction | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch dashboard counts
      const dashboardCounts = await getWorkflowDashboardCounts();
      setCounts(dashboardCounts);

      // 2. Fetch batch summaries
      const batchSummaries = await getBatchSummaryPaginated();

      // 3. Extract items across stages and query dynamic allowed actions
      const extracted: MyActionItem[] = [];

      for (const summary of batchSummaries) {
        const batchNo = toText(summary.batchNo);
        const lotNo = toText(summary.lotNo);
        const productCode = toText(summary.productCode);
        const productName = toText(summary.productName);
        const stages = (summary.stages as Array<Record<string, unknown>>) || [];
        const summaryId = toText(
          summary.id || (summary as Record<string, unknown>)._id || `${summary.lineId || "LINE"}_${batchNo}`
        );

        for (const stage of stages) {
          const equipmentCode = toText(stage.equipmentCode || stage.equipmentId);
          const equipmentType = toText(stage.equipmentType || equipmentCode.slice(-3));
          const approval = (stage.approval as Record<string, unknown>) || {};
          const rawStatus = toText(approval.status || "PENDING").toUpperCase();
          const sequence = typeof stage.sequenceOrder === "number" ? stage.sequenceOrder : 1;

          let displayStatus = rawStatus.replace(/_/g, " ");
          if (rawStatus === "REVIEWER_REVIEWED") displayStatus = "Pending Approval";
          if (rawStatus === "UNDER_REVIEW") displayStatus = "Under Review";
          if (rawStatus === "RETURNED_TO_OPERATOR") displayStatus = "Returned to Operator";

          // Canonical unique row key
          const id = `${summaryId}:${batchNo}:${lotNo}:${equipmentCode}:${sequence}`;

          let allowedActions: AllowedWorkflowAction[] = [];
          try {
            const rawAllowed = await getAllowedActions({
              batchNo,
              lotNo,
              equipmentCode,
            });
            allowedActions = deduplicateAllowedActions(rawAllowed);
          } catch (err) {
            console.error(`Failed allowed actions for ${id}`, err);
          }

          extracted.push({
            id,
            batchNo,
            lotNo,
            productCode,
            productName: productName || "Allopurinol / Standard",
            equipmentCode,
            equipmentType,
            workflowStage: `Stage ${sequence} (${equipmentType})`,
            stageSequence: sequence,
            rawStatus,
            displayStatus,
            lastAction: toText(approval.transitionedBy || stage.operatorName || "-"),
            lastActionAt: toText(approval.transitionedAt || stage.stageEndAt || summary.updatedAt),
            allowedActions,
            summaryRef: summary,
          });
        }
      }

      setItems(extracted);
    } catch (err) {
      console.error("Failed to load My Actions data", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reconcile selection state when items change
  useEffect(() => {
    const validIds = new Set(items.map((i) => i.id));
    setSelectedTaskIds((prev) => {
      let hasInvalid = false;
      for (const id of prev) {
        if (!validIds.has(id)) {
          hasInvalid = true;
          break;
        }
      }
      if (!hasInvalid) return prev;
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [items]);

  const handleOpenActionModal = (action: AllowedWorkflowAction, item: MyActionItem) => {
    setModalAction(action);
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const handleActionSuccess = () => {
    setSuccessMessage("Workflow action executed successfully and recorded in audit trail!");
    loadData();
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleOpenBulkActionModal = (action: AllowedWorkflowAction) => {
    setBulkModalAction(action);
    setIsBulkModalOpen(true);
  };

  const handleBulkActionSuccess = (result?: BulkExecutionResult) => {
    if (result && result.failureCount > 0) {
      setSuccessMessage(
        `${result.successCount} of ${result.totalRequested} actions executed successfully. ${result.failureCount} task(s) could not be completed.`
      );
    } else {
      setSuccessMessage(
        `${selectedTaskIds.size} workflow actions executed successfully and recorded in audit trail!`
      );
    }
    setSelectedTaskIds(new Set());
    loadData();
    setTimeout(() => setSuccessMessage(null), 6000);
  };

  const handleToggleItemSelection = (id: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedTaskIds(new Set());
  };

  // Filter Handlers with automatic reset to page 1
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
  };

  const handleEquipmentFilterChange = (val: string) => {
    setEquipmentTypeFilter(val);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setStatusFilter("ALL");
    setEquipmentTypeFilter("ALL");
    setCurrentPage(1);
  };

  const handleSortToggle = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <CaretDown className="h-3 w-3 text-slate-300 opacity-60 inline ml-1" />;
    }
    return sortDirection === "asc" ? (
      <CaretUp className="h-3.5 w-3.5 text-indigo-600 inline ml-1 font-bold" />
    ) : (
      <CaretDown className="h-3.5 w-3.5 text-indigo-600 inline ml-1 font-bold" />
    );
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        !searchTerm ||
        item.batchNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.lotNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.equipmentCode.toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus =
        statusFilter === "ALL" ||
        (statusFilter === "MY_ACTION" && item.allowedActions.length > 0) ||
        (statusFilter === "PENDING" && (item.rawStatus === "PENDING" || item.rawStatus === "NOT_STARTED")) ||
        (statusFilter === "UNDER_REVIEW" && (item.rawStatus === "UNDER_REVIEW" || item.rawStatus === "IN_REVIEW")) ||
        (statusFilter === "PENDING_APPROVAL" && (item.rawStatus === "REVIEWER_REVIEWED" || item.rawStatus === "PENDING_APPROVAL")) ||
        (statusFilter === "APPROVED" && (item.rawStatus === "APPROVED" || item.rawStatus === "COMPLETED")) ||
        (statusFilter === "RETURNED" && (item.rawStatus === "RETURNED_TO_OPERATOR" || item.rawStatus === "REJECTED"));

      const matchEquipment =
        equipmentTypeFilter === "ALL" ||
        item.equipmentType.toUpperCase() === equipmentTypeFilter.toUpperCase();

      return matchSearch && matchStatus && matchEquipment;
    });
  }, [items, searchTerm, statusFilter, equipmentTypeFilter]);

  // Sorting
  const sortedItems = useMemo(() => {
    const sorted = [...filteredItems];
    sorted.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "batchNo":
          comparison = a.batchNo.localeCompare(b.batchNo);
          break;
        case "productName":
          comparison = a.productName.localeCompare(b.productName);
          break;
        case "equipmentCode":
          comparison = a.equipmentCode.localeCompare(b.equipmentCode);
          break;
        case "workflowStage":
          comparison = a.stageSequence - b.stageSequence;
          break;
        case "rawStatus":
          comparison = a.displayStatus.localeCompare(b.displayStatus);
          break;
        case "lastActionAt":
        default: {
          const timeA = new Date(a.lastActionAt || 0).getTime() || 0;
          const timeB = new Date(b.lastActionAt || 0).getTime() || 0;
          comparison = timeA - timeB;
          break;
        }
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [filteredItems, sortField, sortDirection]);

  // Pagination calculations
  const totalRecords = sortedItems.length;
  const safeTotalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);

  const paginatedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, safeCurrentPage, pageSize]);

  const selectedItems = useMemo(() => {
    return items.filter((it) => selectedTaskIds.has(it.id));
  }, [items, selectedTaskIds]);

  const visibleIds = useMemo(() => {
    return paginatedItems.map((it) => it.id);
  }, [paginatedItems]);

  const isAllVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedTaskIds.has(id));
  const isSomeVisibleSelected =
    visibleIds.some((id) => selectedTaskIds.has(id)) && !isAllVisibleSelected;

  const handleToggleSelectAllVisible = () => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (isAllVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // Calculate common executable actions across all selected items using canonical action codes
  const commonAllowedActions = useMemo(() => {
    if (selectedItems.length === 0) return [];

    const firstItemActions = deduplicateAllowedActions(selectedItems[0].allowedActions || []);
    if (firstItemActions.length === 0) return [];

    return firstItemActions.filter((firstAction) => {
      const firstCode = (firstAction.actionCode || "").toUpperCase();
      return selectedItems.every((item) => {
        const itemActions = deduplicateAllowedActions(item.allowedActions || []);
        return itemActions.some((act) => (act.actionCode || "").toUpperCase() === firstCode);
      });
    });
  }, [selectedItems]);

  return (
    <div className="flex-1 space-y-6 p-6 bg-slate-50 text-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <CheckSquare className="h-7 w-7 text-indigo-600" />
            My Actionable Batch Tasks
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Dynamic Level 2 (L2) batch operations queue. Actions are evaluated dynamically by the Workflow MDM State Engine.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-medium border border-slate-200 shadow-sm transition"
        >
          <ArrowClockwise className={`h-4 w-4 text-slate-600 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm animate-in fade-in duration-300">
          <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block">
              Actionable by Me
            </span>
            <span className="text-3xl font-bold text-indigo-600 font-mono mt-1 block">
              {counts.pendingMyAction}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">Requires your role sign-off</span>
          </div>
          <div className="h-12 w-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <UserCheck className="h-6 w-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block">
              Under Review
            </span>
            <span className="text-3xl font-bold text-amber-600 font-mono mt-1 block">
              {counts.pendingReview}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">Stages in peer review</span>
          </div>
          <div className="h-12 w-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <Clock className="h-6 w-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block">
              Pending QA Approval
            </span>
            <span className="text-3xl font-bold text-blue-600 font-mono mt-1 block">
              {counts.pendingApproval}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">Awaiting formal release</span>
          </div>
          <div className="h-12 w-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block">
              Completed Actions
            </span>
            <span className="text-3xl font-bold text-emerald-600 font-mono mt-1 block">
              {counts.completedActions}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">Approved batch stages</span>
          </div>
          <div className="h-12 w-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* 5th Visual Workflow Activity Analytics Card */}
      <WorkflowActivityCard counts={counts} isLoading={isLoading} />

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search batch, lot, product, or equipment..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Funnel className="h-4 w-4 text-slate-500" />
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="MY_ACTION">Actionable by Me</option>
              <option value="PENDING">Pending Submission</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="RETURNED">Returned / Rejected</option>
              <option value="APPROVED">Approved / Completed</option>
            </select>

            <select
              value={equipmentTypeFilter}
              onChange={(e) => handleEquipmentFilterChange(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Equipment</option>
              <option value="RMG">RMG (Granulator)</option>
              <option value="FBD">FBD (Dryer)</option>
              <option value="OGB">OGB (Blender)</option>
            </select>

            {(searchTerm || statusFilter !== "ALL" || equipmentTypeFilter !== "ALL") && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                title="Reset filters"
              >
                <ArrowCounterClockwise className="h-3.5 w-3.5 text-slate-500" />
                Reset
              </button>
            )}
          </div>
        </div>

        <span className="text-xs text-slate-500 font-medium">
          Showing {totalRecords} of {items.length} batch stage tasks
        </span>
      </div>

      {/* Dynamic Bulk Action Toolbar */}
      {selectedTaskIds.size > 0 && (
        <div className="p-3.5 bg-indigo-50/90 border border-indigo-200 rounded-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold font-mono shadow-sm">
              <CheckSquare className="h-4 w-4" />
              {selectedTaskIds.size} Selected
            </span>
            <span className="text-xs text-indigo-950 font-medium">
              {selectedItems.length === 1
                ? "1 batch task selected"
                : `${selectedItems.length} tasks selected across ${new Set(selectedItems.map((i) => i.batchNo)).size} batches`}
            </span>
            <button
              type="button"
              onClick={handleClearSelection}
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 hover:underline ml-2"
            >
              Clear Selection
            </button>
          </div>

          <div className="flex items-center gap-2">
            {commonAllowedActions.length > 0 ? (
              commonAllowedActions.map((action) => {
                const isApprove = action.actionType === "APPROVE";
                const isReject = action.actionType === "REJECT";
                const isJustify = action.actionType === "JUSTIFY";

                let buttonStyle = "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm";
                if (isApprove) buttonStyle = "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm";
                if (isReject) buttonStyle = "bg-rose-600 hover:bg-rose-700 text-white shadow-sm";
                if (isJustify) buttonStyle = "bg-amber-600 hover:bg-amber-700 text-white shadow-sm";

                return (
                  <button
                    key={`bulk-btn-${action.actionCode}`}
                    onClick={() => handleOpenBulkActionModal(action)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${buttonStyle}`}
                  >
                    <Lock className="h-3.5 w-3.5 opacity-90" />
                    {action.displayName || action.actionName || action.actionCode} ({selectedTaskIds.size})
                  </button>
                );
              })
            ) : (
              <span className="text-xs text-amber-800 bg-amber-100/90 border border-amber-200 px-3 py-1.5 rounded-lg font-medium">
                No common action is available for the selected tasks.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Task Queue Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200 select-none">
              <tr>
                <th className="py-3.5 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeVisibleSelected;
                    }}
                    onChange={handleToggleSelectAllVisible}
                    aria-label="Select all visible batch tasks"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </th>
                <th
                  onClick={() => handleSortToggle("batchNo")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center">
                    Batch & Lot No
                    {renderSortIndicator("batchNo")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("productName")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center">
                    Product
                    {renderSortIndicator("productName")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("equipmentCode")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center">
                    Equipment
                    {renderSortIndicator("equipmentCode")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("workflowStage")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center">
                    Stage
                    {renderSortIndicator("workflowStage")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("rawStatus")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center">
                    Workflow Status
                    {renderSortIndicator("rawStatus")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("lastActionAt")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center">
                    Last Modified
                    {renderSortIndicator("lastActionAt")}
                  </div>
                </th>
                <th className="py-3.5 px-4 text-right">Dynamic Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ArrowClockwise className="h-6 w-6 animate-spin text-indigo-600" />
                      <span>Resolving dynamic state machine authorizations...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-medium">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <CheckCircle className="h-8 w-8 text-emerald-500 opacity-60" />
                      <span className="text-slate-700 font-semibold text-sm">No action items in queue</span>
                      <span className="text-slate-500 text-xs">
                        {searchTerm || statusFilter !== "ALL" || equipmentTypeFilter !== "ALL"
                          ? "No tasks match your filter criteria. Try adjusting your filters."
                          : "All batches are up to date for your role authorization."}
                      </span>
                      {(searchTerm || statusFilter !== "ALL" || equipmentTypeFilter !== "ALL") && (
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition"
                        >
                          <ArrowCounterClockwise className="h-3.5 w-3.5 text-indigo-600" />
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const isSelected = selectedTaskIds.has(item.id);
                  const deduplicatedActions = deduplicateAllowedActions(item.allowedActions || []);

                  return (
                    <tr
                      key={item.id}
                      className={`transition group ${isSelected ? "bg-indigo-50/60" : "hover:bg-slate-50/80"}`}
                    >
                      <td className="py-3 px-4 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleItemSelection(item.id)}
                          aria-label={`Select task for batch ${item.batchNo} stage ${item.equipmentCode}`}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">
                        <div className="font-bold text-slate-900">{item.batchNo}</div>
                        <div className="text-[11px] text-slate-500 font-sans">{item.lotNo}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{item.productName}</div>
                        <div className="text-[11px] font-mono text-slate-500">{item.productCode}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[11px]">
                          {item.equipmentCode}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-700 font-medium">{item.workflowStage}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${getStatusBadge(
                            item.rawStatus
                          )}`}
                        >
                          {item.displayStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        <div>{toDisplayDate(item.lastActionAt)}</div>
                        <div className="text-[10px] text-slate-400 font-sans">by {item.lastAction}</div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Canonical View Details Button */}
                          <button
                            onClick={() => {
                              const detailUrl = `${ROUTES.iiotBatchDetails}/${item.batchNo}?lotNo=${encodeURIComponent(
                                item.lotNo
                              )}&equipmentCode=${encodeURIComponent(
                                item.equipmentCode
                              )}&returnTo=${encodeURIComponent(ROUTES.iiotMyActions)}`;
                              router.push(detailUrl);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium text-xs shadow-sm transition"
                            title="View Batch Details"
                          >
                            <Eye className="h-3.5 w-3.5 text-slate-500" /> Details
                          </button>

                          {/* Dynamically configured deduplicated row actions from Workflow MDM */}
                          {deduplicatedActions.map((action) => {
                            const isApprove = action.actionType === "APPROVE";
                            const isReject = action.actionType === "REJECT";
                            const isJustify = action.actionType === "JUSTIFY";

                            let buttonStyle = "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm";
                            if (isApprove) buttonStyle = "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm";
                            if (isReject) buttonStyle = "bg-rose-600 hover:bg-rose-700 text-white shadow-sm";
                            if (isJustify) buttonStyle = "bg-amber-600 hover:bg-amber-700 text-white shadow-sm";

                            return (
                              <button
                                key={action.actionCode}
                                onClick={() => handleOpenActionModal(action, item)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs transition ${buttonStyle}`}
                              >
                                <Lock className="h-3 w-3 opacity-80" />
                                {action.displayName || action.actionName || action.actionCode}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Reusable Unified Pagination Component */}
        {!isLoading && totalRecords > 0 && (
          <Pagination
            page={safeCurrentPage}
            pageSize={pageSize}
            totalRecords={totalRecords}
            onPageChange={(p) => setCurrentPage(p)}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setCurrentPage(1);
            }}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        )}
      </div>

      {/* Single Item Workflow Action Modal */}
      {selectedItem && modalAction && (
        <WorkflowActionModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedItem(null);
            setModalAction(null);
          }}
          onSuccess={handleActionSuccess}
          action={modalAction}
          batchContext={{
            batchNo: selectedItem.batchNo,
            lotNo: selectedItem.lotNo,
            equipmentCode: selectedItem.equipmentCode,
            equipmentName: selectedItem.equipmentType,
            productName: selectedItem.productName,
            currentStatus: selectedItem.rawStatus,
          }}
          tenantId={loginContext?.tenantId ? String(loginContext.tenantId) : "TNT-0001"}
          plantId={loginContext?.plantId ? String(loginContext.plantId) : "PLNT-0001"}
        />
      )}

      {/* Bulk Items Workflow Action Modal */}
      {bulkModalAction && isBulkModalOpen && (
        <WorkflowActionModal
          isOpen={isBulkModalOpen}
          onClose={() => {
            setIsBulkModalOpen(false);
            setBulkModalAction(null);
          }}
          onSuccess={handleBulkActionSuccess}
          action={bulkModalAction}
          bulkContext={{
            items: selectedItems.map((i) => ({
              batchNo: i.batchNo,
              lotNo: i.lotNo,
              equipmentCode: i.equipmentCode,
              productName: i.productName,
              currentStatus: i.rawStatus,
            })),
            commonAction: bulkModalAction,
          }}
          tenantId={loginContext?.tenantId ? String(loginContext.tenantId) : "TNT-0001"}
          plantId={loginContext?.plantId ? String(loginContext.plantId) : "PLNT-0001"}
        />
      )}
    </div>
  );
}

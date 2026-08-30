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
  ChartDonut,
  UserPlus,
  PaperPlaneTilt,
  Question,
  ChatCenteredText,
  ClockCountdown,
} from "@phosphor-icons/react";
import { useLoginContext } from "@/features/auth/hooks/useCurrentUser";
import {
  getBatchSummaryPaginated,
  getWorkflowDashboardCounts,
  getAllowedActions,
  claimWorkflowTask,
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
  const [showActivityChart, setShowActivityChart] = useState(false);

  // Multi-Selection State
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("lastActionAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Modal State (Single & Bulk)
  const [modalAction, setModalAction] = useState<AllowedWorkflowAction | null>(null);
  const [selectedItem, setSelectedItem] = useState<MyActionItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [bulkModalAction, setBulkModalAction] = useState<AllowedWorkflowAction | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionsCache, setActionsCache] = useState<Record<string, AllowedWorkflowAction[]>>({});
  const [isResolvingPageActions, setIsResolvingPageActions] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch dashboard counts & batch summaries in parallel
      const [dashboardCounts, batchSummaries] = await Promise.all([
        getWorkflowDashboardCounts().catch(() => ({
          pendingMyAction: 0,
          pendingReview: 0,
          pendingApproval: 0,
          completedActions: 0,
        })),
        getBatchSummaryPaginated({ limit: 50 }).catch(() => []),
      ]);

      setCounts(dashboardCounts);

      // 2. Extract items across stages immediately (0 blocking sequential calls)
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
            allowedActions: [],
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

  const handleQuickClaim = async (item: MyActionItem) => {
    try {
      const userRole = (loginContext?.roles?.[0] as Record<string, unknown>)?.roleCode as string || "PRODUCTION_REVIEWER";
      const res = await claimWorkflowTask({
        batchNo: item.batchNo,
        lotNo: item.lotNo,
        equipmentCode: item.equipmentCode,
        userRole: userRole,
        tenantId: "TNT-0001",
      });
      setSuccessMessage(res.message || `Task ${item.batchNo} assigned to you!`);
      loadData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to claim task");
    }
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
    const rawRoles = (loginContext?.roles as Array<unknown>) || [];
    const userRoles = rawRoles.map((r) => {
      if (typeof r === "string") return r.toUpperCase();
      if (r && typeof r === "object") {
        const code =
          (r as Record<string, unknown>).roleCode ??
          (r as Record<string, unknown>).role ??
          (r as Record<string, unknown>).name;
        return typeof code === "string" ? code.toUpperCase() : "";
      }
      return "";
    });
    const isApprover = userRoles.some((r) => r.includes("APPROVER") || r.includes("ADMIN"));
    const isReviewer = userRoles.some((r) => r.includes("REVIEWER") || r.includes("ADMIN"));
    const isOperator = userRoles.some((r) => r.includes("OPERATOR") || r.includes("ADMIN"));

    return items.filter((item) => {
      const matchSearch =
        !searchTerm ||
        item.batchNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.lotNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.equipmentCode.toLowerCase().includes(searchTerm.toLowerCase());

      const itemActions = actionsCache[item.id] || item.allowedActions || [];
      const hasDynamicActions = itemActions.length > 0;
      const isRoleActionable =
        (isApprover && (item.rawStatus === "REVIEWER_REVIEWED" || item.rawStatus === "PENDING_APPROVAL")) ||
        (isReviewer && (item.rawStatus === "UNDER_REVIEW" || item.rawStatus === "IN_REVIEW")) ||
        (isOperator && (item.rawStatus === "RETURNED_TO_OPERATOR" || item.rawStatus === "PENDING"));

      const matchStatus =
        statusFilter === "ALL" ||
        (statusFilter === "MY_ACTION" && (hasDynamicActions || isRoleActionable)) ||
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
  }, [items, searchTerm, statusFilter, equipmentTypeFilter, actionsCache, loginContext]);

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

  // Fast parallel resolution of allowed actions only for visible page items
  useEffect(() => {
    if (paginatedItems.length === 0) return;

    const unCachedItems = paginatedItems.filter((it) => !actionsCache[it.id]);
    if (unCachedItems.length === 0) return;

    let isSubscribed = true;
    setIsResolvingPageActions(true);

    Promise.all(
      unCachedItems.map(async (item) => {
        try {
          const raw = await getAllowedActions({
            batchNo: item.batchNo,
            lotNo: item.lotNo,
            equipmentCode: item.equipmentCode,
          });
          return { id: item.id, actions: deduplicateAllowedActions(raw) };
        } catch {
          return { id: item.id, actions: [] };
        }
      })
    )
      .then((results) => {
        if (!isSubscribed) return;
        setActionsCache((prev) => {
          const updated = { ...prev };
          for (const res of results) {
            updated[res.id] = res.actions;
          }
          return updated;
        });
      })
      .finally(() => {
        if (isSubscribed) {
          setIsResolvingPageActions(false);
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [paginatedItems, actionsCache]);

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

    const firstItemActions = deduplicateAllowedActions(actionsCache[selectedItems[0].id] || selectedItems[0].allowedActions || []);
    if (firstItemActions.length === 0) return [];

    return firstItemActions.filter((firstAction) => {
      const firstCode = (firstAction.actionCode || "").toUpperCase();
      return selectedItems.every((otherItem) => {
        const otherActions = deduplicateAllowedActions(actionsCache[otherItem.id] || otherItem.allowedActions || []);
        return otherActions.some((act) => (act.actionCode || "").toUpperCase() === firstCode);
      });
    });
  }, [selectedItems, actionsCache]);

  return (
    <div className="flex-1 space-y-4 p-4 sm:p-5 bg-slate-50 text-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <CheckSquare className="h-6 w-6 sm:h-7 sm:w-7 text-indigo-600" />
            My Actionable Batch Tasks
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Dynamic Level 2 (L2) batch operations queue. Actions are evaluated dynamically by the Workflow MDM State Engine.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs sm:text-sm font-medium border border-slate-200 shadow-sm transition self-start md:self-auto"
        >
          <ArrowClockwise className={`h-4 w-4 text-slate-600 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2 shadow-sm animate-in fade-in duration-300">
          <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Metric Cards Grid (4 KPI Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">
              Actionable by Me
            </span>
            <span className="text-xl sm:text-2xl font-bold text-indigo-600 font-mono mt-0.5 block">
              {counts.pendingMyAction}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Requires your role sign-off</span>
          </div>
          <div className="h-10 w-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
            <UserCheck className="h-5 w-5" />
          </div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">
              Under Review
            </span>
            <span className="text-xl sm:text-2xl font-bold text-amber-600 font-mono mt-0.5 block">
              {counts.pendingReview}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Stages in peer review</span>
          </div>
          <div className="h-10 w-10 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">
              Pending QA Approval
            </span>
            <span className="text-xl sm:text-2xl font-bold text-blue-600 font-mono mt-0.5 block">
              {counts.pendingApproval}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Awaiting formal release</span>
          </div>
          <div className="h-10 w-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">
              Completed Actions
            </span>
            <span className="text-xl sm:text-2xl font-bold text-emerald-600 font-mono mt-0.5 block">
              {counts.completedActions}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Approved batch stages</span>
          </div>
          <div className="h-10 w-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
            <CheckCircle className="h-5 w-5" />
          </div>
        </div>

        {showActivityChart && (
          <WorkflowActivityCard counts={counts} isLoading={isLoading} />
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2.5 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search batch, lot, product, or equipment..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Funnel className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Equipment</option>
              <option value="RMG">RMG (Granulator)</option>
              <option value="FBD">FBD (Dryer)</option>
              <option value="BLE">BLE (Blender)</option>
              <option value="OGB">OGB (Blender)</option>
              <option value="COAT">COAT (Auto Coater)</option>
              <option value="CIP">CIP (Clean In Place)</option>
            </select>

            {(searchTerm || statusFilter !== "ALL" || equipmentTypeFilter !== "ALL") && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                title="Reset filters"
              >
                <ArrowCounterClockwise className="h-3 w-3 text-slate-500" />
                Reset
              </button>
            )}
          </div>
        </div>

        <span className="text-[11px] text-slate-500 font-medium self-end md:self-auto">
          Showing {totalRecords} of {items.length} tasks
        </span>
      </div>

      {/* Dynamic Bulk Action Toolbar */}
      {selectedTaskIds.size > 0 && (
        <div className="p-3 bg-indigo-50/90 border border-indigo-200 rounded-xl flex flex-wrap items-center justify-between gap-2.5 animate-in fade-in duration-200 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-indigo-600 text-white rounded-md text-xs font-bold font-mono shadow-sm">
              <CheckSquare className="h-3.5 w-3.5" />
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
              Clear
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
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${buttonStyle}`}
                  >
                    <Lock className="h-3 w-3 opacity-90" />
                    {action.displayName || action.actionName || action.actionCode} ({selectedTaskIds.size})
                  </button>
                );
              })
            ) : (
              <span className="text-xs text-amber-800 bg-amber-100/90 border border-amber-200 px-2.5 py-1 rounded-lg font-medium">
                No common action is available for selected tasks.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Task Queue Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[10px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200 select-none">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeVisibleSelected;
                    }}
                    onChange={handleToggleSelectAllVisible}
                    aria-label="Select all visible batch tasks"
                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </th>
                <th
                  onClick={() => handleSortToggle("batchNo")}
                  className="py-2.5 px-3 cursor-pointer hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center">
                    Batch & Lot No
                    {renderSortIndicator("batchNo")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("productName")}
                  className="py-2.5 px-3 cursor-pointer hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center">
                    Product
                    {renderSortIndicator("productName")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("equipmentCode")}
                  className="py-2.5 px-3 cursor-pointer hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center">
                    Equipment
                    {renderSortIndicator("equipmentCode")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("workflowStage")}
                  className="py-2.5 px-3 cursor-pointer hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center">
                    Stage
                    {renderSortIndicator("workflowStage")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("rawStatus")}
                  className="py-2.5 px-3 cursor-pointer hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center">
                    Workflow Status
                    {renderSortIndicator("rawStatus")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("lastActionAt")}
                  className="py-2.5 px-3 cursor-pointer hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center">
                    Last Modified
                    {renderSortIndicator("lastActionAt")}
                  </div>
                </th>
                <th className="py-2.5 px-3 text-right">Dynamic Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ArrowClockwise className="h-5 w-5 animate-spin text-indigo-600" />
                      <span className="text-xs">Resolving dynamic state machine authorizations...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-medium">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <CheckCircle className="h-6 w-6 text-emerald-500 opacity-60" />
                      <span className="text-slate-700 font-semibold text-xs">No action items in queue</span>
                      <span className="text-slate-500 text-[11px]">
                        {searchTerm || statusFilter !== "ALL" || equipmentTypeFilter !== "ALL"
                          ? "No tasks match your filter criteria. Try adjusting your filters."
                          : "All batches are up to date for your role authorization."}
                      </span>
                      {(searchTerm || statusFilter !== "ALL" || equipmentTypeFilter !== "ALL") && (
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition"
                        >
                          <ArrowCounterClockwise className="h-3 w-3 text-indigo-600" />
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const isSelected = selectedTaskIds.has(item.id);
                  const itemActions = actionsCache[item.id] || item.allowedActions || [];
                  const deduplicatedActions = deduplicateAllowedActions(itemActions);

                  return (
                    <tr
                      key={item.id}
                      className={`transition group ${isSelected ? "bg-indigo-50/60" : "hover:bg-slate-50/80"}`}
                    >
                      <td className="py-2.5 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleItemSelection(item.id)}
                          aria-label={`Select task for batch ${item.batchNo} stage ${item.equipmentCode}`}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-900">
                        <div className="font-bold text-slate-900 text-xs">{item.batchNo}</div>
                        <div className="text-[10px] text-slate-500 font-sans">{item.lotNo}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900 text-xs">{item.productName}</div>
                        <div className="text-[10px] font-mono text-slate-500">{item.productCode}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[10px]">
                          {item.equipmentCode}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-700 font-medium text-xs">{item.workflowStage}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        {item.rawStatus === "UNDER_REVIEW" || item.rawStatus === "IN_REVIEW" ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse shadow-xs"
                            title="A reviewer is currently processing this batch to prevent duplicate group efforts."
                          >
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600"></span>
                            </span>
                            {item.displayStatus}
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getStatusBadge(
                              item.rawStatus
                            )}`}
                          >
                            {item.displayStatus}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[10px]">
                        <div>{toDisplayDate(item.lastActionAt)}</div>
                        <div className="text-[9px] text-slate-400 font-sans">by {item.lastAction}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Canonical Compact View Details Button with Tooltip */}
                          <button
                            onClick={() => {
                              const detailUrl = `${ROUTES.iiotBatchDetails}/${item.batchNo}?lotNo=${encodeURIComponent(
                                item.lotNo
                              )}&equipmentCode=${encodeURIComponent(
                                item.equipmentCode
                              )}&returnTo=${encodeURIComponent(ROUTES.iiotMyActions)}`;
                              router.push(detailUrl);
                            }}
                            className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm transition hover:text-indigo-600 inline-flex items-center justify-center"
                            title="View Batch Details"
                            aria-label="View Batch Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          {/* Compact Assign to Me Button with Tooltip */}
                          {(item.rawStatus === "UNDER_REVIEW" || item.rawStatus === "IN_REVIEW" || item.rawStatus === "PENDING_APPROVAL") && (
                            <button
                              onClick={() => handleQuickClaim(item)}
                              className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm transition inline-flex items-center justify-center"
                              title="Claim this batch for your review"
                              aria-label="Claim this batch for your review"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Dynamically configured deduplicated row actions as compact icon buttons */}
                          {deduplicatedActions.map((action) => {
                            const code = (action.actionCode || "").toUpperCase();
                            const type = (action.actionType || "").toUpperCase();
                            const isApprove = type === "APPROVE" || code.includes("APPROVE");
                            const isReject = type === "REJECT" || type === "RETURN" || code.includes("REQUEST_ADDITIONAL") || code.includes("REJECT");
                            const isJustify = type === "JUSTIFY" || type === "RESPONSE" || code.includes("RESPONSE");
                            const isApprovalSubmit = code.includes("APPROVAL");
                            const isDefer = type === "DEFER" || code.includes("DEFER");

                            let buttonStyle = "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm";
                            if (isApprove) buttonStyle = "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm";
                            else if (isReject) buttonStyle = "bg-rose-600 hover:bg-rose-700 text-white shadow-sm";
                            else if (isJustify) buttonStyle = "bg-amber-600 hover:bg-amber-700 text-white shadow-sm";
                            else if (isApprovalSubmit) buttonStyle = "bg-blue-600 hover:bg-blue-700 text-white shadow-sm";
                            else if (isDefer) buttonStyle = "bg-purple-600 hover:bg-purple-700 text-white shadow-sm";

                            const title = action.displayName || action.actionName || action.actionCode;

                            let IconComponent = Lock;
                            if (code.includes("REVIEW") && (code.includes("SUBMIT") || code.includes("SEND"))) {
                              IconComponent = PaperPlaneTilt;
                            } else if (code.includes("APPROVAL") && (code.includes("SUBMIT") || code.includes("SEND"))) {
                              IconComponent = CheckSquare;
                            } else if (isReject) {
                              IconComponent = Question;
                            } else if (isJustify) {
                              IconComponent = ChatCenteredText;
                            } else if (isApprove) {
                              IconComponent = CheckCircle;
                            } else if (isDefer) {
                              IconComponent = ClockCountdown;
                            }

                            return (
                              <button
                                key={action.actionCode}
                                onClick={() => handleOpenActionModal(action, item)}
                                title={title}
                                aria-label={title}
                                className={`p-1.5 rounded-lg transition inline-flex items-center justify-center ${buttonStyle}`}
                              >
                                <IconComponent className="h-3.5 w-3.5" />
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
            pageSizeOptions={[5, 10, 20, 50]}
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

"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardText,
  Eye,
  MagnifyingGlass,
  Funnel,
  ArrowClockwise,
  ArrowCounterClockwise,
  Lock,
  CheckCircle,
  CaretDown,
  CaretUp,
  X,
  Tag,
  Flask,
  Barcode,
  Hash,
  Gear,
  WarningCircle,
  PaperPlaneTilt,
  CheckSquare,
  Question,
  ChatCenteredText,
  ClockCountdown,
} from "@phosphor-icons/react";
import {
  getBatchSummaryPaginated,
  getAllowedActions,
  deduplicateAllowedActions,
  type AllowedWorkflowAction,
} from "@/features/iiot/equipment/api/reports.api";
import type { BatchSummary } from "@/features/iiot/equipment/schemas/reports.schema";
import Pagination from "@/components/ui/Pagination";
import { WorkflowActionModal } from "../../components/WorkflowActionModal";
import { ROUTES } from "@/config/routes";

export interface PendingBatchItem {
  id: string;
  batchNo: string;
  lotNo: string;
  productCode: string;
  productName: string;
  equipmentCode: string;
  equipmentType: string;
  workflowStage: string;
  stageSequence: number;
  rawStatus: string;
  displayStatus: string;
  pendingSince: string;
  allowedActions: AllowedWorkflowAction[];
  summaryRef: BatchSummary;
}

export interface PendingBatchFilters {
  productCode: string;
  productName: string;
  batchNo: string;
  equipmentType: string;
  lotNo: string;
  status: string;
  searchTerm: string;
}

type SortField = "batchNo" | "productName" | "equipmentCode" | "workflowStage" | "rawStatus" | "pendingSince";
type SortDirection = "asc" | "desc";

const defaultFilters: PendingBatchFilters = {
  productCode: "ALL",
  productName: "",
  batchNo: "ALL",
  equipmentType: "ALL",
  lotNo: "ALL",
  status: "ALL",
  searchTerm: "",
};

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
    timeZone: "UTC",
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
  if (normalized === "UNDER_REVIEW" || normalized === "IN_REVIEW" || normalized === "CLAIMED") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  if (
    normalized === "RETURNED_TO_OPERATOR" ||
    normalized === "RETURNED" ||
    normalized === "REJECTED" ||
    normalized === "SENT_BACK" ||
    normalized === "REVISION_REQUIRED"
  ) {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
};

export default function PendingReportsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<PendingBatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Explicit In-Page Hierarchical Filters
  const [filters, setFilters] = useState<PendingBatchFilters>(defaultFilters);

  // Sorting State
  const [sortField, setSortField] = useState<SortField>("pendingSince");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal State
  const [modalAction, setModalAction] = useState<AllowedWorkflowAction | null>(null);
  const [selectedItem, setSelectedItem] = useState<PendingBatchItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionsCache, setActionsCache] = useState<Record<string, AllowedWorkflowAction[]>>({});

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // Fetch batch summaries (optimized to load latest 50 batches dynamically sorted by latest modified desc)
      const summaries = await getBatchSummaryPaginated({ limit: 50 }).catch(() => []);
      const extracted: PendingBatchItem[] = [];

      for (const summary of summaries) {
        const batchNo = toText(summary.batchNo);
        const lotNo = toText(summary.lotNo);
        const productCode = toText(summary.productCode);
        const productName = toText(summary.productName);
        const stages = (summary.stages as Array<Record<string, unknown>>) || [];
        const summaryId = toText(
          summary.id ||
            (summary as Record<string, unknown>)._id ||
            `${summary.lineId || "LINE"}_${batchNo}`
        );

        for (const stage of stages) {
          const equipmentCode = toText(stage.equipmentCode || stage.equipmentId);
          const equipmentType = toText(stage.equipmentType || equipmentCode.slice(-3)).toUpperCase();
          const approval = (stage.approval as Record<string, unknown>) || {};
          const rawStatus = toText(approval.status || "PENDING").toUpperCase();

          // Exclude approved, completed, and deferred batches (deferred batches belong on their separate page)
          if (rawStatus === "APPROVED" || rawStatus === "COMPLETED" || rawStatus === "DEFERRED") {
            continue;
          }

          const sequence = typeof stage.sequenceOrder === "number" ? stage.sequenceOrder : 1;
          let displayStatus = rawStatus.replace(/_/g, " ");
          if (rawStatus === "REVIEWER_REVIEWED" || rawStatus === "PENDING_APPROVAL") {
            displayStatus = "Pending Approval";
          } else if (rawStatus === "UNDER_REVIEW" || rawStatus === "IN_REVIEW") {
            displayStatus = "Under Review";
          } else if (
            rawStatus === "RETURNED_TO_OPERATOR" ||
            rawStatus === "RETURNED" ||
            rawStatus === "REJECTED" ||
            rawStatus === "SENT_BACK"
          ) {
            displayStatus = "Returned / Rejected";
          } else if (rawStatus === "PENDING" || rawStatus === "NOT_STARTED") {
            displayStatus = "Pending Submission";
          }

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
            pendingSince: toText(approval.transitionedAt || stage.stageEndAt || summary.updatedAt),
            allowedActions: [],
            summaryRef: summary,
          });
        }
      }

      setItems(extracted);
    } catch (err) {
      console.error("Failed to load Pending Batches data", err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to load pending batches. Please check network connectivity and try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleActionSuccess = () => {
    setSuccessMessage("Workflow action executed successfully!");
    loadData();
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  // Product Code -> Product Name lookup map
  const productCodeToNameMap = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((item) => {
      if (item.productCode && item.productName) {
        map.set(item.productCode.toUpperCase(), item.productName);
      }
    });
    return map;
  }, [items]);

  // Hierarchical Filter change handlers with cascading dependencies
  const handleFilterChange = (key: keyof PendingBatchFilters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "productCode") {
        if (value && value !== "ALL") {
          const trimmed = value.trim().toUpperCase();
          next.productCode = trimmed;
          next.productName = productCodeToNameMap.get(trimmed) || "";
        } else {
          next.productCode = "ALL";
          next.productName = "";
        }
        // Cascade reset down the hierarchy
        next.batchNo = "ALL";
        next.equipmentType = "ALL";
        next.lotNo = "ALL";
      } else if (key === "batchNo") {
        next.batchNo = value;
        // Cascade reset down the hierarchy
        next.equipmentType = "ALL";
        next.lotNo = "ALL";
      } else if (key === "equipmentType") {
        next.equipmentType = value;
        // Cascade reset down the hierarchy
        next.lotNo = "ALL";
      } else if (key === "lotNo") {
        next.lotNo = value;
      }
      return next;
    });
    setCurrentPage(1); // Always reset to page 1 on filter change
  };

  const handleResetFilters = () => {
    setFilters(defaultFilters);
    setCurrentPage(1);
  };

  // Hierarchical Cascading Options derived from data
  // Level 1: Product Codes
  const availableProductCodes = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.productCode).filter(Boolean))).sort();
  }, [items]);

  // Level 2: Scoped for Batch Numbers based on Product Code
  const scopedForBatch = useMemo(() => {
    if (!filters.productCode || filters.productCode === "ALL") return items;
    return items.filter((it) => it.productCode.toUpperCase() === filters.productCode.toUpperCase());
  }, [items, filters.productCode]);

  const availableBatchNos = useMemo(() => {
    return Array.from(new Set(scopedForBatch.map((i) => i.batchNo).filter(Boolean))).sort();
  }, [scopedForBatch]);

  // Level 3: Scoped for Equipment Types based on Product + Batch
  const scopedForEquipment = useMemo(() => {
    let list = scopedForBatch;
    if (filters.batchNo && filters.batchNo !== "ALL") {
      list = list.filter((it) => it.batchNo.toLowerCase() === filters.batchNo.toLowerCase());
    }
    return list;
  }, [scopedForBatch, filters.batchNo]);

  const availableEquipmentTypes = useMemo(() => {
    const types = new Set<string>();
    scopedForEquipment.forEach((i) => {
      if (i.equipmentType) types.add(i.equipmentType.toUpperCase());
    });
    return Array.from(types).sort();
  }, [scopedForEquipment]);

  // Level 4: Scoped for Lot Numbers based on Product + Batch + Equipment
  const scopedForLot = useMemo(() => {
    let list = scopedForEquipment;
    if (filters.equipmentType && filters.equipmentType !== "ALL") {
      list = list.filter((it) => it.equipmentType.toUpperCase() === filters.equipmentType.toUpperCase());
    }
    return list;
  }, [scopedForEquipment, filters.equipmentType]);

  const availableLotNos = useMemo(() => {
    return Array.from(new Set(scopedForLot.map((i) => i.lotNo).filter(Boolean))).sort();
  }, [scopedForLot]);

  // Filtering Logic (Server & Client Harmonized with AND semantics)
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Product Code filter
      if (filters.productCode && filters.productCode !== "ALL") {
        if (item.productCode.toUpperCase() !== filters.productCode.toUpperCase()) {
          return false;
        }
      }

      // 2. Batch Number filter
      if (filters.batchNo && filters.batchNo !== "ALL") {
        if (item.batchNo.toLowerCase() !== filters.batchNo.toLowerCase()) {
          return false;
        }
      }

      // 3. Equipment Type filter
      if (filters.equipmentType && filters.equipmentType !== "ALL") {
        if (item.equipmentType.toUpperCase() !== filters.equipmentType.toUpperCase()) {
          return false;
        }
      }

      // 4. Lot Number filter
      if (filters.lotNo && filters.lotNo !== "ALL") {
        if (item.lotNo.toLowerCase() !== filters.lotNo.toLowerCase()) {
          return false;
        }
      }

      // 5. Active Workflow Status filter (with updated Returned/Rejected mappings)
      if (filters.status && filters.status !== "ALL") {
        const matchStatus =
          (filters.status === "PENDING" &&
            (item.rawStatus === "PENDING" || item.rawStatus === "NOT_STARTED" || item.rawStatus === "DRAFT")) ||
          (filters.status === "UNDER_REVIEW" &&
            (item.rawStatus === "UNDER_REVIEW" || item.rawStatus === "IN_REVIEW" || item.rawStatus === "CLAIMED")) ||
          (filters.status === "PENDING_APPROVAL" &&
            (item.rawStatus === "REVIEWER_REVIEWED" || item.rawStatus === "PENDING_APPROVAL")) ||
          (filters.status === "RETURNED" &&
            (item.rawStatus === "RETURNED_TO_OPERATOR" ||
              item.rawStatus === "RETURNED" ||
              item.rawStatus === "REJECTED" ||
              item.rawStatus === "SENT_BACK" ||
              item.rawStatus === "REVISION_REQUIRED")) ||
          (filters.status === "CLAIMED" && item.rawStatus === "CLAIMED");
        if (!matchStatus) {
          return false;
        }
      }

      // 6. Fast search term filter
      if (filters.searchTerm.trim()) {
        const term = filters.searchTerm.trim().toLowerCase();
        const matchesTerm =
          item.batchNo.toLowerCase().includes(term) ||
          item.lotNo.toLowerCase().includes(term) ||
          item.productCode.toLowerCase().includes(term) ||
          item.productName.toLowerCase().includes(term) ||
          item.equipmentCode.toLowerCase().includes(term) ||
          item.workflowStage.toLowerCase().includes(term) ||
          item.displayStatus.toLowerCase().includes(term);
        if (!matchesTerm) {
          return false;
        }
      }

      return true;
    });
  }, [items, filters]);

  // Sorting Logic
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
        case "pendingSince":
        default: {
          const timeA = new Date(a.pendingSince).getTime() || 0;
          const timeB = new Date(b.pendingSince).getTime() || 0;
          comparison = timeA - timeB;
          break;
        }
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [filteredItems, sortField, sortDirection]);

  // Pagination Calculations with Safe Page Boundary
  const totalItems = sortedItems.length;
  const safeTotalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);

  const paginatedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, safeCurrentPage, pageSize]);

  // Parallel resolution of allowed actions only for visible page items
  useEffect(() => {
    if (paginatedItems.length === 0) return;

    const unCachedItems = paginatedItems.filter((it) => !actionsCache[it.id]);
    if (unCachedItems.length === 0) return;

    let isSubscribed = true;

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
    ).then((results) => {
      if (!isSubscribed) return;
      setActionsCache((prev) => {
        const updated = { ...prev };
        for (const res of results) {
          updated[res.id] = res.actions;
        }
        return updated;
      });
    });

    return () => {
      isSubscribed = false;
    };
  }, [paginatedItems, actionsCache]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.productCode && filters.productCode !== "ALL") count++;
    if (filters.batchNo && filters.batchNo !== "ALL") count++;
    if (filters.equipmentType && filters.equipmentType !== "ALL") count++;
    if (filters.lotNo && filters.lotNo !== "ALL") count++;
    if (filters.status && filters.status !== "ALL") count++;
    if (filters.searchTerm.trim()) count++;
    return count;
  }, [filters]);

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
      <CaretUp className="h-3.5 w-3.5 text-amber-600 inline ml-1 font-bold" />
    ) : (
      <CaretDown className="h-3.5 w-3.5 text-amber-600 inline ml-1 font-bold" />
    );
  };

  return (
    <div className="flex-1 space-y-6 p-6 bg-slate-50 text-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <ClipboardText className="h-7 w-7 text-amber-600" />
            Pending Batch Reviews & Approvals
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Global queue of all active in-flight batch stages undergoing review or approval.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-medium border border-slate-200 shadow-sm transition"
          >
            <ArrowClockwise className={`h-4 w-4 text-slate-600 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Queue
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm animate-in fade-in duration-300">
          <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm font-medium flex items-center justify-between shadow-sm animate-in fade-in duration-300">
          <div className="flex items-center gap-2">
            <WarningCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={loadData}
            className="text-xs bg-rose-100 hover:bg-rose-200 text-rose-900 px-2.5 py-1 rounded font-semibold transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Explicit In-Page Hierarchical Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        {/* Top Filter Row: Search + Status Selector + Reset */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          {/* Keyword Search Input */}
          <div className="relative flex-1 max-w-lg">
            <MagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by batch, lot, product, or equipment..."
              value={filters.searchTerm}
              onChange={(e) => handleFilterChange("searchTerm", e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-8 py-2 text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 shadow-sm"
            />
            {filters.searchTerm && (
              <button
                type="button"
                onClick={() => handleFilterChange("searchTerm", "")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Workflow Status Filter Dropdown */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="filter-status" className="text-xs font-bold text-slate-600 whitespace-nowrap">
                Workflow Status:
              </label>
              <select
                id="filter-status"
                value={filters.status}
                onChange={(e) => handleFilterChange("status", e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
              >
                <option value="ALL">All Pending States</option>
                <option value="PENDING">Pending Submission</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="RETURNED">Returned to Operator / Rejected</option>
                <option value="PENDING_APPROVAL">Pending Final Approval</option>
                <option value="CLAIMED">Claimed / Locked</option>
              </select>
            </div>

            {/* Clear All Filters Button */}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition shadow-sm"
                title="Reset all filters"
              >
                <ArrowCounterClockwise className="h-3.5 w-3.5 text-slate-500" />
                <span>Clear Filters ({activeFilterCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* Hierarchical Explicit Filter Row (Product Code -> Product Name (Read-Only) -> Batch No -> Equipment -> Lot No) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
          {/* Level 1: Product Code */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Tag className="h-3.5 w-3.5 text-indigo-500" /> Product Code:
            </label>
            <select
              value={filters.productCode}
              onChange={(e) => handleFilterChange("productCode", e.target.value)}
              className="w-full bg-slate-50 hover:bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 transition shadow-sm"
            >
              <option value="ALL">All Products</option>
              {availableProductCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          {/* Product Name: Read-Only Textbox (Populates on Product Code selection) */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Flask className="h-3.5 w-3.5 text-blue-500" /> Product Name:
            </label>
            <input
              type="text"
              readOnly
              value={filters.productName || (filters.productCode === "ALL" ? "All Products Active" : "-")}
              placeholder="Auto-populated product name"
              className="w-full bg-slate-100/90 border border-slate-300 text-slate-700 font-medium rounded-xl px-2.5 py-1.5 text-xs cursor-default truncate select-all focus:outline-none shadow-inner"
              title={filters.productName || "Product name auto-populates on product code selection"}
            />
          </div>

          {/* Level 2: Batch Number (Cascading based on Product Code) */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Barcode className="h-3.5 w-3.5 text-emerald-500" /> Batch Number:
            </label>
            <select
              value={filters.batchNo}
              onChange={(e) => handleFilterChange("batchNo", e.target.value)}
              className="w-full bg-slate-50 hover:bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 transition shadow-sm"
            >
              <option value="ALL">All Batches</option>
              {availableBatchNos.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Level 3: Equipment Type (Cascading based on Product + Batch) */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Gear className="h-3.5 w-3.5 text-purple-500" /> Equipment Type:
            </label>
            <select
              value={filters.equipmentType}
              onChange={(e) => handleFilterChange("equipmentType", e.target.value)}
              className="w-full bg-slate-50 hover:bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 transition shadow-sm"
            >
              <option value="ALL">All Equipment</option>
              {availableEquipmentTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Level 4: Lot Number (Cascading based on Product + Batch + Equipment) */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Hash className="h-3.5 w-3.5 text-amber-500" /> Lot Number:
            </label>
            <select
              value={filters.lotNo}
              onChange={(e) => handleFilterChange("lotNo", e.target.value)}
              className="w-full bg-slate-50 hover:bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 transition shadow-sm"
            >
              <option value="ALL">All Lots</option>
              {availableLotNos.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Summary & Total Records Counter */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-slate-800 font-bold">{totalItems}</strong> of{" "}
              <strong className="text-slate-800 font-bold">{items.length}</strong> active pending stages
            </span>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-[10px] font-bold">
                Filtered
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400">
            Page {safeCurrentPage} of {safeTotalPages}
          </span>
        </div>
      </div>

      {/* Pending Batches Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200 select-none">
              <tr>
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
                    Status
                    {renderSortIndicator("rawStatus")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("pendingSince")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center">
                    Last Activity
                    {renderSortIndicator("pendingSince")}
                  </div>
                </th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ArrowClockwise className="h-6 w-6 animate-spin text-amber-600" />
                      <span>Loading active pending batch operations...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-medium">
                    {items.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-1">
                        <CheckCircle className="h-8 w-8 text-emerald-500 opacity-60" />
                        <span className="text-slate-700 font-semibold text-sm">No pending batches</span>
                        <span className="text-slate-500 text-xs">
                          All in-flight batches have completed workflow processing.
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Funnel className="h-8 w-8 text-slate-400 opacity-60" />
                        <span className="text-slate-700 font-semibold text-sm">
                          No pending batches match your filter criteria
                        </span>
                        <span className="text-slate-500 text-xs">
                          Try adjusting or clearing your filters to see more results.
                        </span>
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition shadow-sm"
                        >
                          <ArrowCounterClockwise className="h-3.5 w-3.5 text-amber-600" />
                          Clear All Filters
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition group">
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
                      {toDisplayDate(item.pendingSince)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Compact View Details Button with Tooltip */}
                        <button
                          onClick={() => {
                            const detailUrl = `${ROUTES.iiotBatchDetails}/${item.batchNo}?lotNo=${encodeURIComponent(
                              item.lotNo
                            )}&equipmentCode=${encodeURIComponent(
                              item.equipmentCode
                            )}&returnTo=${encodeURIComponent(ROUTES.iiotPendingBatches)}`;
                            router.push(detailUrl);
                          }}
                          title="View Batch Details"
                          aria-label="View Batch Details"
                          className="p-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm transition hover:text-indigo-600 inline-flex items-center justify-center"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {(actionsCache[item.id] || item.allowedActions || []).map((action) => {
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
                              onClick={() => {
                                setModalAction(action);
                                setSelectedItem(item);
                                setIsModalOpen(true);
                              }}
                              title={title}
                              aria-label={title}
                              className={`p-2 rounded-lg transition inline-flex items-center justify-center ${buttonStyle}`}
                            >
                              <IconComponent className="h-4 w-4" />
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Reusable Unified Pagination Component */}
        {!isLoading && totalItems > 0 && (
          <div className="p-3.5 border-t border-slate-200 bg-slate-50/50">
            <Pagination
              page={safeCurrentPage}
              pageSize={pageSize}
              totalRecords={totalItems}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(sz) => {
                setPageSize(sz);
                setCurrentPage(1);
              }}
              pageSizeOptions={[10, 25, 50, 100]}
            />
          </div>
        )}
      </div>

      {/* 5-Step Dynamic Workflow Action Modal */}
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
          tenantId="TNT-0001"
          plantId="PLNT-0001"
        />
      )}
    </div>
  );
}

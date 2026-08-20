"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ClockCountdown,
  Eye,
  MagnifyingGlass,
  Funnel,
  ArrowClockwise,
  ArrowCounterClockwise,
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
  CalendarBlank,
  User,
} from "@phosphor-icons/react";
import {
  getBatchSummaryPaginated,
  getAllowedActions,
  type AllowedWorkflowAction,
} from "@/features/iiot/equipment/api/reports.api";
import type { BatchSummary } from "@/features/iiot/equipment/schemas/reports.schema";
import Pagination from "@/components/ui/Pagination";
import { WorkflowActionModal } from "../../components/WorkflowActionModal";
import { BatchQueueSwitcher } from "../../components/BatchQueueSwitcher";
import { ROUTES } from "@/config/routes";

export interface DeferredBatchItem {
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
  deferredBy: string;
  deferredAt: string;
  deferralReason: string;
  comments: string;
  allowedActions: AllowedWorkflowAction[];
  summaryRef: BatchSummary;
}

export interface DeferredBatchFilters {
  productCode: string;
  productName: string;
  batchNo: string;
  equipmentType: string;
  lotNo: string;
  deferredBy: string;
  fromDate: string;
  toDate: string;
  searchTerm: string;
}

type SortField =
  | "batchNo"
  | "productName"
  | "equipmentCode"
  | "workflowStage"
  | "deferredBy"
  | "deferredAt";
type SortDirection = "asc" | "desc";

const defaultFilters: DeferredBatchFilters = {
  productCode: "",
  productName: "",
  batchNo: "",
  equipmentType: "ALL",
  lotNo: "",
  deferredBy: "",
  fromDate: "",
  toDate: "",
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
  }).format(date);
};

export default function DeferredBatchesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<DeferredBatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters State
  const [filters, setFilters] = useState<DeferredBatchFilters>(defaultFilters);

  // Sorting State: Default = Most recently deferred first
  const [sortField, setSortField] = useState<SortField>("deferredAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal State
  const [modalAction, setModalAction] = useState<AllowedWorkflowAction | null>(null);
  const [selectedItem, setSelectedItem] = useState<DeferredBatchItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const summaries = await getBatchSummaryPaginated();
      const extracted: DeferredBatchItem[] = [];

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

          // CRITICAL: Deferred batches MUST return ONLY status = DEFERRED
          if (rawStatus !== "DEFERRED") {
            continue;
          }

          const sequence = typeof stage.sequenceOrder === "number" ? stage.sequenceOrder : 1;
          const displayStatus = "Deferred";
          const id = `${summaryId}:${batchNo}:${lotNo}:${equipmentCode}:${sequence}`;

          let allowedActions: AllowedWorkflowAction[] = [];
          try {
            allowedActions = await getAllowedActions({
              batchNo,
              lotNo,
              equipmentCode,
            });
          } catch (err) {
            console.error(`Failed allowed actions for deferred item ${id}`, err);
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
            deferredBy: toText(approval.transitionedBy || approval.approvedBy || "QA Reviewer"),
            deferredAt: toText(approval.transitionedAt || summary.updatedAt),
            deferralReason: toText(approval.justification || approval.comments || "Quality review deferral"),
            comments: toText(approval.comments),
            allowedActions,
            summaryRef: summary,
          });
        }
      }

      setItems(extracted);
    } catch (err) {
      console.error("Failed to load Deferred Batches data", err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to load deferred batches. Please check network connectivity and try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // Filter change handlers
  const handleFilterChange = (key: keyof DeferredBatchFilters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-populate read-only product name when product code is selected/entered
      if (key === "productCode") {
        const trimmed = value.trim().toUpperCase();
        if (productCodeToNameMap.has(trimmed)) {
          next.productName = productCodeToNameMap.get(trimmed) || "";
        } else if (!value.trim()) {
          next.productName = "";
        }
      }
      return next;
    });
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilters(defaultFilters);
    setCurrentPage(1);
  };

  // Dynamic filter options
  const availableProductCodes = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.productCode).filter(Boolean))).sort();
  }, [items]);

  const availableEquipmentTypes = useMemo(() => {
    const types = new Set<string>();
    items.forEach((i) => {
      if (i.equipmentType) types.add(i.equipmentType.toUpperCase());
    });
    return Array.from(types).sort();
  }, [items]);

  // Filtering Logic
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filters.productCode.trim()) {
        const query = filters.productCode.trim().toLowerCase();
        if (!item.productCode.toLowerCase().includes(query)) return false;
      }

      if (filters.productName.trim()) {
        const query = filters.productName.trim().toLowerCase();
        if (!item.productName.toLowerCase().includes(query)) return false;
      }

      if (filters.batchNo.trim()) {
        const query = filters.batchNo.trim().toLowerCase();
        if (!item.batchNo.toLowerCase().includes(query)) return false;
      }

      if (filters.equipmentType && filters.equipmentType !== "ALL") {
        if (item.equipmentType.toUpperCase() !== filters.equipmentType.toUpperCase()) {
          return false;
        }
      }

      if (filters.lotNo.trim()) {
        const query = filters.lotNo.trim().toLowerCase();
        if (!item.lotNo.toLowerCase().includes(query)) return false;
      }

      if (filters.deferredBy.trim()) {
        const query = filters.deferredBy.trim().toLowerCase();
        if (!item.deferredBy.toLowerCase().includes(query)) return false;
      }

      if (filters.fromDate) {
        const itemDate = new Date(item.deferredAt).getTime();
        const [y, m, d] = filters.fromDate.split("-").map(Number);
        const fromDate = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
        if (!isNaN(itemDate) && !isNaN(fromDate) && itemDate < fromDate) return false;
      }

      if (filters.toDate) {
        const itemDate = new Date(item.deferredAt).getTime();
        const [y, m, d] = filters.toDate.split("-").map(Number);
        const toDate = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
        if (!isNaN(itemDate) && !isNaN(toDate) && itemDate > toDate) return false;
      }

      if (filters.searchTerm.trim()) {
        const term = filters.searchTerm.trim().toLowerCase();
        const matchesTerm =
          item.batchNo.toLowerCase().includes(term) ||
          item.lotNo.toLowerCase().includes(term) ||
          item.productCode.toLowerCase().includes(term) ||
          item.productName.toLowerCase().includes(term) ||
          item.equipmentCode.toLowerCase().includes(term) ||
          item.deferredBy.toLowerCase().includes(term) ||
          item.deferralReason.toLowerCase().includes(term);
        if (!matchesTerm) return false;
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
        case "deferredBy":
          comparison = a.deferredBy.localeCompare(b.deferredBy);
          break;
        case "deferredAt":
        default: {
          const timeA = new Date(a.deferredAt).getTime() || 0;
          const timeB = new Date(b.deferredAt).getTime() || 0;
          comparison = timeA - timeB;
          break;
        }
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [filteredItems, sortField, sortDirection]);

  // Pagination Calculations
  const totalItems = sortedItems.length;
  const safeTotalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);

  const paginatedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, safeCurrentPage, pageSize]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.productCode.trim()) count++;
    if (filters.productName.trim()) count++;
    if (filters.batchNo.trim()) count++;
    if (filters.equipmentType !== "ALL") count++;
    if (filters.lotNo.trim()) count++;
    if (filters.deferredBy.trim()) count++;
    if (filters.fromDate) count++;
    if (filters.toDate) count++;
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

  const handleExecuteAction = (item: DeferredBatchItem, act: AllowedWorkflowAction) => {
    setSelectedItem(item);
    setModalAction(act);
    setIsModalOpen(true);
  };

  const handleActionSuccess = () => {
    setSuccessMessage("Workflow action executed successfully!");
    loadData();
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  return (
    <div className="flex-1 space-y-6 p-6 bg-slate-50 text-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <ClockCountdown className="h-7 w-7 text-amber-600" />
            Deferred Batches Queue
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Isolated queue of batches deferred during QA review pending further investigation or re-evaluation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BatchQueueSwitcher currentQueue="DEFERRED" />
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

      {/* Filters Section */}
      <section
        aria-label="Deferred batches filters"
        className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Funnel className="h-4 w-4 text-amber-600 font-bold" />
            <span className="text-sm font-semibold text-slate-800">Filter Deferred Batches</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 rounded-full">
                {activeFilterCount} active
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                <ArrowCounterClockwise className="h-3.5 w-3.5 text-slate-500" />
                Reset Filters
              </button>
            )}
            <span className="text-xs text-slate-500 font-medium">
              Showing {totalItems} of {items.length} deferred batches
            </span>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* 1. Product Code */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1">
              <Barcode className="h-3.5 w-3.5 text-slate-400" />
              Product Code
            </label>
            <div className="relative">
              <input
                type="text"
                list="deferredProductCodeList"
                placeholder="e.g. STAPU1000"
                value={filters.productCode}
                onChange={(e) => handleFilterChange("productCode", e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition"
              />
              <datalist id="deferredProductCodeList">
                {availableProductCodes.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
              {filters.productCode && (
                <button
                  type="button"
                  onClick={() => handleFilterChange("productCode", "")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* 2. Product Name (Auto-populated & Read-Only if Code selected) */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1">
              <Flask className="h-3.5 w-3.5 text-slate-400" />
              Product Name
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Auto-populated name"
                value={filters.productName}
                readOnly={Boolean(filters.productCode.trim() && filters.productName)}
                onChange={(e) => handleFilterChange("productName", e.target.value)}
                className={`w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition ${
                  filters.productCode.trim() && filters.productName
                    ? "bg-slate-100 cursor-not-allowed text-slate-700 font-medium"
                    : "bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                }`}
              />
              {filters.productName && !filters.productCode && (
                <button
                  type="button"
                  onClick={() => handleFilterChange("productName", "")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* 3. Batch Number */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1">
              <Hash className="h-3.5 w-3.5 text-slate-400" />
              Batch Number
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. BATCH-G5-001"
                value={filters.batchNo}
                onChange={(e) => handleFilterChange("batchNo", e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono transition"
              />
              {filters.batchNo && (
                <button
                  type="button"
                  onClick={() => handleFilterChange("batchNo", "")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* 4. Equipment Type */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1">
              <Gear className="h-3.5 w-3.5 text-slate-400" />
              Equipment Type
            </label>
            <div className="relative">
              <select
                value={filters.equipmentType}
                onChange={(e) => handleFilterChange("equipmentType", e.target.value)}
                className="w-full appearance-none bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 pr-8 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition cursor-pointer"
              >
                <option value="ALL">All Equipment</option>
                <option value="RMG">RMG (Granulator)</option>
                <option value="FBD">FBD (Dryer)</option>
                <option value="OGB">OGB (Blender)</option>
                {availableEquipmentTypes
                  .filter((t) => !["RMG", "FBD", "OGB"].includes(t))
                  .map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
              </select>
              <CaretDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>

          {/* 5. Lot Number */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1">
              <Tag className="h-3.5 w-3.5 text-slate-400" />
              Lot Number
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. LOT-G5-001"
                value={filters.lotNo}
                onChange={(e) => handleFilterChange("lotNo", e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono transition"
              />
              {filters.lotNo && (
                <button
                  type="button"
                  onClick={() => handleFilterChange("lotNo", "")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* 6. Deferred By */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-slate-400" />
              Deferred By
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="User name / ID"
                value={filters.deferredBy}
                onChange={(e) => handleFilterChange("deferredBy", e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition"
              />
              {filters.deferredBy && (
                <button
                  type="button"
                  onClick={() => handleFilterChange("deferredBy", "")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Secondary Filter Line: Quick Search & Date Range */}
        <div className="pt-2 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md w-full">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search across deferred batches & reasons..."
              value={filters.searchTerm}
              onChange={(e) => handleFilterChange("searchTerm", e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-4 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {filters.searchTerm && (
              <button
                type="button"
                onClick={() => handleFilterChange("searchTerm", "")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto text-xs text-slate-600">
            <span className="flex items-center gap-1 font-medium">
              <CalendarBlank className="h-3.5 w-3.5 text-slate-400" />
              Deferred Date:
            </span>
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) => handleFilterChange("fromDate", e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500"
            />
            <span>to</span>
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) => handleFilterChange("toDate", e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>
      </section>

      {/* Deferred Batches Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200 select-none">
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
                  onClick={() => handleSortToggle("deferredBy")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center">
                    Deferred By
                    {renderSortIndicator("deferredBy")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("deferredAt")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center">
                    Deferred Date
                    {renderSortIndicator("deferredAt")}
                  </div>
                </th>
                <th className="py-3.5 px-4">Deferral Note / Reason</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ArrowClockwise className="h-6 w-6 animate-spin text-amber-600" />
                      <span>Loading deferred batches...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-medium">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <CheckCircle className="h-8 w-8 text-slate-300" />
                      <span className="text-slate-700 font-semibold text-sm">No deferred batches found</span>
                      <span className="text-slate-500 text-xs">
                        {activeFilterCount > 0
                          ? "No records match your filter criteria. Try adjusting your filters."
                          : "No batches are currently placed on deferred status."}
                      </span>
                      {activeFilterCount > 0 && (
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition shadow-sm"
                        >
                          <ArrowCounterClockwise className="h-3.5 w-3.5 text-amber-600" />
                          Clear All Filters
                        </button>
                      )}
                    </div>
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
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        <User className="h-3 w-3 text-amber-600" />
                        {item.deferredBy}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {toDisplayDate(item.deferredAt)}
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-slate-600 text-[11px]" title={item.deferralReason}>
                      {item.deferralReason || "-"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            const detailUrl = `${ROUTES.iiotBatchDetails}/${item.batchNo}?lotNo=${encodeURIComponent(
                              item.lotNo
                            )}&equipmentCode=${encodeURIComponent(
                              item.equipmentCode
                            )}&returnTo=${encodeURIComponent(ROUTES.iiotDeferredBatches)}`;
                            router.push(detailUrl);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium text-xs shadow-sm transition"
                          title="View Batch Details"
                        >
                          <Eye className="h-3.5 w-3.5 text-slate-500" /> Details
                        </button>

                        {/* Allowed Dynamic Workflow Action Buttons */}
                        {item.allowedActions.map((act) => (
                          <button
                            key={act.actionCode}
                            onClick={() => handleExecuteAction(item, act)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition"
                            title={act.displayName}
                          >
                            {act.displayName}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Reusable Unified Pagination */}
        {!isLoading && totalItems > 0 && (
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
        )}
      </div>

      {/* Dynamic Workflow Action Modal */}
      {isModalOpen && modalAction && selectedItem && (
        <WorkflowActionModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setModalAction(null);
            setSelectedItem(null);
          }}
          onSuccess={handleActionSuccess}
          action={modalAction}
          batchContext={{
            batchNo: selectedItem.batchNo,
            lotNo: selectedItem.lotNo,
            equipmentCode: selectedItem.equipmentCode,
            productName: selectedItem.productName,
            currentStatus: selectedItem.rawStatus,
          }}
        />
      )}
    </div>
  );
}

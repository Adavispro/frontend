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
import PendingBatchFilterPopover from "../components/PendingBatchFilterPopover";
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
  return "bg-slate-100 text-slate-700 border-slate-200";
};

export default function PendingReportsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<PendingBatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Legacy Filter States
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

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const summaries = await getBatchSummaryPaginated();
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

          // Only show pending / active workflow stages (exclude approved, completed, and deferred)
          if (rawStatus === "APPROVED" || rawStatus === "COMPLETED" || rawStatus === "DEFERRED") {
            continue;
          }

          const sequence = typeof stage.sequenceOrder === "number" ? stage.sequenceOrder : 1;
          let displayStatus = rawStatus.replace(/_/g, " ");
          if (rawStatus === "REVIEWER_REVIEWED") displayStatus = "Pending Approval";
          if (rawStatus === "UNDER_REVIEW") displayStatus = "Under Review";
          if (rawStatus === "RETURNED_TO_OPERATOR") displayStatus = "Returned to Operator";

          const id = `${summaryId}:${batchNo}:${lotNo}:${equipmentCode}:${sequence}`;

          let allowedActions: AllowedWorkflowAction[] = [];
          try {
            allowedActions = await getAllowedActions({
              batchNo,
              lotNo,
              equipmentCode,
            });
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
            pendingSince: toText(approval.transitionedAt || stage.stageEndAt || summary.updatedAt),
            allowedActions,
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

  // Legacy Filter Popover State
  const [isFilterOpen, setIsFilterOpen] = useState(false);

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

  // Filter change handlers with dynamic dependency cascading
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
      }
      return next;
    });
    setCurrentPage(1); // Always reset to page 1 on filter change
  };

  const handleResetFilters = () => {
    setFilters(defaultFilters);
    setCurrentPage(1);
  };

  // Dynamic Options derived from data with cascading dependencies
  const availableProductCodes = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.productCode).filter(Boolean))).sort();
  }, [items]);

  const scopedItemsForProduct = useMemo(() => {
    if (!filters.productCode || filters.productCode === "ALL") return items;
    return items.filter((it) => it.productCode.toUpperCase() === filters.productCode.toUpperCase());
  }, [items, filters.productCode]);

  const availableBatchNos = useMemo(() => {
    return Array.from(new Set(scopedItemsForProduct.map((i) => i.batchNo).filter(Boolean))).sort();
  }, [scopedItemsForProduct]);

  const availableEquipmentTypes = useMemo(() => {
    const types = new Set<string>();
    scopedItemsForProduct.forEach((i) => {
      if (i.equipmentType) types.add(i.equipmentType.toUpperCase());
    });
    return Array.from(types).sort();
  }, [scopedItemsForProduct]);

  const availableLotNos = useMemo(() => {
    return Array.from(new Set(scopedItemsForProduct.map((i) => i.lotNo).filter(Boolean))).sort();
  }, [scopedItemsForProduct]);

  // Filtering Logic (Server & Client Harmonized with AND semantics)
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Product Code filter
      if (filters.productCode && filters.productCode !== "ALL") {
        if (item.productCode.toUpperCase() !== filters.productCode.toUpperCase()) {
          return false;
        }
      }

      // 2. Product Name filter (only when productCode is ALL)
      if (filters.productName.trim() && (!filters.productCode || filters.productCode === "ALL")) {
        const query = filters.productName.trim().toLowerCase();
        if (!item.productName.toLowerCase().includes(query)) {
          return false;
        }
      }

      // 3. Batch Number filter
      if (filters.batchNo && filters.batchNo !== "ALL") {
        if (item.batchNo.toLowerCase() !== filters.batchNo.toLowerCase()) {
          return false;
        }
      }

      // 4. Equipment Type filter
      if (filters.equipmentType && filters.equipmentType !== "ALL") {
        if (item.equipmentType.toUpperCase() !== filters.equipmentType.toUpperCase()) {
          return false;
        }
      }

      // 5. Lot Number filter
      if (filters.lotNo && filters.lotNo !== "ALL") {
        if (item.lotNo.toLowerCase() !== filters.lotNo.toLowerCase()) {
          return false;
        }
      }

      // 6. Active Status filter
      if (filters.status && filters.status !== "ALL") {
        const matchStatus =
          (filters.status === "PENDING" && (item.rawStatus === "PENDING" || item.rawStatus === "NOT_STARTED")) ||
          (filters.status === "UNDER_REVIEW" && (item.rawStatus === "UNDER_REVIEW" || item.rawStatus === "IN_REVIEW")) ||
          (filters.status === "PENDING_APPROVAL" && (item.rawStatus === "REVIEWER_REVIEWED" || item.rawStatus === "PENDING_APPROVAL")) ||
          (filters.status === "RETURNED" && (item.rawStatus === "RETURNED_TO_OPERATOR" || item.rawStatus === "REJECTED"));
        if (!matchStatus) {
          return false;
        }
      }

      // 7. Fast search term filter
      if (filters.searchTerm.trim()) {
        const term = filters.searchTerm.trim().toLowerCase();
        const matchesTerm =
          item.batchNo.toLowerCase().includes(term) ||
          item.lotNo.toLowerCase().includes(term) ||
          item.productCode.toLowerCase().includes(term) ||
          item.productName.toLowerCase().includes(term) ||
          item.equipmentCode.toLowerCase().includes(term) ||
          item.workflowStage.toLowerCase().includes(term);
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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.productCode && filters.productCode !== "ALL") count++;
    if (filters.productName.trim() && (!filters.productCode || filters.productCode === "ALL")) count++;
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
          <BatchQueueSwitcher currentQueue="PENDING" />
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

      {/* Toolbar with Search and Legacy Filter Popover Button */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
          {/* Keyword Search Input */}
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by batch, lot, product, or equipment..."
              value={filters.searchTerm}
              onChange={(e) => handleFilterChange("searchTerm", e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
            {filters.searchTerm && (
              <button
                type="button"
                onClick={() => handleFilterChange("searchTerm", "")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Popover Anchor & Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsFilterOpen((prev) => !prev)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border transition shadow-sm ${
                activeFilterCount > 0
                  ? "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Funnel className={`h-3.5 w-3.5 ${activeFilterCount > 0 ? "text-amber-600" : "text-slate-500"}`} />
              <span>Filter</span>
              <CaretDown className="h-3 w-3 text-slate-400" />
              {activeFilterCount > 0 && (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-600 px-1 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Filter Popover */}
            <PendingBatchFilterPopover
              isOpen={isFilterOpen}
              onClose={() => setIsFilterOpen(false)}
              filters={filters}
              onChange={handleFilterChange}
              onReset={handleResetFilters}
              availableProductCodes={availableProductCodes}
              availableBatchNos={availableBatchNos}
              availableEquipmentTypes={availableEquipmentTypes}
              availableLotNos={availableLotNos}
              activeFilterCount={activeFilterCount}
            />
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              title="Reset filters"
            >
              <ArrowCounterClockwise className="h-3.5 w-3.5 text-slate-500" />
              <span>Reset</span>
            </button>
          )}
        </div>

        <span className="text-xs text-slate-500 font-medium">
          Showing {totalItems} of {items.length} pending batches
        </span>
      </div>

      {/* Pending Batches Table */}
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
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            const detailUrl = `${ROUTES.iiotBatchDetails}/${item.batchNo}?lotNo=${encodeURIComponent(
                              item.lotNo
                            )}&equipmentCode=${encodeURIComponent(
                              item.equipmentCode
                            )}&returnTo=${encodeURIComponent(ROUTES.iiotPendingBatches)}`;
                            router.push(detailUrl);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium text-xs shadow-sm transition"
                        >
                          <Eye className="h-3.5 w-3.5 text-slate-500" /> Details
                        </button>

                        {item.allowedActions.map((action) => {
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
                              onClick={() => {
                                setModalAction(action);
                                setSelectedItem(item);
                                setIsModalOpen(true);
                              }}
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
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Reusable Unified Pagination Component */}
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

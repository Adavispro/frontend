"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Eye,
  MagnifyingGlass,
  Funnel,
  ArrowClockwise,
  ArrowCounterClockwise,
  DownloadSimple,
  CheckCircle,
  CaretUp,
  CaretDown,
  X,
  Tag,
  Flask,
  Barcode,
  Hash,
  Gear,
  CalendarBlank,
  User,
  WarningCircle,
  SpinnerGap,
} from "@phosphor-icons/react";
import {
  getBatchSummaryPaginated,
  downloadBatchPdfBlob,
} from "@/features/iiot/equipment/api/reports.api";
import type { BatchSummary } from "@/features/iiot/equipment/schemas/reports.schema";
import Pagination from "@/components/ui/Pagination";
import { ROUTES } from "@/config/routes";

export interface ApprovedBatchItem {
  id: string;
  batchNo: string;
  lotNo: string;
  productCode: string;
  productName: string;
  equipmentCode: string;
  equipmentType: string;
  workflowStage: string;
  stageSequence: number;
  approvedBy: string;
  approvedAt: string;
  rawStatus: string;
  displayStatus: string;
  pdfDocumentId?: string;
  summaryRef: BatchSummary;
}

export interface ApprovedBatchFilters {
  productCode: string;
  productName: string;
  batchNo: string;
  equipmentType: string;
  lotNo: string;
  approvedBy: string;
  fromDate: string;
  toDate: string;
  searchTerm: string;
}

type SortField =
  | "batchNo"
  | "productName"
  | "equipmentCode"
  | "workflowStage"
  | "approvedBy"
  | "approvedAt";
type SortDirection = "asc" | "desc";

// Helper to compute ISO date string for N days ago
const getDefaultLast30Days = () => {
  const now = new Date();
  const past = new Date();
  past.setDate(now.getDate() - 30);
  return {
    fromDate: past.toISOString().slice(0, 10),
    toDate: now.toISOString().slice(0, 10),
  };
};

const defaultDates = getDefaultLast30Days();

const defaultFilters: ApprovedBatchFilters = {
  productCode: "ALL",
  productName: "",
  batchNo: "ALL",
  equipmentType: "ALL",
  lotNo: "ALL",
  approvedBy: "ALL",
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
    timeZone: "UTC",
  }).format(date);
};

export default function ApprovedBatchesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ApprovedBatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadingBatchNo, setDownloadingBatchNo] = useState<string | null>(null);

  // In-Page Hierarchical Explicit Filters
  const [filters, setFilters] = useState<ApprovedBatchFilters>(defaultFilters);

  // Sorting State: Default requirement = Most recently approved first (Approved Date DESC)
  const [sortField, setSortField] = useState<SortField>("approvedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // Dynamic single-page query for latest modified approved batches
      const summaries = await getBatchSummaryPaginated({ status: "APPROVED", limit: 50 });
      const extracted: ApprovedBatchItem[] = [];

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
          const rawStatus = toText(approval.status || summary.overallStatus || summary.batchStatus || "PENDING").toUpperCase();

          // CRITICAL: Approved Batches MUST show ONLY status = APPROVED / COMPLETED
          if (rawStatus !== "APPROVED" && rawStatus !== "COMPLETED") {
            continue;
          }

          const sequence = typeof stage.sequenceOrder === "number" ? stage.sequenceOrder : 1;
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
            approvedBy: toText(approval.approvedBy || approval.transitionedBy || "QA Approver"),
            approvedAt: toText(approval.approvedAt || approval.transitionedAt || summary.updatedAt),
            rawStatus,
            displayStatus: "Approved",
            pdfDocumentId: toText(approval.pdfDocumentId || summary.pdfDocumentId),
            summaryRef: summary,
          });
        }
      }

      setItems(extracted);
    } catch (err) {
      console.error("Failed to load Approved Batches data", err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to load approved batches. Please check network connectivity and try again."
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

  // Hierarchical Filter change handlers with dynamic cascading dependencies
  const handleFilterChange = (key: keyof ApprovedBatchFilters, value: string) => {
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
        next.equipmentType = "ALL";
        next.lotNo = "ALL";
      } else if (key === "equipmentType") {
        next.equipmentType = value;
        next.lotNo = "ALL";
      } else if (key === "lotNo") {
        next.lotNo = value;
      }
      return next;
    });
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilters(defaultFilters);
    setCurrentPage(1);
  };

  // Hierarchical Cascading Options
  const availableProductCodes = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.productCode).filter(Boolean))).sort();
  }, [items]);

  const scopedForBatch = useMemo(() => {
    if (!filters.productCode || filters.productCode === "ALL") return items;
    return items.filter((it) => it.productCode.toUpperCase() === filters.productCode.toUpperCase());
  }, [items, filters.productCode]);

  const availableBatchNos = useMemo(() => {
    return Array.from(new Set(scopedForBatch.map((i) => i.batchNo).filter(Boolean))).sort();
  }, [scopedForBatch]);

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

  const availableApprovedBy = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.approvedBy).filter(Boolean))).sort();
  }, [items]);

  // Sorting Handler
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
      <CaretUp className="h-3.5 w-3.5 text-emerald-600 inline ml-1 font-bold" />
    ) : (
      <CaretDown className="h-3.5 w-3.5 text-emerald-600 inline ml-1 font-bold" />
    );
  };

  // Download PDF Handler calling backend streaming
  const handleDownloadPdf = async (item: ApprovedBatchItem) => {
    setDownloadingBatchNo(item.id);
    try {
      await downloadBatchPdfBlob(item.batchNo, item.lotNo, item.equipmentCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to download batch dossier PDF.";
      alert(msg);
    } finally {
      setDownloadingBatchNo(null);
    }
  };

  // Filter Pipeline (Harmonized with AND semantics)
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Text Search across identifiers
      if (filters.searchTerm.trim()) {
        const term = filters.searchTerm.trim().toLowerCase();
        const matches =
          item.batchNo.toLowerCase().includes(term) ||
          item.lotNo.toLowerCase().includes(term) ||
          item.productCode.toLowerCase().includes(term) ||
          item.productName.toLowerCase().includes(term) ||
          item.equipmentCode.toLowerCase().includes(term) ||
          item.approvedBy.toLowerCase().includes(term);
        if (!matches) return false;
      }

      // 2. Product Code Match
      if (filters.productCode && filters.productCode !== "ALL") {
        if (item.productCode.toUpperCase() !== filters.productCode.toUpperCase()) return false;
      }

      // 3. Batch Number
      if (filters.batchNo && filters.batchNo !== "ALL") {
        if (item.batchNo.toLowerCase() !== filters.batchNo.toLowerCase()) return false;
      }

      // 4. Equipment Type
      if (filters.equipmentType && filters.equipmentType !== "ALL") {
        if (item.equipmentType.toUpperCase() !== filters.equipmentType.toUpperCase()) return false;
      }

      // 5. Lot Number
      if (filters.lotNo && filters.lotNo !== "ALL") {
        if (item.lotNo.toLowerCase() !== filters.lotNo.toLowerCase()) return false;
      }

      // 6. Approved By
      if (filters.approvedBy && filters.approvedBy !== "ALL") {
        if (item.approvedBy.toLowerCase() !== filters.approvedBy.toLowerCase()) return false;
      }

      // 7. Date Range Filtering (Approved At)
      if (filters.fromDate || filters.toDate) {
        const itemDate = new Date(item.approvedAt).getTime();
        if (!isNaN(itemDate)) {
          if (filters.fromDate) {
            const [y, m, d] = filters.fromDate.split("-").map(Number);
            const from = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
            if (!isNaN(from) && itemDate < from) return false;
          }
          if (filters.toDate) {
            const [y, m, d] = filters.toDate.split("-").map(Number);
            const to = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
            if (!isNaN(to) && itemDate > to) return false;
          }
        }
      }

      return true;
    });
  }, [items, filters]);

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
        case "approvedBy":
          comparison = a.approvedBy.localeCompare(b.approvedBy);
          break;
        case "approvedAt":
        default: {
          const timeA = new Date(a.approvedAt || 0).getTime() || 0;
          const timeB = new Date(b.approvedAt || 0).getTime() || 0;
          comparison = timeA - timeB;
          break;
        }
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [filteredItems, sortField, sortDirection]);

  // Pagination Slicing with Safe Page Boundary
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
    if (filters.batchNo && filters.batchNo !== "ALL") count++;
    if (filters.equipmentType && filters.equipmentType !== "ALL") count++;
    if (filters.lotNo && filters.lotNo !== "ALL") count++;
    if (filters.approvedBy && filters.approvedBy !== "ALL") count++;
    if (filters.fromDate || filters.toDate) count++;
    if (filters.searchTerm.trim()) count++;
    return count;
  }, [filters]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-emerald-600" />
            Approved Batches
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Authoritative queue of QA-approved batches with controlled GxP PDF batch dossiers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-medium border border-slate-200 shadow-sm transition disabled:opacity-50"
          >
            <ArrowClockwise className={`h-4 w-4 text-slate-600 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-3 text-xs shadow-sm">
          <WarningCircle className="h-5 w-5 flex-shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Explicit In-Page Hierarchical Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        {/* Top Filter Row: Search + Date Range + Clear */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          {/* Keyword Search Input */}
          <div className="relative flex-1 max-w-lg">
            <MagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by batch, lot, product, or equipment..."
              value={filters.searchTerm}
              onChange={(e) => handleFilterChange("searchTerm", e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-8 py-2 text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-sm"
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
            {/* Approved By Dropdown */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-bold text-slate-600 whitespace-nowrap">
                Approved By:
              </label>
              <select
                value={filters.approvedBy}
                onChange={(e) => handleFilterChange("approvedBy", e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              >
                <option value="ALL">All QA Approvers</option>
                {availableApprovedBy.map((usr) => (
                  <option key={usr} value={usr}>
                    {usr}
                  </option>
                ))}
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

        {/* Hierarchical Explicit Filter Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
          {/* Level 1: Product Code */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Tag className="h-3.5 w-3.5 text-indigo-500" /> Product Code:
            </label>
            <select
              value={filters.productCode}
              onChange={(e) => handleFilterChange("productCode", e.target.value)}
              className="w-full bg-slate-50 hover:bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-sm"
            >
              <option value="ALL">All Products</option>
              {availableProductCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          {/* Product Name: Read-Only Textbox */}
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

          {/* Level 2: Batch Number (Cascading) */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Barcode className="h-3.5 w-3.5 text-emerald-500" /> Batch Number:
            </label>
            <select
              value={filters.batchNo}
              onChange={(e) => handleFilterChange("batchNo", e.target.value)}
              className="w-full bg-slate-50 hover:bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-sm"
            >
              <option value="ALL">All Batches</option>
              {availableBatchNos.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Level 3: Equipment Type (Cascading) */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Gear className="h-3.5 w-3.5 text-purple-500" /> Equipment Type:
            </label>
            <select
              value={filters.equipmentType}
              onChange={(e) => handleFilterChange("equipmentType", e.target.value)}
              className="w-full bg-slate-50 hover:bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-sm"
            >
              <option value="ALL">All Equipment</option>
              {availableEquipmentTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Level 4: Lot Number (Cascading) */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Hash className="h-3.5 w-3.5 text-amber-500" /> Lot Number:
            </label>
            <select
              value={filters.lotNo}
              onChange={(e) => handleFilterChange("lotNo", e.target.value)}
              className="w-full bg-slate-50 hover:bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-sm"
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

        {/* Filter Summary Counter */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-slate-800 font-bold">{totalItems}</strong> of{" "}
              <strong className="text-slate-800 font-bold">{items.length}</strong> approved batches
            </span>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-bold">
                Filtered
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400">
            Page {safeCurrentPage} of {safeTotalPages}
          </span>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200 select-none">
              <tr>
                <th
                  onClick={() => handleSortToggle("batchNo")}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center">
                    Batch & Lot No
                    {renderSortIndicator("batchNo")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("productName")}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center">
                    Product
                    {renderSortIndicator("productName")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("equipmentCode")}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center">
                    Equipment
                    {renderSortIndicator("equipmentCode")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("approvedAt")}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center">
                    Approved On
                    {renderSortIndicator("approvedAt")}
                  </div>
                </th>
                <th
                  onClick={() => handleSortToggle("approvedBy")}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition"
                >
                  <div className="flex items-center">
                    Approved By
                    {renderSortIndicator("approvedBy")}
                  </div>
                </th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ArrowClockwise className="h-6 w-6 animate-spin text-emerald-600" />
                      <span>Loading approved batches...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Funnel className="h-8 w-8 text-slate-400 opacity-60" />
                      <span className="text-slate-700 font-semibold text-sm">
                        No approved batches match your filter criteria
                      </span>
                      <span className="text-slate-500 text-xs">
                        Try adjusting product, batch, equipment, or clearing active filters.
                      </span>
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition shadow-sm"
                      >
                        <ArrowCounterClockwise className="h-3.5 w-3.5 text-emerald-600" />
                        Reset All Filters
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const detailUrl = `${ROUTES.iiotBatchDetails}/${encodeURIComponent(
                    item.batchNo
                  )}?batchNo=${encodeURIComponent(item.batchNo)}&lotNo=${encodeURIComponent(
                    item.lotNo
                  )}&equipmentCode=${encodeURIComponent(
                    item.equipmentCode
                  )}&returnTo=${encodeURIComponent(ROUTES.iiotApprovedBatches)}`;

                  const isDownloading = downloadingBatchNo === item.id;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition group"
                    >
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">
                        <div className="font-bold text-slate-900">{item.batchNo}</div>
                        <div className="text-[11px] text-slate-500 font-sans">{item.lotNo}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{item.productName}</div>
                        <div className="text-[11px] font-mono text-slate-500">{item.productCode}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[11px]">
                          {item.equipmentCode}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">{item.workflowStage}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                        {toDisplayDate(item.approvedAt)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {item.approvedBy}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">
                          <CheckCircle className="h-3 w-3" />
                          {item.displayStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Compact View Details Button with Tooltip */}
                          <button
                            onClick={() => router.push(detailUrl)}
                            title="View Batch Details"
                            aria-label="View Batch Details"
                            className="p-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm transition hover:text-indigo-600"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {/* Compact Download PDF Button with Tooltip */}
                          <button
                            onClick={() => handleDownloadPdf(item)}
                            disabled={isDownloading}
                            title="Download GxP Batch Dossier PDF"
                            aria-label="Download GxP Batch Dossier PDF"
                            className="p-2 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition disabled:opacity-50 inline-flex items-center justify-center"
                          >
                            {isDownloading ? (
                              <SpinnerGap className="h-4 w-4 animate-spin text-white" />
                            ) : (
                              <DownloadSimple className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Unified Pagination */}
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
    </div>
  );
}

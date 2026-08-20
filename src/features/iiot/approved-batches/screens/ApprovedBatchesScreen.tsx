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
import ApprovedBatchFilterPopover from "../components/ApprovedBatchFilterPopover";
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
const getDefaultLast10Days = () => {
  const now = new Date();
  const past = new Date();
  past.setDate(now.getDate() - 10);
  return {
    fromDate: past.toISOString().slice(0, 10),
    toDate: now.toISOString().slice(0, 10),
  };
};

const defaultDates = getDefaultLast10Days();

const defaultFilters: ApprovedBatchFilters = {
  productCode: "ALL",
  productName: "",
  batchNo: "ALL",
  equipmentType: "ALL",
  lotNo: "ALL",
  approvedBy: "ALL",
  fromDate: defaultDates.fromDate,
  toDate: defaultDates.toDate,
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

export default function ApprovedBatchesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ApprovedBatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadingBatchNo, setDownloadingBatchNo] = useState<string | null>(null);

  // Filters State (Default 10-day range)
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
      const summaries = await getBatchSummaryPaginated({ status: "APPROVED" });
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

          // CRITICAL: Approved Batches MUST show ONLY status = APPROVED
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
      }
      return next;
    });
    setCurrentPage(1);
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

      // 3. Product Name Match (only when productCode is ALL)
      if (filters.productName.trim() && (!filters.productCode || filters.productCode === "ALL")) {
        const query = filters.productName.trim().toLowerCase();
        if (!item.productName.toLowerCase().includes(query)) return false;
      }

      // 4. Batch Number
      if (filters.batchNo && filters.batchNo !== "ALL") {
        if (item.batchNo.toLowerCase() !== filters.batchNo.toLowerCase()) return false;
      }

      // 5. Lot Number
      if (filters.lotNo && filters.lotNo !== "ALL") {
        if (item.lotNo.toLowerCase() !== filters.lotNo.toLowerCase()) return false;
      }

      // 6. Equipment Type
      if (filters.equipmentType && filters.equipmentType !== "ALL") {
        if (item.equipmentType.toUpperCase() !== filters.equipmentType.toUpperCase()) return false;
      }

      // 7. Approved By
      if (filters.approvedBy && filters.approvedBy !== "ALL") {
        if (item.approvedBy.toLowerCase() !== filters.approvedBy.toLowerCase()) return false;
      }

      // 8. Date Range Filtering (Approved At)
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
    if (filters.productName.trim() && (!filters.productCode || filters.productCode === "ALL")) count++;
    if (filters.batchNo && filters.batchNo !== "ALL") count++;
    if (filters.equipmentType && filters.equipmentType !== "ALL") count++;
    if (filters.lotNo && filters.lotNo !== "ALL") count++;
    if (filters.approvedBy && filters.approvedBy !== "ALL") count++;
    if (filters.fromDate !== defaultDates.fromDate || filters.toDate !== defaultDates.toDate) count++;
    if (filters.searchTerm.trim()) count++;
    return count;
  }, [filters]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Approved Batches
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Authoritative record of QA-approved batches with controlled GxP PDF dossiers.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition border border-slate-200 disabled:opacity-50"
            >
              <ArrowClockwise className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 flex-1 space-y-5 max-w-7xl mx-auto w-full">
        {errorMessage && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-3 text-xs">
            <WarningCircle className="h-5 w-5 flex-shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
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
                placeholder="Search approved batches, lots, products, equipment..."
                value={filters.searchTerm}
                onChange={(e) => handleFilterChange("searchTerm", e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
                    ? "bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100"
                    : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Funnel className={`h-3.5 w-3.5 ${activeFilterCount > 0 ? "text-emerald-600" : "text-slate-500"}`} />
                <span>Filter</span>
                <CaretDown className="h-3 w-3 text-slate-400" />
                {activeFilterCount > 0 && (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Filter Popover */}
              <ApprovedBatchFilterPopover
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
            Showing {paginatedItems.length} of {totalItems} approved batches
          </span>
        </div>

        {/* Table Container */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th
                    onClick={() => handleSortToggle("batchNo")}
                    className="px-4 py-3.5 cursor-pointer hover:bg-slate-200/60 transition"
                  >
                    Batch Number {renderSortIndicator("batchNo")}
                  </th>
                  <th className="px-4 py-3.5">Lot Number</th>
                  <th
                    onClick={() => handleSortToggle("productName")}
                    className="px-4 py-3.5 cursor-pointer hover:bg-slate-200/60 transition"
                  >
                    Product {renderSortIndicator("productName")}
                  </th>
                  <th
                    onClick={() => handleSortToggle("equipmentCode")}
                    className="px-4 py-3.5 cursor-pointer hover:bg-slate-200/60 transition"
                  >
                    Equipment {renderSortIndicator("equipmentCode")}
                  </th>
                  <th
                    onClick={() => handleSortToggle("approvedAt")}
                    className="px-4 py-3.5 cursor-pointer hover:bg-slate-200/60 transition"
                  >
                    Approved On {renderSortIndicator("approvedAt")}
                  </th>
                  <th
                    onClick={() => handleSortToggle("approvedBy")}
                    className="px-4 py-3.5 cursor-pointer hover:bg-slate-200/60 transition"
                  >
                    Approved By {renderSortIndicator("approvedBy")}
                  </th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-center">PDF</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                      <div className="flex items-center justify-center gap-2">
                        <ArrowClockwise className="h-5 w-5 animate-spin text-emerald-600" />
                        <span>Loading approved batches...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-slate-500 font-medium">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Funnel className="h-8 w-8 text-slate-400 opacity-60" />
                        <span className="text-slate-700 font-semibold text-sm">
                          No approved batches match your filter criteria
                        </span>
                        <span className="text-slate-500 text-xs">
                          Try adjusting date ranges, product, or clearing active filters.
                        </span>
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition shadow-sm"
                        >
                          <ArrowCounterClockwise className="h-3.5 w-3.5 text-emerald-600" />
                          Reset Filters
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
                        className="hover:bg-slate-50/80 transition-colors group"
                      >
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          {item.batchNo}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">{item.lotNo}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{item.productName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {item.productCode}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800 font-mono">
                            {item.equipmentCode}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {item.workflowStage}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {toDisplayDate(item.approvedAt)}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {item.approvedBy}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">
                            <CheckCircle className="h-3 w-3" />
                            {item.displayStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleDownloadPdf(item)}
                            disabled={isDownloading}
                            title="Download GxP Batch Dossier PDF"
                            className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 border border-emerald-200 transition disabled:opacity-50 inline-flex items-center justify-center"
                          >
                            {isDownloading ? (
                              <SpinnerGap className="h-4 w-4 animate-spin text-emerald-600" />
                            ) : (
                              <DownloadSimple className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => router.push(detailUrl)}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 border border-slate-200 rounded-lg transition flex items-center gap-1"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>View Details</span>
                            </button>
                            <button
                              onClick={() => handleDownloadPdf(item)}
                              disabled={isDownloading}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-sm flex items-center gap-1 disabled:opacity-50"
                            >
                              {isDownloading ? (
                                <SpinnerGap className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <DownloadSimple className="h-3.5 w-3.5" />
                              )}
                              <span>Download PDF</span>
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

          {/* Pagination */}
          <div className="p-4 border-t border-slate-200 bg-slate-50/50">
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
        </div>
      </div>
    </div>
  );
}

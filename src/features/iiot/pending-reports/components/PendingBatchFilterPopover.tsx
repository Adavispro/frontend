"use client";

import React, { useEffect, useRef } from "react";
import {
  Funnel,
  X,
  ArrowCounterClockwise,
  Barcode,
  Flask,
  Hash,
  Gear,
  Tag,
  CheckCircle,
} from "@phosphor-icons/react";

export interface PendingFilterValues {
  productCode: string;
  productName: string;
  batchNo: string;
  equipmentType: string;
  lotNo: string;
  status: string;
  searchTerm: string;
}

export interface PendingBatchFilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  filters: PendingFilterValues;
  onChange: (field: keyof PendingFilterValues, value: string) => void;
  onReset: () => void;
  availableProductCodes: string[];
  availableBatchNos: string[];
  availableEquipmentTypes: string[];
  availableLotNos: string[];
  activeFilterCount: number;
}

export default function PendingBatchFilterPopover({
  isOpen,
  onClose,
  filters,
  onChange,
  onReset,
  availableProductCodes,
  availableBatchNos,
  availableEquipmentTypes,
  availableLotNos,
  activeFilterCount,
}: PendingBatchFilterPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-2 w-[340px] sm:w-[480px] z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
      role="dialog"
      aria-label="Pending batches filter menu"
    >
      {/* Popover Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-50 border border-amber-100 rounded-lg text-amber-600">
            <Funnel className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Filter Pending Batches
            </h3>
            <span className="text-[11px] text-slate-400">
              {activeFilterCount > 0
                ? `${activeFilterCount} active filter${activeFilterCount > 1 ? "s" : ""}`
                : "No active filters"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-semibold text-amber-700 hover:text-amber-800 transition px-2 py-1 bg-amber-50 hover:bg-amber-100 rounded-lg flex items-center gap-1"
            >
              <ArrowCounterClockwise className="h-3 w-3" />
              <span>Clear All</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
            aria-label="Close filter popover"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filter Form Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
        {/* 1. Product Code */}
        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-700 flex items-center gap-1">
            <Barcode className="h-3.5 w-3.5 text-slate-400" />
            <span>Product Code</span>
          </label>
          <select
            value={filters.productCode}
            onChange={(e) => onChange("productCode", e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono transition"
          >
            <option value="ALL">All Product Codes</option>
            {availableProductCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Product Name (Auto-populated from code) */}
        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-700 flex items-center gap-1">
            <Flask className="h-3.5 w-3.5 text-slate-400" />
            <span>Product Name</span>
            {filters.productCode && filters.productCode !== "ALL" && (
              <span className="text-[10px] text-amber-600 font-normal">(Auto-filled)</span>
            )}
          </label>
          <input
            type="text"
            readOnly={Boolean(filters.productCode && filters.productCode !== "ALL")}
            placeholder={
              filters.productCode && filters.productCode !== "ALL"
                ? "Auto-populated name"
                : "All Products"
            }
            value={filters.productName}
            onChange={(e) => onChange("productName", e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none transition ${
              filters.productCode && filters.productCode !== "ALL"
                ? "bg-slate-100 border-slate-300 cursor-not-allowed text-slate-600 font-medium"
                : "bg-white border-slate-300 focus:ring-2 focus:ring-amber-500"
            }`}
          />
        </div>

        {/* 3. Batch Number */}
        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-700 flex items-center gap-1">
            <Hash className="h-3.5 w-3.5 text-slate-400" />
            <span>Batch Number</span>
          </label>
          <select
            value={filters.batchNo}
            onChange={(e) => onChange("batchNo", e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono transition"
          >
            <option value="ALL">All Batch Numbers</option>
            {availableBatchNos.map((batch) => (
              <option key={batch} value={batch}>
                {batch}
              </option>
            ))}
          </select>
        </div>

        {/* 4. Equipment Type */}
        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-700 flex items-center gap-1">
            <Gear className="h-3.5 w-3.5 text-slate-400" />
            <span>Equipment Type</span>
          </label>
          <select
            value={filters.equipmentType}
            onChange={(e) => onChange("equipmentType", e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
          >
            <option value="ALL">All Equipment Types</option>
            <option value="RMG">RMG (Granulator)</option>
            <option value="FBD">FBD (Dryer)</option>
            <option value="BLE">BLE (Blender)</option>
            <option value="OGB">OGB (Blender)</option>
            <option value="COAT">COAT (Auto Coater)</option>
            <option value="CIP">CIP (Clean In Place)</option>
            {availableEquipmentTypes
              .filter((t) => !["RMG", "FBD", "BLE", "OGB", "COAT", "CIP"].includes(t))
              .map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
          </select>
        </div>

        {/* 5. Lot Number */}
        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-700 flex items-center gap-1">
            <Tag className="h-3.5 w-3.5 text-slate-400" />
            <span>Lot Number</span>
          </label>
          <select
            value={filters.lotNo}
            onChange={(e) => onChange("lotNo", e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono transition"
          >
            <option value="ALL">All Lot Numbers</option>
            {availableLotNos.map((lot) => (
              <option key={lot} value={lot}>
                {lot}
              </option>
            ))}
          </select>
        </div>

        {/* 6. Workflow Stage Status */}
        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-700 flex items-center gap-1">
            <CheckCircle className="h-3.5 w-3.5 text-slate-400" />
            <span>Workflow Status</span>
          </label>
          <select
            value={filters.status}
            onChange={(e) => onChange("status", e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
          >
            <option value="ALL">All Active Statuses</option>
            <option value="PENDING">Pending Submission</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="RETURNED">Returned / Rejected</option>
          </select>
        </div>
      </div>

      {/* Popover Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={onReset}
          className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
        >
          Reset All
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition"
        >
          Apply Filters
        </button>
      </div>
    </div>
  );
}

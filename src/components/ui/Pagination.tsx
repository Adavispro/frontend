"use client";

import React, { useMemo } from "react";
import { CaretDown, CaretLeft, CaretRight } from "@phosphor-icons/react";

export interface PaginationProps {
  page: number; // 1-indexed current page
  pageSize: number;
  totalRecords: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  disabled?: boolean;
  className?: string;
}

export default function Pagination({
  page,
  pageSize,
  totalRecords,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  disabled = false,
  className = "",
}: PaginationProps) {
  const safeTotalRecords = Math.max(0, totalRecords);
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(safeTotalRecords / safePageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  // Calculate start and end record numbers
  const startRecord = safeTotalRecords === 0 ? 0 : (currentPage - 1) * safePageSize + 1;
  const endRecord = safeTotalRecords === 0 ? 0 : Math.min(currentPage * safePageSize, safeTotalRecords);

  // Intelligent page-window algorithm
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, "...", totalPages];
    }

    if (currentPage >= totalPages - 3) {
      return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
  }, [currentPage, totalPages]);

  const handlePageClick = (p: number) => {
    if (disabled || p === currentPage || p < 1 || p > totalPages) return;
    onPageChange(p);
  };

  const handlePrevious = () => {
    if (disabled || currentPage <= 1) return;
    onPageChange(currentPage - 1);
  };

  const handleNext = () => {
    if (disabled || currentPage >= totalPages) return;
    onPageChange(currentPage + 1);
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (disabled) return;
    const newSize = Number(e.target.value);
    if (onPageSizeChange && newSize > 0) {
      onPageSizeChange(newSize);
    }
  };

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-white border-t border-slate-200 select-none ${className}`}
    >
      {/* Left: Rows Per Page Selector */}
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <span>Rows per page:</span>
        <div className="relative inline-flex items-center">
          <select
            value={safePageSize}
            onChange={handlePageSizeChange}
            disabled={disabled || safeTotalRecords === 0}
            className="appearance-none bg-white border border-slate-300 hover:border-slate-400 rounded px-2.5 py-1 pr-6 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition shadow-sm"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <CaretDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
        </div>
      </div>

      {/* Center: Record Range Information */}
      <div className="text-xs font-medium text-slate-600">
        Showing <span className="font-semibold text-slate-900">{startRecord}</span> to{" "}
        <span className="font-semibold text-slate-900">{endRecord}</span> of{" "}
        <span className="font-semibold text-slate-900">{safeTotalRecords}</span> records
      </div>

      {/* Right: Previous / Page Numbers / Next Navigation */}
      <div className="flex items-center gap-1">
        {/* Previous Button */}
        <button
          type="button"
          onClick={handlePrevious}
          disabled={disabled || currentPage <= 1}
          aria-label="Previous page"
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition shadow-sm"
        >
          <CaretLeft className="h-3 w-3" />
          <span>Previous</span>
        </button>

        {/* Page Buttons */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((p, idx) => {
            if (p === "...") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-1 text-xs text-slate-400 font-medium"
                >
                  ...
                </span>
              );
            }

            const pageNum = Number(p);
            const isActive = pageNum === currentPage;

            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => handlePageClick(pageNum)}
                disabled={disabled}
                aria-current={isActive ? "page" : undefined}
                className={`min-w-[28px] h-7 px-1.5 text-xs font-semibold rounded transition shadow-sm ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-indigo-200"
                    : "border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Next Button */}
        <button
          type="button"
          onClick={handleNext}
          disabled={disabled || currentPage >= totalPages || safeTotalRecords === 0}
          aria-label="Next page"
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition shadow-sm"
        >
          <span>Next</span>
          <CaretRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

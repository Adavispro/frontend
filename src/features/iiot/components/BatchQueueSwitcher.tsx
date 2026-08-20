"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardText, ClockCountdown } from "@phosphor-icons/react";
import { ROUTES } from "@/config/routes";

export type BatchQueueType = "PENDING" | "DEFERRED";

export interface BatchQueueSwitcherProps {
  currentQueue?: BatchQueueType;
  className?: string;
}

export function BatchQueueSwitcher({
  currentQueue,
  className = "",
}: BatchQueueSwitcherProps) {
  const pathname = usePathname();

  // Derive active queue if not explicitly provided
  const activeQueue: BatchQueueType =
    currentQueue ||
    (pathname?.includes("deferred") ? "DEFERRED" : "PENDING");

  const isPendingActive = activeQueue === "PENDING";
  const isDeferredActive = activeQueue === "DEFERRED";

  return (
    <nav
      role="tablist"
      aria-label="Batch Queue Selector"
      className={`inline-flex items-center p-1 bg-slate-200/80 border border-slate-300/80 rounded-xl gap-1 select-none shadow-inner ${className}`}
    >
      {/* Pending Batch Queue Option */}
      <Link
        href={ROUTES.iiotPendingReports}
        role="tab"
        aria-selected={isPendingActive}
        aria-label="Navigate to Pending Batch Queue"
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          isPendingActive
            ? "bg-white text-slate-900 shadow-sm border border-slate-200/90 font-bold"
            : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
        }`}
      >
        <ClipboardText
          className={`h-4 w-4 ${
            isPendingActive ? "text-amber-600" : "text-slate-500"
          }`}
          weight={isPendingActive ? "bold" : "regular"}
        />
        <span>Pending Batch Queue</span>
      </Link>

      {/* Deferred Batch Queue Option */}
      <Link
        href={ROUTES.iiotDeferredBatches}
        role="tab"
        aria-selected={isDeferredActive}
        aria-label="Navigate to Deferred Batch Queue"
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          isDeferredActive
            ? "bg-white text-slate-900 shadow-sm border border-slate-200/90 font-bold"
            : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
        }`}
      >
        <ClockCountdown
          className={`h-4 w-4 ${
            isDeferredActive ? "text-purple-600" : "text-slate-500"
          }`}
          weight={isDeferredActive ? "bold" : "regular"}
        />
        <span>Deferred Batch Queue</span>
      </Link>
    </nav>
  );
}

export default BatchQueueSwitcher;

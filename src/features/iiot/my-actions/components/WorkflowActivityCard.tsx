"use client";

import React, { useMemo } from "react";
import { ChartDonut } from "@phosphor-icons/react";

export interface WorkflowActivityCounts {
  pendingMyAction: number;
  pendingReview: number;
  pendingApproval: number;
  completedActions: number;
}

export interface WorkflowActivityCardProps {
  counts: WorkflowActivityCounts;
  isLoading?: boolean;
}

interface WorkflowSegment {
  id: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
  ringClass: string;
  dotClass: string;
}

export default function WorkflowActivityCard({
  counts,
  isLoading = false,
}: WorkflowActivityCardProps) {
  const { pendingMyAction, pendingReview, pendingApproval, completedActions } = counts;

  const total = useMemo(() => {
    return (
      (pendingMyAction || 0) +
      (pendingReview || 0) +
      (pendingApproval || 0) +
      (completedActions || 0)
    );
  }, [pendingMyAction, pendingReview, pendingApproval, completedActions]);

  // Derive individual segments and percentages safely
  const segments: WorkflowSegment[] = useMemo(() => {
    if (total === 0) {
      return [
        {
          id: "pendingMyAction",
          label: "Pending My Action",
          count: 0,
          percentage: 0,
          color: "#4F46E5", // Indigo-600
          ringClass: "text-indigo-600",
          dotClass: "bg-indigo-600",
        },
        {
          id: "pendingReview",
          label: "Pending Review",
          count: 0,
          percentage: 0,
          color: "#F59E0B", // Amber-500
          ringClass: "text-amber-500",
          dotClass: "bg-amber-500",
        },
        {
          id: "pendingApproval",
          label: "Pending Approval",
          count: 0,
          percentage: 0,
          color: "#2563EB", // Blue-600
          ringClass: "text-blue-600",
          dotClass: "bg-blue-600",
        },
        {
          id: "completedActions",
          label: "Completed Actions",
          count: 0,
          percentage: 0,
          color: "#10B981", // Emerald-500
          ringClass: "text-emerald-500",
          dotClass: "bg-emerald-500",
        },
      ];
    }

    const myActionPct = Math.round(((pendingMyAction || 0) / total) * 100);
    const reviewPct = Math.round(((pendingReview || 0) / total) * 100);
    const approvalPct = Math.round(((pendingApproval || 0) / total) * 100);
    const completedPct = Math.max(0, 100 - (myActionPct + reviewPct + approvalPct));

    return [
      {
        id: "pendingMyAction",
        label: "Pending My Action",
        count: pendingMyAction || 0,
        percentage: myActionPct,
        color: "#4F46E5",
        ringClass: "text-indigo-600",
        dotClass: "bg-indigo-600",
      },
      {
        id: "pendingReview",
        label: "Pending Review",
        count: pendingReview || 0,
        percentage: reviewPct,
        color: "#F59E0B",
        ringClass: "text-amber-500",
        dotClass: "bg-amber-500",
      },
      {
        id: "pendingApproval",
        label: "Pending Approval",
        count: pendingApproval || 0,
        percentage: approvalPct,
        color: "#2563EB",
        ringClass: "text-blue-600",
        dotClass: "bg-blue-600",
      },
      {
        id: "completedActions",
        label: "Completed Actions",
        count: completedActions || 0,
        percentage: completedPct,
        color: "#10B981",
        ringClass: "text-emerald-500",
        dotClass: "bg-emerald-500",
      },
    ];
  }, [total, pendingMyAction, pendingReview, pendingApproval, completedActions]);

  // Overall workflow activity rate (Active tasks vs total)
  const activeCount = (pendingMyAction || 0) + (pendingReview || 0) + (pendingApproval || 0);
  const activityPercentage = total > 0 ? Math.round((activeCount / total) * 100) : 0;

  // Donut geometry constants (compact to fit nicely alongside KPI cards)
  const size = 88;
  const strokeWidth = 10;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Compute SVG stroke-dasharray offsets
  let accumulatedPercent = 0;
  const renderedArcs = segments.map((seg) => {
    const strokeDasharray = `${(seg.percentage / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
    accumulatedPercent += seg.percentage;
    return {
      ...seg,
      strokeDasharray,
      strokeDashoffset,
    };
  });

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between h-full">
      {/* Card Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
            <ChartDonut className="h-3.5 w-3.5" />
          </div>
          <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Workflow Activity
          </h2>
        </div>
        {total > 0 && (
          <span className="text-[10px] font-mono font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
            {activityPercentage}%
          </span>
        )}
      </div>

      {/* Card Body: Mini Donut Chart + Compact 2-column or list Breakdown */}
      <div className="flex items-center justify-between gap-3 py-1">
        {/* Mini Donut Chart */}
        <div className="relative flex-shrink-0 flex items-center justify-center">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="transform -rotate-90"
            aria-label={`Workflow activity chart: ${activityPercentage}% active`}
          >
            {/* Background / Neutral Track */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="#F1F5F9" // slate-100
              strokeWidth={strokeWidth}
            />

            {/* Colored Segment Arcs */}
            {total > 0 &&
              renderedArcs.map((arc) => {
                if (arc.percentage <= 0) return null;
                return (
                  <circle
                    key={arc.id}
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="transparent"
                    stroke={arc.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={arc.strokeDasharray}
                    strokeDashoffset={arc.strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-500 ease-out"
                  />
                );
              })}
          </svg>

          {/* Center Text Overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-base font-bold font-mono text-slate-900 leading-none">
              {isLoading ? "-" : `${total}`}
            </span>
            <span className="text-[8px] font-medium text-slate-400 mt-0.5 uppercase tracking-wider">
              Tasks
            </span>
          </div>
        </div>

        {/* Compact Legend on Right */}
        <div className="flex-1 min-w-0 grid grid-cols-1 gap-1">
          {segments.map((seg) => (
            <div
              key={seg.id}
              className="flex items-center justify-between text-[11px] hover:bg-slate-50 p-0.5 rounded transition"
              title={`${seg.label}: ${seg.count} tasks (${seg.percentage}%)`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`h-2 w-2 rounded-full flex-shrink-0 ${seg.dotClass}`}
                  aria-hidden="true"
                />
                <span className="text-slate-600 font-medium truncate text-[10px]">
                  {seg.label === "Pending My Action"
                    ? "My Action"
                    : seg.label === "Pending Review"
                    ? "Review"
                    : seg.label === "Pending Approval"
                    ? "Approval"
                    : "Completed"}
                </span>
              </div>
              <div className="flex items-center gap-1 pl-1 flex-shrink-0">
                <span className="font-mono font-bold text-slate-800 text-[10px]">
                  {seg.count}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  ChartLine,
  WarningCircle,
  CheckCircle,
  Info,
  Sliders,
  CalendarBlank,
  CaretDown,
} from "@phosphor-icons/react";

export type TrendPointStatus = "NORMAL" | "WARNING" | "CRITICAL" | "NO_DATA";

export interface TrendLimitConfig {
  upperCriticalLimit?: number;
  upperWarningLimit?: number;
  idealTarget?: number;
  idealMin?: number;
  idealMax?: number;
  lowerWarningLimit?: number;
  lowerCriticalLimit?: number;
}

export interface CanonicalTrendPoint {
  index: number;
  timestamp: string; // ISO format or date string
  formattedTime: string; // e.g. "01:42:15 PM"
  formattedFullDate: string; // e.g. "19 Aug 2026, 01:42:15 PM"
  value: number;
  metricKey: string;
  parameterName: string;
  unit: string;
  status: TrendPointStatus;
  upperCriticalLimit?: number;
  upperWarningLimit?: number;
  idealTarget?: number;
  idealMin?: number;
  idealMax?: number;
  lowerWarningLimit?: number;
  lowerCriticalLimit?: number;
  rawRecord?: unknown;
}

export interface DynamicProcessTrendChartProps {
  points: CanonicalTrendPoint[];
  parameterName: string;
  metricKey: string;
  unit: string;
  limits?: TrendLimitConfig;
  batchNo?: string;
  lotNo?: string;
  equipmentCode?: string;
  availableMetrics?: Array<{ key: string; label: string; unit: string }>;
  selectedMetric?: string;
  onMetricChange?: (metricKey: string) => void;
  isLoading?: boolean;
}

const formatNumber = (val: number | null | undefined, decimals = 2): string => {
  if (val === null || val === undefined || isNaN(val)) return "-";
  return val.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const getStatusTheme = (status: TrendPointStatus) => {
  switch (status) {
    case "CRITICAL":
      return {
        badgeBg: "bg-rose-50 border-rose-200 text-rose-700",
        dotColor: "#ef4444",
        glowColor: "rgba(239, 68, 68, 0.25)",
        label: "CRITICAL",
      };
    case "WARNING":
      return {
        badgeBg: "bg-amber-50 border-amber-200 text-amber-700",
        dotColor: "#f59e0b",
        glowColor: "rgba(245, 158, 11, 0.25)",
        label: "WARNING",
      };
    case "NORMAL":
      return {
        badgeBg: "bg-emerald-50 border-emerald-200 text-emerald-700",
        dotColor: "#10b981",
        glowColor: "rgba(16, 185, 129, 0.25)",
        label: "NORMAL",
      };
    default:
      return {
        badgeBg: "bg-slate-100 border-slate-200 text-slate-600",
        dotColor: "#94a3b8",
        glowColor: "rgba(148, 163, 184, 0.2)",
        label: "NO DATA",
      };
  }
};

export default function DynamicProcessTrendChart({
  points,
  parameterName,
  metricKey,
  unit,
  limits,
  batchNo,
  lotNo,
  equipmentCode,
  availableMetrics = [],
  selectedMetric,
  onMetricChange,
  isLoading = false,
}: DynamicProcessTrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [hoveredPoint, setHoveredPoint] = useState<CanonicalTrendPoint | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // ResizeObserver for responsive width
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Summary statistics calculated from the EXACT canonical points dataset
  const stats = useMemo(() => {
    if (!points || points.length === 0) {
      return { min: 0, max: 0, avg: 0, current: 0, count: 0, latestStatus: "NO_DATA" as TrendPointStatus };
    }
    const values = points.map((p) => p.value).filter((v) => !isNaN(v));
    if (values.length === 0) {
      return { min: 0, max: 0, avg: 0, current: 0, count: 0, latestStatus: "NO_DATA" as TrendPointStatus };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = Number((sum / values.length).toFixed(2));
    const current = values[values.length - 1];
    const latestStatus = points[points.length - 1]?.status || "NORMAL";

    return { min, max, avg, current, count: points.length, latestStatus };
  }, [points]);

  // Chart Geometry & Margins
  const height = 340;
  const padding = useMemo(
    () => ({
      top: 28,
      right: 36,
      bottom: 44,
      left: 64,
    }),
    [],
  );

  const plotWidth = Math.max(10, containerWidth - padding.left - padding.right);
  const plotHeight = Math.max(10, height - padding.top - padding.bottom);

  // Y-Axis Scale Bounds: includes all data values AND configured limits
  const { yMin, yMax, yTicks } = useMemo(() => {
    if (!points || points.length === 0) {
      return { yMin: 0, yMax: 100, yTicks: [0, 25, 50, 75, 100] };
    }

    const candidateValues = points.map((p) => p.value).filter((v) => !isNaN(v));

    if (limits?.upperCriticalLimit !== undefined) candidateValues.push(limits.upperCriticalLimit);
    if (limits?.upperWarningLimit !== undefined) candidateValues.push(limits.upperWarningLimit);
    if (limits?.idealTarget !== undefined) candidateValues.push(limits.idealTarget);
    if (limits?.idealMax !== undefined) candidateValues.push(limits.idealMax);
    if (limits?.idealMin !== undefined) candidateValues.push(limits.idealMin);
    if (limits?.lowerWarningLimit !== undefined) candidateValues.push(limits.lowerWarningLimit);
    if (limits?.lowerCriticalLimit !== undefined) candidateValues.push(limits.lowerCriticalLimit);

    if (candidateValues.length === 0) {
      return { yMin: 0, yMax: 100, yTicks: [0, 25, 50, 75, 100] };
    }

    const rawMin = Math.min(...candidateValues);
    const rawMax = Math.max(...candidateValues);
    const spread = rawMax - rawMin;
    const headroom = spread > 0 ? spread * 0.12 : Math.max(Math.abs(rawMax) * 0.15, 1);

    const calculatedMin = rawMin >= 0 && rawMin - headroom < 0 ? 0 : rawMin - headroom;
    const calculatedMax = rawMax + headroom;

    const tickCount = 5;
    const step = (calculatedMax - calculatedMin) / (tickCount - 1);
    const ticks = Array.from({ length: tickCount }, (_, i) => calculatedMin + step * (tickCount - 1 - i));

    return {
      yMin: calculatedMin,
      yMax: calculatedMax,
      yTicks: ticks,
    };
  }, [points, limits]);

  // Coordinate mapping helpers
  const getX = useCallback(
    (index: number) => {
      if (points.length <= 1) return padding.left + plotWidth / 2;
      return padding.left + (index / (points.length - 1)) * plotWidth;
    },
    [points.length, padding.left, plotWidth],
  );

  const getY = useCallback(
    (val: number) => {
      const range = yMax - yMin || 1;
      const clamped = Math.max(yMin, Math.min(yMax, val));
      return padding.top + plotHeight - ((clamped - yMin) / range) * plotHeight;
    },
    [yMin, yMax, padding.top, plotHeight],
  );

  // SVG Polyline and Area path coordinates
  const { linePath, areaPath, pointCoords } = useMemo(() => {
    if (!points || points.length === 0) {
      return { linePath: "", areaPath: "", pointCoords: [] };
    }

    const coords = points.map((p, idx) => ({
      x: getX(idx),
      y: getY(p.value),
      point: p,
    }));

    const pathPoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

    const firstX = coords[0].x;
    const lastX = coords[coords.length - 1].x;
    const bottomY = padding.top + plotHeight;

    const area = `${firstX},${bottomY} ${pathPoints} ${lastX},${bottomY}`;

    return {
      linePath: pathPoints,
      areaPath: area,
      pointCoords: coords,
    };
  }, [points, getX, getY, padding.top, plotHeight]);

  // X-Axis Time Ticks (5-7 nicely spaced timestamps)
  const xTicks = useMemo(() => {
    if (!points || points.length === 0) return [];
    if (points.length <= 5) {
      return points.map((p, idx) => ({
        x: getX(idx),
        label: p.formattedTime,
        fullTimestamp: p.formattedFullDate,
      }));
    }

    const count = Math.min(6, points.length);
    const step = (points.length - 1) / (count - 1);
    const selectedIndices = Array.from({ length: count }, (_, i) => Math.round(i * step));

    return selectedIndices.map((idx) => ({
      x: getX(idx),
      label: points[idx].formattedTime,
      fullTimestamp: points[idx].formattedFullDate,
    }));
  }, [points, getX]);

  // Mouse Interaction on shared SVG layer
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!points || points.length === 0 || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Restrict hover calculations to plot boundaries
      if (mouseX < padding.left || mouseX > padding.left + plotWidth) {
        setHoveredPoint(null);
        setMousePos(null);
        return;
      }

      const relativeX = mouseX - padding.left;
      const normalizedRatio = Math.max(0, Math.min(1, relativeX / plotWidth));
      const targetIndex = Math.round(normalizedRatio * (points.length - 1));
      const closestPoint = points[targetIndex];

      if (closestPoint) {
        setHoveredPoint(closestPoint);
        setMousePos({ x: getX(targetIndex), y: getY(closestPoint.value) });
      }
    },
    [points, padding.left, plotWidth, getX, getY],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredPoint(null);
    setMousePos(null);
  }, []);

  const activeStatusTheme = getStatusTheme(stats.latestStatus);

  return (
    <div className="space-y-6">
      {/* 1. Header Filter Bar & Metric Selector */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label htmlFor="metric-select" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Sliders className="h-4 w-4 text-indigo-600" />
            Process Parameter:
          </label>
          <div className="relative">
            <select
              id="metric-select"
              value={selectedMetric || metricKey}
              onChange={(e) => onMetricChange?.(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg pl-3 pr-8 py-2 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm appearance-none cursor-pointer"
            >
              {availableMetrics.length > 0 ? (
                availableMetrics.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label} ({m.unit})
                  </option>
                ))
              ) : (
                <option value={metricKey}>
                  {parameterName} ({unit})
                </option>
              )}
            </select>
            <CaretDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md font-mono text-[11px] text-slate-700">
            <CalendarBlank className="h-3.5 w-3.5 text-slate-400" />
            {points.length} Samples Filtered
          </span>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${activeStatusTheme.badgeBg}`}
          >
            {activeStatusTheme.label}
          </span>
        </div>
      </div>

      {/* 2. Summary Metric Cards (Reconciled from same canonical dataset) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Latest Value</span>
            <span className={`h-2 w-2 rounded-full`} style={{ backgroundColor: activeStatusTheme.dotColor }} />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {formatNumber(stats.current)}
            </span>
            <span className="text-xs font-semibold text-slate-500">{unit}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Most recent telemetry reading</span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm transition hover:shadow-md">
          <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Minimum Value</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-sky-600 font-mono">
              {formatNumber(stats.min)}
            </span>
            <span className="text-xs font-semibold text-slate-500">{unit}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Lowest observed sample</span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm transition hover:shadow-md">
          <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Maximum Value</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-amber-600 font-mono">
              {formatNumber(stats.max)}
            </span>
            <span className="text-xs font-semibold text-slate-500">{unit}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Peak process spike</span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm transition hover:shadow-md">
          <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Average (Mean)</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-emerald-600 font-mono">
              {formatNumber(stats.avg)}
            </span>
            <span className="text-xs font-semibold text-slate-500">{unit}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Batch arithmetic mean</span>
        </div>
      </div>

      {/* 3. Main Graphical Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        {/* Panel Header & Limit Indicators Legend */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ChartLine className="h-5 w-5 text-indigo-600" />
              Dynamic Time-Series Process Trend:{" "}
              <span className="text-indigo-600 font-mono">
                {parameterName} ({unit})
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Batch: <strong className="text-slate-600 font-mono">{batchNo || "-"}</strong> &bull; Lot:{" "}
              <strong className="text-slate-600 font-mono">{lotNo || "-"}</strong> &bull; Stage Equipment:{" "}
              <strong className="text-slate-600 font-mono">{equipmentCode || "-"}</strong>
            </p>
          </div>

          {/* Reference Limits Tags */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            {limits?.upperCriticalLimit !== undefined && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded text-[11px] font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Crit High: {formatNumber(limits.upperCriticalLimit)} {unit}
              </span>
            )}
            {limits?.idealTarget !== undefined && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded text-[11px] font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Ideal: {formatNumber(limits.idealTarget)} {unit}
              </span>
            )}
            {limits?.lowerCriticalLimit !== undefined && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded text-[11px] font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Crit Low: {formatNumber(limits.lowerCriticalLimit)} {unit}
              </span>
            )}
          </div>
        </div>

        {/* Chart Canvas Container */}
        <div
          ref={containerRef}
          className="relative w-full bg-slate-50/70 border border-slate-200 rounded-xl overflow-hidden p-2 select-none"
          style={{ minHeight: `${height}px` }}
        >
          {isLoading ? (
            <div className="h-72 w-full flex flex-col items-center justify-center gap-2 text-slate-400">
              <div className="h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-semibold font-mono">Loading telemetry stream...</span>
            </div>
          ) : points.length === 0 ? (
            <div className="h-72 w-full flex flex-col items-center justify-center gap-2 text-slate-400">
              <Info className="h-8 w-8 text-slate-300" />
              <span className="text-sm font-semibold text-slate-700">
                No telemetry data available for the selected period.
              </span>
              <p className="text-xs text-slate-400 max-w-sm text-center">
                Verify that equipment telemetry ingestion is running for equipment {equipmentCode} or expand the date range filter.
              </p>
            </div>
          ) : (
            <div className="relative w-full h-full">
              <svg
                className="w-full h-full overflow-visible"
                viewBox={`0 0 ${containerWidth} ${height}`}
                preserveAspectRatio="none"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <defs>
                  {/* Clip path ensuring all plotted lines strictly remain inside the plot bounding box */}
                  <clipPath id="plot-area-clip">
                    <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} />
                  </clipPath>

                  {/* Area fill gradient */}
                  <linearGradient id="trend-area-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.01" />
                  </linearGradient>

                  {/* Ideal band gradient */}
                  <linearGradient id="ideal-band-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.08" />
                  </linearGradient>
                </defs>

                {/* 1. Horizontal Y-Axis Grid Lines & Tick Labels */}
                {yTicks.map((tickVal, idx) => {
                  const y = getY(tickVal);
                  return (
                    <g key={`ytick-${idx}`}>
                      <line
                        x1={padding.left}
                        y1={y}
                        x2={padding.left + plotWidth}
                        y2={y}
                        stroke="#e2e8f0"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padding.left - 10}
                        y={y + 3.5}
                        textAnchor="end"
                        fontSize="10.5"
                        fontWeight="600"
                        fill="#64748b"
                        className="font-mono select-none"
                      >
                        {formatNumber(tickVal, 1)}
                      </text>
                    </g>
                  );
                })}

                {/* Y-Axis Unit Tag (Top-left) */}
                <text
                  x={padding.left - 10}
                  y={padding.top - 12}
                  textAnchor="end"
                  fontSize="10"
                  fontWeight="700"
                  fill="#475569"
                  className="font-mono select-none"
                >
                  [{unit}]
                </text>

                {/* 2. Limit Reference Lines (Drawn across plot area) */}
                {/* Ideal Band / Line */}
                {limits?.idealMin !== undefined && limits?.idealMax !== undefined && (
                  <rect
                    clipPath="url(#plot-area-clip)"
                    x={padding.left}
                    y={getY(limits.idealMax)}
                    width={plotWidth}
                    height={Math.max(2, getY(limits.idealMin) - getY(limits.idealMax))}
                    fill="url(#ideal-band-grad)"
                  />
                )}

                {limits?.idealTarget !== undefined && (
                  <g clipPath="url(#plot-area-clip)">
                    <line
                      x1={padding.left}
                      y1={getY(limits.idealTarget)}
                      x2={padding.left + plotWidth}
                      y2={getY(limits.idealTarget)}
                      stroke="#10b981"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                  </g>
                )}

                {/* Upper Warning Limit */}
                {limits?.upperWarningLimit !== undefined && (
                  <g clipPath="url(#plot-area-clip)">
                    <line
                      x1={padding.left}
                      y1={getY(limits.upperWarningLimit)}
                      x2={padding.left + plotWidth}
                      y2={getY(limits.upperWarningLimit)}
                      stroke="#f59e0b"
                      strokeWidth="1.2"
                      strokeDasharray="3 3"
                    />
                  </g>
                )}

                {/* Lower Warning Limit */}
                {limits?.lowerWarningLimit !== undefined && (
                  <g clipPath="url(#plot-area-clip)">
                    <line
                      x1={padding.left}
                      y1={getY(limits.lowerWarningLimit)}
                      x2={padding.left + plotWidth}
                      y2={getY(limits.lowerWarningLimit)}
                      stroke="#f59e0b"
                      strokeWidth="1.2"
                      strokeDasharray="3 3"
                    />
                  </g>
                )}

                {/* Upper Critical Limit */}
                {limits?.upperCriticalLimit !== undefined && (
                  <g clipPath="url(#plot-area-clip)">
                    <line
                      x1={padding.left}
                      y1={getY(limits.upperCriticalLimit)}
                      x2={padding.left + plotWidth}
                      y2={getY(limits.upperCriticalLimit)}
                      stroke="#ef4444"
                      strokeWidth="1.75"
                      strokeDasharray="5 4"
                    />
                  </g>
                )}

                {/* Lower Critical Limit */}
                {limits?.lowerCriticalLimit !== undefined && (
                  <g clipPath="url(#plot-area-clip)">
                    <line
                      x1={padding.left}
                      y1={getY(limits.lowerCriticalLimit)}
                      x2={padding.left + plotWidth}
                      y2={getY(limits.lowerCriticalLimit)}
                      stroke="#ef4444"
                      strokeWidth="1.75"
                      strokeDasharray="5 4"
                    />
                  </g>
                )}

                {/* 3. Plotted Area & Line with Clip-Path Boundary Protection */}
                {points.length > 1 && (
                  <g clipPath="url(#plot-area-clip)">
                    <polygon points={areaPath} fill="url(#trend-area-grad)" />
                    <polyline
                      points={linePath}
                      fill="none"
                      stroke="#4f46e5"
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )}

                {/* Single Point rendering */}
                {points.length === 1 && (
                  <g clipPath="url(#plot-area-clip)">
                    <circle
                      cx={pointCoords[0]?.x}
                      cy={pointCoords[0]?.y}
                      r="5"
                      fill="#4f46e5"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  </g>
                )}

                {/* 4. X-Axis Line & Time Ticks */}
                <line
                  x1={padding.left}
                  y1={padding.top + plotHeight}
                  x2={padding.left + plotWidth}
                  y2={padding.top + plotHeight}
                  stroke="#cbd5e1"
                  strokeWidth="1.25"
                />

                {xTicks.map((tick, idx) => (
                  <g key={`xtick-${idx}`}>
                    <line
                      x1={tick.x}
                      y1={padding.top + plotHeight}
                      x2={tick.x}
                      y2={padding.top + plotHeight + 5}
                      stroke="#94a3b8"
                      strokeWidth="1"
                    />
                    <text
                      x={tick.x}
                      y={padding.top + plotHeight + 18}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="500"
                      fill="#64748b"
                      className="font-mono select-none"
                    >
                      {tick.label}
                    </text>
                  </g>
                ))}

                {/* 5. Interactive Hover Guide & Halo Point Marker */}
                {hoveredPoint && mousePos && (
                  <g>
                    {/* Vertical Crosshair Line */}
                    <line
                      x1={mousePos.x}
                      y1={padding.top}
                      x2={mousePos.x}
                      y2={padding.top + plotHeight}
                      stroke="#4f46e5"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />

                    {/* Outer Glowing Pulsing Halo */}
                    <circle
                      cx={mousePos.x}
                      cy={mousePos.y}
                      r="8"
                      fill={getStatusTheme(hoveredPoint.status).glowColor}
                    />

                    {/* Inner Point Marker */}
                    <circle
                      cx={mousePos.x}
                      cy={mousePos.y}
                      r="4.5"
                      fill={getStatusTheme(hoveredPoint.status).dotColor}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  </g>
                )}

                {/* Transparent Mouse Event Overlay Rect */}
                <rect
                  x={padding.left}
                  y={padding.top}
                  width={plotWidth}
                  height={plotHeight}
                  fill="transparent"
                  className="cursor-crosshair"
                />
              </svg>

              {/* 6. Production-Grade Floating HTML Tooltip */}
              {hoveredPoint && mousePos && (
                <div
                  className="pointer-events-none absolute z-50 transition-transform duration-75 ease-out shadow-xl rounded-xl border border-slate-200 bg-white/95 backdrop-blur-md p-3.5 text-xs text-slate-800"
                  style={{
                    left: `${mousePos.x}px`,
                    top: `${mousePos.y}px`,
                    transform:
                      mousePos.x > containerWidth * 0.65
                        ? "translate(-105%, -50%)"
                        : "translate(15%, -50%)",
                    minWidth: "240px",
                  }}
                >
                  {/* Tooltip Header: Timestamp */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                    <span className="text-[10.5px] font-mono text-slate-500 flex items-center gap-1">
                      <CalendarBlank className="h-3 w-3 text-slate-400" />
                      {hoveredPoint.formattedFullDate}
                    </span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold border ${
                        getStatusTheme(hoveredPoint.status).badgeBg
                      }`}
                    >
                      {getStatusTheme(hoveredPoint.status).label}
                    </span>
                  </div>

                  {/* Primary Metric Value */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                      {hoveredPoint.parameterName || parameterName}
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xl font-extrabold text-slate-900 font-mono">
                        {formatNumber(hoveredPoint.value)}
                      </span>
                      <span className="text-xs font-bold text-indigo-600">{unit}</span>
                    </div>
                  </div>

                  {/* Limit Thresholds Checklist */}
                  {(limits?.upperCriticalLimit !== undefined ||
                    limits?.idealTarget !== undefined ||
                    limits?.lowerCriticalLimit !== undefined) && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1 text-[10.5px] font-mono">
                      {limits.upperCriticalLimit !== undefined && (
                        <div className="flex items-center justify-between text-rose-600">
                          <span>Critical High:</span>
                          <span className="font-bold">
                            {formatNumber(limits.upperCriticalLimit)} {unit}
                          </span>
                        </div>
                      )}
                      {limits.upperWarningLimit !== undefined && (
                        <div className="flex items-center justify-between text-amber-600">
                          <span>Warning High:</span>
                          <span className="font-bold">
                            {formatNumber(limits.upperWarningLimit)} {unit}
                          </span>
                        </div>
                      )}
                      {limits.idealTarget !== undefined && (
                        <div className="flex items-center justify-between text-emerald-600">
                          <span>Ideal Target:</span>
                          <span className="font-bold">
                            {formatNumber(limits.idealTarget)} {unit}
                          </span>
                        </div>
                      )}
                      {limits.lowerWarningLimit !== undefined && (
                        <div className="flex items-center justify-between text-amber-600">
                          <span>Warning Low:</span>
                          <span className="font-bold">
                            {formatNumber(limits.lowerWarningLimit)} {unit}
                          </span>
                        </div>
                      )}
                      {limits.lowerCriticalLimit !== undefined && (
                        <div className="flex items-center justify-between text-rose-600">
                          <span>Critical Low:</span>
                          <span className="font-bold">
                            {formatNumber(limits.lowerCriticalLimit)} {unit}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsClockwise,
  CaretDown,
  MagnifyingGlass,
  X,
  ChartLineUp,
  CheckCircle,
  DownloadSimple,
  Funnel,
  Info,
  Minus,
  Plus,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  getCppTrends,
  type CppLimits,
  type CppPoint,
  type CppSeries,
  type CppTrendsQuery,
  type CppTrendsResponse,
} from "../api/cppTrends.api";

const BATCH_COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#ea580c", "#4f46e5"];
const PLANT_ZONE = "Asia/Kolkata";
const PRESETS = [
  { value: "ALL", label: "All ingested data" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 3 months" },
  { value: "CUSTOM", label: "Specific date range" },
] as const;
type Preset = (typeof PRESETS)[number]["value"];
type XAxisMode = "elapsed" | "timeline" | "index";

const selectClass =
  "w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition cursor-pointer disabled:opacity-60";

function fmt(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined ? "—" : Number(value.toFixed(digits)).toLocaleString();
}

function fmtTime(value: string | number) {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: PLANT_ZONE, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function fmtElapsed(minutes: number) {
  if (minutes < 120) return `+${Math.round(minutes)}m`;
  if (minutes < 2880) return `+${(minutes / 60).toFixed(1)}h`;
  return `+${(minutes / 1440).toFixed(1)}d`;
}

function seriesLabel(series: CppSeries) {
  return series.lotNo ? `${series.batchNo} · Lot ${series.lotNo}` : series.batchNo;
}

function limitValues(limits: CppLimits | null | undefined) {
  if (!limits) return [];
  return [limits.setpoint, limits.lowerWarning, limits.upperWarning, limits.lowerCritical, limits.upperCritical]
    .filter((v): v is number => typeof v === "number");
}

const STATUS_STYLE: Record<CppPoint["status"], string> = {
  OK: "text-emerald-700 bg-emerald-50 border-emerald-200",
  WARNING: "text-amber-700 bg-amber-50 border-amber-200",
  CRITICAL: "text-rose-700 bg-rose-50 border-rose-200",
  NO_LIMITS: "text-slate-600 bg-slate-50 border-slate-200",
};

export default function CppTrendsScreen() {
  const [preset, setPreset] = useState<Preset>("ALL");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [productCode, setProductCode] = useState("");
  const [parameter, setParameter] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const [data, setData] = useState<CppTrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [xAxis, setXAxis] = useState<XAxisMode>("elapsed");
  const [zoom, setZoom] = useState(1);
  const [batchMenuOpen, setBatchMenuOpen] = useState(false);
  const [batchSearch, setBatchSearch] = useState("");
  const [excursionsOnly, setExcursionsOnly] = useState(false);
  const batchMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!batchMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (batchMenuRef.current && !batchMenuRef.current.contains(event.target as Node)) setBatchMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setBatchMenuOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [batchMenuOpen]);
  const [hover, setHover] = useState<{ series: CppSeries; point: CppPoint; x: number; y: number; color: string } | null>(null);

  const query = useMemo<CppTrendsQuery | null>(() => {
    const base: CppTrendsQuery = { equipmentId: equipmentId || undefined, productCode: productCode || undefined, parameter: parameter || undefined };
    if (preset === "CUSTOM") {
      if (!customFrom || !customTo) return null;
      return { ...base, fromDate: customFrom, toDate: customTo };
    }
    return preset === "ALL" ? base : { ...base, days: Number(preset) };
  }, [equipmentId, productCode, parameter, preset, customFrom, customTo]);

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      getCppTrends(query, controller.signal)
        .then((response) => {
          setData(response);
          const keys = new Set(response.series.map((s) => s.key));
          setSelectedKeys((prev) => {
            const kept = prev.filter((k) => keys.has(k));
            return kept.length ? kept : response.defaultSelection;
          });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : "Unable to load CPP trends.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, reloadToken]);

  const series = useMemo(() => data?.series ?? [], [data]);
  const colorByKey = useMemo(
    () => new Map(series.map((s, i) => [s.key, BATCH_COLORS[i % BATCH_COLORS.length]])),
    [series],
  );
  const visible = useMemo(() => series.filter((s) => selectedKeys.includes(s.key)), [series, selectedKeys]);
  const filteredSeries = useMemo(() => {
    const term = batchSearch.trim().toLowerCase();
    return series
      .filter((s) => !excursionsOnly || s.stats.warningCount > 0 || s.stats.criticalCount > 0)
      .filter((s) => !term || [s.batchNo, s.lotNo, s.productCode, s.productName].some((v) => v?.toLowerCase().includes(term)))
      .slice()
      .reverse();
  }, [series, batchSearch, excursionsOnly]);
  const currentParam = data?.parameters.find((p) => p.code === data.selectedParameter);
  const unit = currentParam?.unit ?? "";
  const currentEquipment = data?.equipment.find((e) => e.id === data.selectedEquipmentId);
  const isReportSnapshots = currentEquipment?.type?.toUpperCase().includes("COMPRESS") || series.some((s) => s.points.some((p) => p.label?.includes("Lot")));

  const xOf = (point: CppPoint, index: number) =>
    xAxis === "timeline" ? point.t : xAxis === "index" ? index + 1 : point.elapsedMin;

  // Chart geometry
  const svgWidth = 900 * zoom;
  const svgHeight = 380;
  const pad = { left: 65, right: 30, top: 25, bottom: 50 };
  const plotW = svgWidth - pad.left - pad.right;
  const plotH = svgHeight - pad.top - pad.bottom;

  const domain = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    visible.forEach((s) => {
      s.points.forEach((p, i) => {
        xs.push(xAxis === "timeline" ? p.t : xAxis === "index" ? i + 1 : p.elapsedMin);
        ys.push(p.value);
        if (typeof p.min === "number") ys.push(p.min);
        if (typeof p.max === "number") ys.push(p.max);
      });
      ys.push(...limitValues(data?.limitsVary ? s.limits : null));
    });
    ys.push(...limitValues(data?.limits));
    if (!xs.length) return null;
    let [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    if (x0 === x1) { x0 -= 1; x1 += 1; }
    let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    const span = y1 - y0 || Math.abs(y1) * 0.1 || 1;
    y0 -= span * 0.12;
    y1 += span * 0.12;
    return { x0, x1, y0, y1 };
  }, [visible, xAxis, data?.limits, data?.limitsVary]);

  const sx = (x: number) => (domain ? pad.left + ((x - domain.x0) / (domain.x1 - domain.x0)) * plotW : 0);
  const sy = (y: number) => (domain ? pad.top + plotH - ((y - domain.y0) / (domain.y1 - domain.y0)) * plotH : 0);

  const yTicks = domain ? Array.from({ length: 6 }, (_, i) => domain.y0 + ((domain.y1 - domain.y0) * i) / 5) : [];
  const xTicks = domain ? Array.from({ length: 6 }, (_, i) => domain.x0 + ((domain.x1 - domain.x0) * i) / 5) : [];
  const xTickLabel = (x: number) =>
    xAxis === "timeline"
      ? new Date(x).toLocaleDateString("en-IN", { timeZone: PLANT_ZONE, day: "2-digit", month: "short" })
      : xAxis === "index" ? `#${Math.round(x)}` : fmtElapsed(x);

  const toggleKey = (key: string) =>
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const exportCsv = () => {
    const rows = [["Batch", "Lot", "Product", "Time", "Sample", "Value", "Min", "Max", "Status"]];
    visible.forEach((s) =>
      s.points.forEach((p) =>
        rows.push([s.batchNo, s.lotNo ?? p.label ?? "", s.productName ?? "", new Date(p.t).toISOString(),
          String(p.elapsedMin), String(p.value), String(p.min ?? ""), String(p.max ?? ""), p.status]),
      ),
    );
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `cpp-trends-${data?.selectedEquipmentId ?? "equipment"}-${data?.selectedParameter ?? "param"}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const commonLimits = data?.limits ?? null;
  const limitLines: { value: number | null | undefined; label: string; color: string; dash?: string }[] = commonLimits
    ? [
        { value: commonLimits.upperCritical, label: "UCL", color: "#e11d48", dash: "6 4" },
        { value: commonLimits.upperWarning, label: "UWL", color: "#d97706", dash: "4 4" },
        { value: commonLimits.setpoint, label: "SP", color: "#16a34a" },
        { value: commonLimits.lowerWarning, label: "LWL", color: "#d97706", dash: "4 4" },
        { value: commonLimits.lowerCritical, label: "LCL", color: "#e11d48", dash: "6 4" },
      ]
    : [];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <ChartLineUp className="h-6 w-6" weight="duotone" />
            </span>
            Critical Process Parameter (CPP) Trends
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Compare ingested process parameters across batches against recipe and equipment control limits
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.dataRange && (
            <span className="text-[11px] text-slate-500 font-medium">Ingested data: {data.dataRange.label}</span>
          )}
          <button
            type="button"
            onClick={() => setReloadToken((t) => t + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowsClockwise className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <Funnel className="h-4 w-4 text-indigo-600" />
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Filters</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Date Range</label>
            <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className={selectClass}>
              {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            {preset === "CUSTOM" && (
              <div className="flex items-center gap-1.5 mt-2">
                <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-1/2 text-[11px] border border-slate-300 rounded-lg p-1.5 font-mono" />
                <span className="text-xs text-slate-400">to</span>
                <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)}
                  className="w-1/2 text-[11px] border border-slate-300 rounded-lg p-1.5 font-mono" />
              </div>
            )}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Equipment</label>
            <select
              value={data?.selectedEquipmentId ?? equipmentId}
              onChange={(e) => { setEquipmentId(e.target.value); setProductCode(""); setParameter(""); setSelectedKeys([]); }}
              className={selectClass}
              disabled={!data?.equipment.length}
            >
              {(data?.equipment ?? []).map((eq) => (
                <option key={eq.id} value={eq.id}>{eq.name}{eq.stageName ? ` · ${eq.stageName}` : ""} ({eq.id})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Product</label>
            <select value={productCode} onChange={(e) => { setProductCode(e.target.value); setSelectedKeys([]); }} className={selectClass}>
              <option value="">All products</option>
              {productCode && !data?.productOptions.some((p) => p.code === productCode) && <option value={productCode}>{productCode}</option>}
              {(data?.productOptions ?? []).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">CPP Parameter</label>
            <select
              value={data?.selectedParameter ?? parameter}
              onChange={(e) => setParameter(e.target.value)}
              className={selectClass}
              disabled={!data?.parameters.length}
            >
              {(data?.parameters ?? []).map((p) => (
                <option key={p.code} value={p.code}>{p.name}{p.unit ? ` (${p.unit})` : ""}</option>
              ))}
            </select>
            {!!data?.unavailableParameters.length && (
              <p className="mt-1.5 text-[10px] text-slate-400" title={data.unavailableParameters.map((p) => p.name).join(", ")}>
                {data.unavailableParameters.length} configured parameter(s) have no ingested values
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          <WarningCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {data?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Batches in range", value: data.summary.batchCount, tone: "text-slate-900" },
            { label: isReportSnapshots ? "Lot reports" : "Data points", value: data.summary.pointCount, tone: "text-slate-900" },
            { label: "Warning excursions", value: data.summary.warningCount, tone: "text-amber-600" },
            { label: "Critical excursions", value: data.summary.criticalCount, tone: "text-rose-600" },
          ].map((card) => (
            <div key={card.label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{card.label}</p>
              <p className={`mt-1 text-2xl font-bold ${card.tone}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {currentParam ? `${currentParam.name}${unit ? ` (${unit})` : ""}` : "Parameter trend"}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {commonLimits?.source ? `Limits: ${commonLimits.source}` : data?.limitsVary ? "Limits differ per batch/lot — shown per series" : "No configured limits for this parameter"}
              {data?.fromDate && data?.toDate ? ` · ${data.fromDate} to ${data.toDate}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 p-0.5 text-[11px] font-semibold">
              {([["elapsed", "Elapsed"], ["timeline", "Timeline"], ["index", "Sample #"]] as const).map(([mode, label]) => (
                <button key={mode} type="button" onClick={() => setXAxis(mode)}
                  className={`px-2.5 py-1 rounded-lg ${xAxis === mode ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.75, z - 0.25))} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"><Minus className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={exportCsv} disabled={!visible.length}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <DownloadSimple className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
        </div>

        {series.length > 0 && (
          <div className="flex flex-wrap items-start gap-3">
            <div ref={batchMenuRef} className="relative w-full sm:w-96">
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Batches ({selectedKeys.length} of {series.length} selected)
              </label>
              <button type="button" onClick={() => setBatchMenuOpen((o) => !o)} aria-expanded={batchMenuOpen}
                className={`${selectClass} flex items-center justify-between text-left`}>
                <span className="truncate">
                  {selectedKeys.length === 0
                    ? "Select batches…"
                    : selectedKeys.length === series.length
                      ? `All batches (${series.length})`
                      : visible.slice(0, 3).map(seriesLabel).join(", ") + (visible.length > 3 ? ` +${visible.length - 3} more` : "")}
                </span>
                <CaretDown className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition ${batchMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {batchMenuOpen && (
                <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="p-2 border-b border-slate-100 space-y-2">
                    <div className="relative">
                      <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input autoFocus value={batchSearch} onChange={(e) => setBatchSearch(e.target.value)}
                        placeholder="Search batch, lot or product…"
                        className="w-full rounded-lg border border-slate-300 bg-slate-50 py-1.5 pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
                      <button type="button" onClick={() => setSelectedKeys((prev) => Array.from(new Set([...prev, ...filteredSeries.map((s) => s.key)])))}
                        className="text-indigo-600 hover:underline">
                        Select {batchSearch || excursionsOnly ? `matching (${filteredSeries.length})` : "all"}
                      </button>
                      <button type="button" onClick={() => setSelectedKeys(data?.defaultSelection ?? [])} className="text-slate-600 hover:underline">Latest 6</button>
                      <button type="button" onClick={() => setSelectedKeys([])} className="text-rose-600 hover:underline">Clear</button>
                      <label className="ml-auto inline-flex items-center gap-1 text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={excursionsOnly} onChange={(e) => setExcursionsOnly(e.target.checked)} className="accent-indigo-600" />
                        With excursions only
                      </label>
                    </div>
                  </div>
                  <ul className="max-h-72 overflow-y-auto py-1">
                    {filteredSeries.length === 0 && <li className="px-3 py-3 text-xs text-slate-500">No batches match.</li>}
                    {filteredSeries.map((s) => {
                      const active = selectedKeys.includes(s.key);
                      return (
                        <li key={s.key}>
                          <label className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 ${active ? "bg-indigo-50/50" : ""}`}>
                            <input type="checkbox" checked={active} onChange={() => toggleKey(s.key)} className="accent-indigo-600" />
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorByKey.get(s.key) }} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-mono font-semibold text-slate-800">{seriesLabel(s)}</span>
                              <span className="block truncate text-[10px] text-slate-500">
                                {s.productName || s.productCode || "—"} · {fmtTime(s.startAt)} · {s.stats.count} pts
                              </span>
                            </span>
                            {(s.stats.criticalCount > 0 || s.stats.warningCount > 0) && (
                              <Warning className={`h-3.5 w-3.5 shrink-0 ${s.stats.criticalCount ? "text-rose-500" : "text-amber-500"}`} weight="fill" />
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
            {visible.length > 0 && (
              <div className="flex flex-1 flex-wrap items-center gap-1.5 pt-6">
                {visible.slice(0, 12).map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[10px] font-mono font-semibold"
                    style={{ borderColor: colorByKey.get(s.key), color: colorByKey.get(s.key) }}>
                    {seriesLabel(s)}
                    <button type="button" aria-label={`Remove ${seriesLabel(s)}`} onClick={() => toggleKey(s.key)} className="hover:opacity-60">
                      <X className="h-2.5 w-2.5" weight="bold" />
                    </button>
                  </span>
                ))}
                {visible.length > 12 && <span className="text-[10px] font-semibold text-slate-500">+{visible.length - 12} more</span>}
                {visible.length > 20 && (
                  <span className="text-[10px] text-amber-600">Many batches selected — the chart may be crowded.</span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="relative overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/40">
          {loading && !data && <div className="h-[380px] flex items-center justify-center text-xs text-slate-500">Loading CPP trends…</div>}
          {!loading && !visible.length && (
            <div className="h-[380px] flex flex-col items-center justify-center gap-2 text-center px-6">
              <Info className="h-6 w-6 text-slate-400" />
              <p className="text-xs font-semibold text-slate-600">
                {preset === "CUSTOM" && !query ? "Select both start and end dates." : data?.message || (series.length ? "Select at least one batch to plot." : "No data for the selected filters.")}
              </p>
            </div>
          )}
          {domain && visible.length > 0 && (
            <svg width={svgWidth} height={svgHeight} className={loading ? "opacity-60" : ""} onMouseLeave={() => setHover(null)}>
              {yTicks.map((tick) => (
                <g key={`y${tick}`}>
                  <line x1={pad.left} x2={svgWidth - pad.right} y1={sy(tick)} y2={sy(tick)} stroke="#e2e8f0" />
                  <text x={pad.left - 8} y={sy(tick) + 3} textAnchor="end" className="fill-slate-500 text-[10px]">{fmt(tick, 2)}</text>
                </g>
              ))}
              {xTicks.map((tick) => (
                <text key={`x${tick}`} x={sx(tick)} y={svgHeight - pad.bottom + 18} textAnchor="middle" className="fill-slate-500 text-[10px]">{xTickLabel(tick)}</text>
              ))}
              <text x={pad.left + plotW / 2} y={svgHeight - 8} textAnchor="middle" className="fill-slate-400 text-[10px] font-semibold">
                {xAxis === "timeline" ? "Date (plant time)" : xAxis === "index" ? (isReportSnapshots ? "Lot report #" : "Sample #") : "Elapsed from batch start"}
              </text>
              <text transform={`translate(14 ${pad.top + plotH / 2}) rotate(-90)`} textAnchor="middle" className="fill-slate-400 text-[10px] font-semibold">
                {currentParam?.name}{unit ? ` (${unit})` : ""}
              </text>

              {limitLines.filter((l) => typeof l.value === "number").map((l) => (
                <g key={l.label}>
                  <line x1={pad.left} x2={svgWidth - pad.right} y1={sy(l.value as number)} y2={sy(l.value as number)} stroke={l.color} strokeDasharray={l.dash} strokeWidth={1.25} />
                  <text x={svgWidth - pad.right - 4} y={sy(l.value as number) - 4} textAnchor="end" className="text-[10px] font-bold" fill={l.color}>{l.label} {fmt(l.value)}</text>
                </g>
              ))}

              {data?.limitsVary && visible.map((s) => {
                const color = colorByKey.get(s.key);
                return s.points.map((p, i) => {
                  const lim = p.limits ?? s.limits;
                  const x = sx(xOf(p, i));
                  return [lim?.lowerCritical, lim?.upperCritical].filter((v): v is number => typeof v === "number").map((v, j) => (
                    <line key={`${s.key}-${i}-${j}`} x1={x - 8} x2={x + 8} y1={sy(v)} y2={sy(v)} stroke={color} strokeWidth={2} opacity={0.55} />
                  ));
                });
              })}

              {visible.map((s) => {
                const color = colorByKey.get(s.key) ?? BATCH_COLORS[0];
                const path = s.points.map((p, i) => `${i ? "L" : "M"}${sx(xOf(p, i))},${sy(p.value)}`).join(" ");
                return (
                  <g key={s.key}>
                    {currentParam?.hasRange && s.points.map((p, i) =>
                      typeof p.min === "number" && typeof p.max === "number" ? (
                        <line key={`r${i}`} x1={sx(xOf(p, i))} x2={sx(xOf(p, i))} y1={sy(p.min)} y2={sy(p.max)} stroke={color} strokeWidth={1} opacity={0.4} />
                      ) : null,
                    )}
                    <path d={path} fill="none" stroke={color} strokeWidth={2} />
                    {s.points.map((p, i) => {
                      const x = sx(xOf(p, i));
                      const y = sy(p.value);
                      const ring = p.status === "CRITICAL" ? "#e11d48" : p.status === "WARNING" ? "#d97706" : color;
                      return (
                        <circle key={i} cx={x} cy={y} r={p.status === "OK" || p.status === "NO_LIMITS" ? 3.5 : 5}
                          fill={p.status === "OK" || p.status === "NO_LIMITS" ? color : "#fff"} stroke={ring} strokeWidth={2}
                          className="cursor-pointer" onMouseEnter={() => setHover({ series: s, point: p, x, y, color })} />
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          )}
          {hover && (
            <div className="pointer-events-none absolute z-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg"
              style={{ left: Math.min(hover.x + 12, svgWidth - 220), top: Math.max(hover.y - 70, 4) }}>
              <p className="font-mono font-bold" style={{ color: hover.color }}>{seriesLabel(hover.series)}</p>
              {hover.point.label && <p className="text-slate-500">{hover.point.label}</p>}
              <p className="text-slate-500">{fmtTime(hover.point.t)} · {fmtElapsed(hover.point.elapsedMin)}</p>
              <p className="mt-1 font-semibold text-slate-900">
                {fmt(hover.point.value)} {unit}
                {typeof hover.point.min === "number" && typeof hover.point.max === "number" && (
                  <span className="font-normal text-slate-500"> (min {fmt(hover.point.min)} · max {fmt(hover.point.max)})</span>
                )}
              </p>
              <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[hover.point.status]}`}>
                {hover.point.status.replace("_", " ")}
              </span>
            </div>
          )}
        </div>
      </div>

      {visible.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-indigo-600" />
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Batch statistics</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  {["Batch", "Product", "Started", isReportSnapshots ? "Lots" : "Points", "Mean", "Min", "Max", "SD", "Limits (LCL–UCL)", "In limits", "Warn", "Crit", "Cpk"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((s) => (
                  <tr key={s.key} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap" style={{ color: colorByKey.get(s.key) }}>{seriesLabel(s)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{s.productName || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtTime(s.startAt)}</td>
                    <td className="px-3 py-2">{s.stats.count}</td>
                    <td className="px-3 py-2">{fmt(s.stats.mean)}</td>
                    <td className="px-3 py-2">{fmt(s.stats.min)}</td>
                    <td className="px-3 py-2">{fmt(s.stats.max)}</td>
                    <td className="px-3 py-2">{fmt(s.stats.sd, 3)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                      {s.limits ? `${fmt(s.limits.lowerCritical)} – ${fmt(s.limits.upperCritical)}` : "—"}
                    </td>
                    <td className="px-3 py-2">{s.stats.inLimitPct === null || s.stats.inLimitPct === undefined ? "—" : `${fmt(s.stats.inLimitPct, 1)}%`}</td>
                    <td className={`px-3 py-2 font-semibold ${s.stats.warningCount ? "text-amber-600" : "text-slate-400"}`}>{s.stats.warningCount}</td>
                    <td className={`px-3 py-2 font-semibold ${s.stats.criticalCount ? "text-rose-600" : "text-slate-400"}`}>{s.stats.criticalCount}</td>
                    <td className={`px-3 py-2 font-semibold ${typeof s.stats.cpk === "number" ? (s.stats.cpk >= 1.33 ? "text-emerald-600" : s.stats.cpk >= 1 ? "text-amber-600" : "text-rose-600") : "text-slate-400"}`}>
                      {fmt(s.stats.cpk)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useMemo, useState } from "react";
import {
  Cpu,
  MagnifyingGlass,
  CaretDown,
  CaretRight,
  Info,
  Printer,
  Clock,
} from "@phosphor-icons/react";
import Pagination from "@/components/ui/Pagination";
import type { AllowedWorkflowAction } from "@/features/iiot/equipment/api/reports.api";

export interface CompressionReportViewProps {
  batchNo: string;
  lotNo?: string;
  equipmentCode?: string;
  equipmentName?: string;
  productName?: string;
  recipeName?: string;
  batchSize?: string;
  stageStatus?: string;
  stageStartTime?: string;
  stageEndTime?: string;
  stageDuration?: string;
  rawCompressionData?: Record<string, unknown> | null;
  alarms?: unknown[];
  auditLogs?: unknown[];
  loginSessions?: Array<{ u?: string; dt?: string; act?: string; isLog?: boolean; no?: string; prod?: string; bNo?: string; rem?: string }>;
  actionHistory?: unknown[];
  controlledPrintHistory?: unknown[];
  allowedActions?: AllowedWorkflowAction[];
  onActionClick?: (action: AllowedWorkflowAction) => void;
  onPrintClick?: () => void;
  isPrintEnabled?: boolean;
  printDisabledReason?: string;
  isActionLoading?: boolean;
}

const pickText = (row: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const v = row[key];
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v);
  }
  return "";
};

const ALARM_TIME_KEYS = ["time", "timestamp", "eventAt", "event_time", "occurredTime", "occurred_time", "start_time"];
const ALARM_USER_KEYS = ["userId", "user_id", "operatorName", "performedBy"];
const ALARM_MSG_KEYS = ["message", "alarmName", "alarm_name", "alarmDescription", "description", "msg_text"];

const formatDateTime = (val: unknown): string => {
  if (val === null || val === undefined || val === "") return "-";
  const d = new Date(String(val));
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
};

const formatInt = (n: unknown): string => {
  if (n === null || n === undefined || n === "") return "-";
  const num = typeof n === "number" ? n : Number(n);
  if (isNaN(num)) return String(n);
  return num.toLocaleString("en-US");
};

const safeStr = (val: unknown, fallback: string = "-"): string => {
  if (val === null || val === undefined || val === "") return fallback;
  return String(val);
};

const CompressionDataTable = ({ headers, rows }: { headers: string[]; rows: string[][] }) => (
  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 border-b border-slate-200">
          <tr>{headers.map((header) => <th key={header} scope="col" className="px-4 py-3">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row[0]} className="hover:bg-slate-50/70">
              <th scope="row" className="px-4 py-3 font-semibold text-slate-800">{row[0]}</th>
              {row.slice(1).map((value, index) => <td key={index} className="px-4 py-3 font-mono text-slate-900">{value}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const CompressionFieldGrid = ({ fields }: {
  fields: Array<{ name: string; value: string; details?: string }>;
}) => (
  <dl className="grid grid-cols-1 md:grid-cols-2 border-t border-l border-slate-200 text-xs">
    {fields.map((field) => (
      <div key={field.name} className="grid min-w-0 grid-cols-[46%_54%] border-b border-r border-slate-200">
        <dt className="bg-slate-50 border-r border-slate-200 px-4 py-3 font-semibold text-slate-700 break-words">
          {field.name}
        </dt>
        <dd className="min-w-0 px-4 py-3 font-mono font-semibold text-slate-900 break-words">
          {field.value}
          {field.details && <span className="block mt-1 font-sans font-normal text-slate-500">{field.details}</span>}
        </dd>
      </div>
    ))}
  </dl>
);

export const CompressionReportView: React.FC<CompressionReportViewProps> = ({
  batchNo,
  lotNo,
  equipmentCode = "MC081",
  equipmentName = "ROTARY TABLET PRESS (COMPRESSION)",
  productName,
  recipeName,
  batchSize,
  stageStartTime = "-",
  stageEndTime = "-",
  stageDuration = "-",
  rawCompressionData = {},
  alarms = [],
  auditLogs = [],
  loginSessions = [],
  stageStatus,
  actionHistory = [],
  controlledPrintHistory = [],
  onPrintClick,
  isPrintEnabled = false,
  printDisabledReason = "Print is enabled once all compression lots are QA Approved",
  isActionLoading = false,
}) => {
  const [alarmSearch, setAlarmSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [loginSearch, setLoginSearch] = useState("");
  const [paramSearch, setParamSearch] = useState("");

  // Group collapses for machine settings
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  // Pagination states
  const [alarmPage, setAlarmPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [loginPage, setLoginPage] = useState(1);
  const pageSize = 10;

  // Extract nested authentic compression details from API payload
  const compDetails = useMemo(() => {
    const root = rawCompressionData || {};
    if (root.compression_details && typeof root.compression_details === "object") {
      return root.compression_details as Record<string, unknown>;
    }
    if (root.productionReport && typeof root.productionReport === "object") {
      return root.productionReport as Record<string, unknown>;
    }
    return root as Record<string, unknown>;
  }, [rawCompressionData]);

  const bInfo = useMemo(() => (compDetails.batchInfo || {}) as Record<string, unknown>, [compDetails]);
  const recipe = useMemo(() => (compDetails.recipeSettings || {}) as Record<string, unknown>, [compDetails]);
  const feeder = useMemo(() => (recipe.feeder || {}) as Record<string, unknown>, [recipe]);
  const hydra = useMemo(() => (recipe.hydraulicPressureLimits || {}) as Record<string, unknown>, [recipe]);
  const oil = useMemo(() => (recipe.oilLubrication || {}) as Record<string, unknown>, [recipe]);
  const s1 = useMemo(() => (oil.upperPunchS1 || {}) as Record<string, unknown>, [oil]);
  const s2 = useMemo(() => (oil.lowerPunchS2 || {}) as Record<string, unknown>, [oil]);
  const s3 = useMemo(() => (oil.lowerHeadS3 || {}) as Record<string, unknown>, [oil]);
  const limits = useMemo(() => (recipe.controlLimits || {}) as Record<string, unknown>, [recipe]);
  const hsp = useMemo(() => (limits.hsp || {}) as Record<string, unknown>, [limits]);
  const hep = useMemo(() => (limits.hep || {}) as Record<string, unknown>, [limits]);
  const hcp = useMemo(() => (limits.hcp || {}) as Record<string, unknown>, [limits]);
  const refLim = useMemo(() => (limits.ref || {}) as Record<string, unknown>, [limits]);
  const lcp = useMemo(() => (limits.lcp || {}) as Record<string, unknown>, [limits]);
  const lep = useMemo(() => (limits.lep || {}) as Record<string, unknown>, [limits]);
  const lsp = useMemo(() => (limits.lsp || {}) as Record<string, unknown>, [limits]);
  const sd = useMemo(() => (limits.sdLimit || {}) as Record<string, unknown>, [limits]);
  const preHsp = useMemo(() => (limits.preHsp || {}) as Record<string, unknown>, [limits]);

  const pressure = useMemo(() => (compDetails.pressureData || {}) as Record<string, unknown>, [compDetails]);
  const pp = useMemo(() => (pressure.prePressure || {}) as Record<string, unknown>, [pressure]);
  const mp = useMemo(() => (pressure.mainPressure || {}) as Record<string, unknown>, [pressure]);
  const adj = useMemo(() => (pressure.fillingDepthAdjustments || {}) as Record<string, unknown>, [pressure]);

  const opVals = useMemo(() => (compDetails.operationValues || {}) as Record<string, unknown>, [compDetails]);
  const opFeeder = useMemo(() => (opVals.feeder || {}) as Record<string, unknown>, [opVals]);
  const opPre = useMemo(() => (opVals.prePressure || {}) as Record<string, unknown>, [opVals]);
  const opMain = useMemo(() => (opVals.mainPressure || {}) as Record<string, unknown>, [opVals]);
  const opOil = useMemo(() => (opVals.lubricationRemainingMin || {}) as Record<string, unknown>, [opVals]);
  const aux = useMemo(() => (opVals.auxiliaryStatus || {}) as Record<string, unknown>, [opVals]);

  const counters = useMemo(() => (compDetails.tabletCounters || {}) as Record<string, unknown>, [compDetails]);
  const hepCounter = useMemo(() => (counters.hep || {}) as Record<string, unknown>, [counters]);
  const lepCounter = useMemo(() => (counters.lep || {}) as Record<string, unknown>, [counters]);
  const goodCounter = useMemo(() => (counters.good || {}) as Record<string, unknown>, [counters]);

  const tightness = useMemo(() => (compDetails.tightness || {}) as Record<string, unknown>, [compDetails]);
  const checker = useMemo(() => (compDetails.tabletChecker || {}) as Record<string, unknown>, [compDetails]);
  const meta = useMemo(() => (compDetails.metadata || {}) as Record<string, unknown>, [compDetails]);

  // Dynamic values resolved from authentic report metadata
  const effectiveStation = safeStr(bInfo.stationNo, "Station 1");
  const effectiveBatchNo = safeStr(bInfo.batchNo, batchNo);
  const effectiveDerivedLot = safeStr(bInfo.derivedLotNo, lotNo || "-");
  const effectiveProduct = safeStr(bInfo.productName, productName || "-");
  const effectiveRecipe = safeStr(recipeName || bInfo.recipeName, "-");
  const effectiveBatchSize = safeStr(batchSize || recipe.targetQuantity, "-");
  const effectiveUserId = safeStr(bInfo.userId, "-");
  const effectiveOperator = safeStr(bInfo.operatorName, "-");
  const effectiveRunningTime = safeStr(bInfo.runningTime, stageDuration);
  const effectiveTotalRunningTime = safeStr(bInfo.totalRunningTime, stageDuration);

  // Derived KPI production data from authentic counters
  const prod = useMemo(() => {
    const good = Number(goodCounter.count || counters.goodTablets || counters.good_tablets || 0);
    const hepRej = Number(hepCounter.count || 0);
    const lepRej = Number(lepCounter.count || 0);
    const rejected = hepRej + lepRej || Number(counters.rejectedTablets || counters.rejected_tablets || 0);
    const total = Number(counters.totalCounter || good + rejected || 0);
    const awc = Number(counters.awcCounter || 0);

    const yieldPct = total > 0 ? ((good / total) * 100).toFixed(2) : "-";
    const rejectPct = total > 0 ? ((rejected / total) * 100).toFixed(2) : "-";

    return {
      goodTablets: total > 0 ? formatInt(good) : "-",
      goodCount: good,
      rejectedTablets: total > 0 ? formatInt(rejected) : "-",
      rejectedCount: rejected,
      totalTablets: total > 0 ? formatInt(total) : "-",
      totalCount: total,
      awcCount: awc > 0 ? formatInt(awc) : "-",
      hepCount: formatInt(hepRej),
      lepCount: formatInt(lepRej),
      yieldPercent: yieldPct !== "-" ? `${yieldPct}%` : "-",
      rejectPercent: rejectPct !== "-" ? `${rejectPct}%` : "-",
      turretSpeed: opVals.diskSpeedRpm ? `${opVals.diskSpeedRpm} RPM` : "-",
      feederSpeed: opFeeder.speedRpm ? `${opFeeder.speedRpm} RPM` : "-",
      mainForceMean: mp.meanKn ? `${mp.meanKn} kN` : "-",
      preForceMean: pp.meanKn ? `${pp.meanKn} kN` : "-",
      productionRate: opVals.capacityTabsPerHour ? `${formatInt(opVals.capacityTabsPerHour)} Tabs/hr` : "-",
    };
  }, [counters, goodCounter, hepCounter, lepCounter, opVals, opFeeder, mp, pp]);

  // SETTING VALUE (Grouped exactly as in authentic Sejong Report)
  const settingValueGroups = useMemo<Array<{
    id: string;
    title: string;
    parameters: Array<{ name: string; setVal: string; unit: string; kn?: string }>;
  }>>(() => {
    return [
      {
        id: "GENERAL_SETTINGS",
        title: "GENERAL MACHINE SETTINGS",
        parameters: [
          { name: "Feeder Auto Speed", setVal: safeStr(feeder.autoPercent), unit: "%" },
          { name: "Feeder Manual Speed", setVal: safeStr(feeder.manualRpm), unit: "RPM" },
          { name: "Filling Cam", setVal: safeStr(recipe.fillingCam), unit: "" },
          { name: "Target Quantity", setVal: formatInt(recipe.targetQuantity || effectiveBatchSize), unit: "Tabs" },
          { name: "Air Pressure Low Limit", setVal: safeStr(recipe.airPressureLowLimitKpa), unit: "Kpa" },
          { name: "Hydraulic High Limit", setVal: safeStr(hydra.highLimitMpa), unit: "Mpa" },
          { name: "Hydraulic Low Limit", setVal: safeStr(hydra.lowLimitMpa), unit: "Mpa" },
          { name: "Powder Supply Time", setVal: safeStr(recipe.powderSupplyTimeSec), unit: "Sec" },
          { name: "Initial Reject Time", setVal: safeStr(recipe.initialRejectTimeSec), unit: "Sec" },
        ],
      },
      {
        id: "OIL_LUBRICATION",
        title: "OIL LUBRICATION SETTINGS",
        parameters: [
          { name: "Upper Punch Interval Time (S1)", setVal: safeStr(s1.intervalMin), unit: "Min" },
          { name: "Upper Punch Supply Time (S1)", setVal: safeStr(s1.supplySec), unit: "Sec" },
          { name: "Lower Punch Interval Time (S2)", setVal: safeStr(s2.intervalMin), unit: "Min" },
          { name: "Lower Punch Supply Time (S2)", setVal: safeStr(s2.supplySec), unit: "Sec" },
          { name: "Lower Head Interval Time (S3)", setVal: safeStr(s3.intervalMin), unit: "Min" },
          { name: "Lower Head Supply Time (S3)", setVal: safeStr(s3.supplySec), unit: "Sec" },
        ],
      },
      {
        id: "STOP_CONDITION",
        title: "CONTROL LIMITS & STOP CONDITIONS",
        parameters: [
          { name: "HSP (High Stop Pressure)", setVal: safeStr(hsp.percent), kn: safeStr(hsp.kn), unit: `Stop: ${safeStr(hsp.stop)}` },
          { name: "HEP (High Error Pressure)", setVal: safeStr(hep.percent), kn: safeStr(hep.kn), unit: `${safeStr(hep.rot)} Rot / ${safeStr(hep.tabs)} Tabs` },
          { name: "HCP (High Control Pressure)", setVal: safeStr(hcp.percent), kn: safeStr(hcp.kn), unit: `${safeStr(hcp.times)} Times` },
          { name: "Ref (Reference Pressure)", setVal: "-", kn: safeStr(refLim.kn), unit: "-" },
          { name: "LCP (Low Control Pressure)", setVal: safeStr(lcp.percent), kn: safeStr(lcp.kn), unit: `${safeStr(lcp.times)} Times` },
          { name: "LEP (Low Error Pressure)", setVal: safeStr(lep.percent), kn: safeStr(lep.kn), unit: `${safeStr(lep.rot)} Rot / ${safeStr(lep.tabs)} Tabs` },
          { name: "LSP (Low Stop Pressure)", setVal: safeStr(lsp.percent), kn: safeStr(lsp.kn), unit: `Stop: ${safeStr(lsp.stop)}` },
          { name: "SD Limit", setVal: safeStr(sd.percent), kn: "-", unit: `Stop: ${safeStr(sd.stop)}` },
          { name: "Pre HSP", setVal: "-", kn: safeStr(preHsp.kn), unit: `Stop: ${safeStr(preHsp.stop)}` },
        ],
      },
    ];
  }, [feeder, recipe, effectiveBatchSize, hydra, s1, s2, s3, hsp, hep, hcp, refLim, lcp, lep, lsp, sd, preHsp]);

  // OPERATION VALUE (Exact Sejong Report operational fields)
  const operationValues = useMemo(() => {
    return [
      { name: "Disk Speed (Turret)", value: opVals.diskSpeedRpm ? `${opVals.diskSpeedRpm} RPM` : "-" },
      { name: "Capacity (Production Rate)", value: opVals.capacityTabsPerHour ? `${formatInt(opVals.capacityTabsPerHour)} Tabs/hour` : "-" },
      { name: "Feeder Status", value: safeStr(opFeeder.status) },
      { name: "Feeder Speed", value: opFeeder.speedRpm ? `${opFeeder.speedRpm} RPM` : "-" },
      { name: "Pre Pressure Thickness", value: opPre.thicknessMm ? `${opPre.thicknessMm} mm` : "-" },
      { name: "Pre Lower Punch Position", value: opPre.lowerPunchPositionMm ? `${opPre.lowerPunchPositionMm} mm (Penetration: ${safeStr(opPre.penetrationDepthMm)} mm)` : "-" },
      { name: "Main Pressure Thickness", value: opMain.thicknessMm ? `${opMain.thicknessMm} mm` : "-" },
      { name: "Main Lower Punch Position", value: opMain.lowerPunchPositionMm ? `${opMain.lowerPunchPositionMm} mm (Penetration: ${safeStr(opMain.penetrationDepthMm)} mm)` : "-" },
      { name: "Filling Depth", value: opVals.fillingDepthMm ? `${opVals.fillingDepthMm} mm` : "-" },
      { name: "Current Cam", value: safeStr(opVals.currentCam) },
      { name: "Main Air Pressure", value: opVals.mainAirPressureKpa ? `${opVals.mainAirPressureKpa} Kpa` : "-" },
      { name: "Hydraulic Pressure", value: opVals.hydraulicPressureMpa ? `${opVals.hydraulicPressureMpa} Mpa` : "-" },
      { name: "Oil S1 Remain Time (Upper)", value: opOil.upperPunchS1 ? `${opOil.upperPunchS1} Min` : "-" },
      { name: "Oil S2 Remain Time (Lower)", value: opOil.lowerPunchS2 ? `${opOil.lowerPunchS2} Min` : "-" },
      { name: "Oil S3 Remain Time (Head)", value: opOil.lowerHeadS3 ? `${opOil.lowerHeadS3} Min` : "-" },
      { name: "Powder Status", value: safeStr(aux.powderStatus) },
      { name: "Dust Collector", value: safeStr(aux.dustCollector) },
      { name: "Initial Reject", value: safeStr(aux.initialReject) },
      { name: "Buzzer", value: safeStr(aux.buzzer) },
    ];
  }, [opVals, opFeeder, opPre, opMain, opOil, aux]);

  // Embedded report alarm history is lot-specific; the live API feed is equipment-wide, so it is only a fallback
  const effectiveAlarms = useMemo(() => {
    if (compDetails.alarm_history && Array.isArray(compDetails.alarm_history) && compDetails.alarm_history.length > 0) {
      return compDetails.alarm_history as Array<Record<string, unknown>>;
    }
    if (compDetails.alarms && Array.isArray(compDetails.alarms) && compDetails.alarms.length > 0) {
      return compDetails.alarms as Array<Record<string, unknown>>;
    }
    if (alarms && alarms.length > 0) return alarms as Array<Record<string, unknown>>;
    return [];
  }, [alarms, compDetails]);

  // Filter Alarms from live API or embedded report
  const filteredAlarms = useMemo(() => {
    if (!alarmSearch) return effectiveAlarms;
    const q = alarmSearch.toLowerCase();
    return effectiveAlarms.filter((a) =>
      pickText(a, ALARM_MSG_KEYS).toLowerCase().includes(q) ||
      pickText(a, ALARM_USER_KEYS).toLowerCase().includes(q) ||
      String(a.batchNo || a.batchNumber || "").toLowerCase().includes(q) ||
      String(a.productName || a.product || "").toLowerCase().includes(q)
    );
  }, [effectiveAlarms, alarmSearch]);

  const paginatedAlarms = useMemo(() => {
    const start = (alarmPage - 1) * pageSize;
    return filteredAlarms.slice(start, start + pageSize);
  }, [filteredAlarms, alarmPage]);

  // Extract effective audits with fallback to embedded compDetails
  const effectiveAudits = useMemo(() => {
    if (compDetails.operation_history && Array.isArray(compDetails.operation_history) && compDetails.operation_history.length > 0) {
      return compDetails.operation_history as Array<Record<string, unknown>>;
    }
    if (compDetails.operations && Array.isArray(compDetails.operations) && compDetails.operations.length > 0) {
      return compDetails.operations as Array<Record<string, unknown>>;
    }
    if (compDetails.auditLogs && Array.isArray(compDetails.auditLogs) && compDetails.auditLogs.length > 0) {
      return compDetails.auditLogs as Array<Record<string, unknown>>;
    }
    if (auditLogs && auditLogs.length > 0) return auditLogs as Array<Record<string, unknown>>;
    return [];
  }, [auditLogs, compDetails]);

  // Filter Audits from live API or embedded report
  const filteredAudits = useMemo(() => {
    if (!auditSearch) return effectiveAudits;
    const q = auditSearch.toLowerCase();
    return effectiveAudits.filter((a) =>
      String(a.message || a.action || a.eventName || a.description || a.actionCode || "").toLowerCase().includes(q) ||
      String(a.userId || a.performedBy || a.user_id || "").toLowerCase().includes(q) ||
      String(a.batchNo || a.batchNumber || "").toLowerCase().includes(q) ||
      String(a.productName || a.product || "").toLowerCase().includes(q)
    );
  }, [effectiveAudits, auditSearch]);

  const paginatedAudits = useMemo(() => {
    const start = (auditPage - 1) * pageSize;
    return filteredAudits.slice(start, start + pageSize);
  }, [filteredAudits, auditPage]);

  // Extract effective logins with fallback to embedded compDetails
  const effectiveLogins = useMemo(() => {
    if (loginSessions && loginSessions.length > 0) return loginSessions as Array<Record<string, unknown>>;
    if (compDetails.login_history && Array.isArray(compDetails.login_history) && compDetails.login_history.length > 0) {
      return compDetails.login_history as Array<Record<string, unknown>>;
    }
    if (compDetails.logins && Array.isArray(compDetails.logins) && compDetails.logins.length > 0) {
      return compDetails.logins as Array<Record<string, unknown>>;
    }
    if (compDetails.loginSessions && Array.isArray(compDetails.loginSessions) && compDetails.loginSessions.length > 0) {
      return compDetails.loginSessions as Array<Record<string, unknown>>;
    }
    return [];
  }, [loginSessions, compDetails]);

  // Filter Logins from live API or embedded report
  const filteredLogins = useMemo(() => {
    if (!loginSearch) return effectiveLogins;
    const q = loginSearch.toLowerCase();
    return effectiveLogins.filter((l) =>
      String(l.u || l.userId || l.user_id || l.userName || l.operatorName || "").toLowerCase().includes(q) ||
      String(l.act || l.action || l.eventType || "").toLowerCase().includes(q) ||
      String(l.bNo || l.batchNo || l.batchNumber || "").toLowerCase().includes(q) ||
      String(l.prod || l.productName || l.product || "").toLowerCase().includes(q)
    );
  }, [effectiveLogins, loginSearch]);

  const paginatedLogins = useMemo(() => {
    const start = (loginPage - 1) * pageSize;
    return filteredLogins.slice(start, start + pageSize);
  }, [filteredLogins, loginPage]);

  const workflowRows = useMemo(
    () => ((actionHistory || []) as Array<Record<string, unknown>>).filter((w) => w && typeof w === "object"),
    [actionHistory]
  );
  const printRows = useMemo(
    () => ((controlledPrintHistory || []) as Array<Record<string, unknown>>).filter((p) => p && typeof p === "object"),
    [controlledPrintHistory]
  );

  return (
    <div className="space-y-6 text-slate-800 text-xs font-sans [&_*]:text-xs [&_*]:font-sans">
      {/* =========================================================================
          TOP EXECUTIVE HEADER & SUMMARY STRIP
         ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-sm shrink-0">
              <Cpu className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Compression Machine</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {effectiveStation}
                </span>
                {Boolean(meta.softwareVersion) && (
                  <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    SW v{String(meta.softwareVersion)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Machine: <strong className="text-slate-800 font-mono">{equipmentCode}</strong> ({equipmentName}) &bull; Station: {effectiveStation} &bull; Derived Lot: <strong className="text-indigo-600 font-mono">{effectiveDerivedLot}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {stageStatus && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {stageStatus.replace(/_/g, " ")}
              </span>
            )}
            {onPrintClick && (
              <button
                type="button"
                onClick={onPrintClick}
                disabled={!isPrintEnabled || isActionLoading}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition ${isPrintEnabled && !isActionLoading
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                  }`}
                title={isPrintEnabled ? "Print Final Consolidated Compression PDF" : printDisabledReason}
              >
                <Printer className="h-3.5 w-3.5" />
                Print PDF
              </button>
            )}
          </div>
        </div>

        {onPrintClick && !isPrintEnabled && (
          <p className="mt-3 text-xs text-amber-700">{printDisabledReason}</p>
        )}

        {/* Quick Summary Pill Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 pt-4 text-xs font-mono">
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 block font-sans font-semibold">STATION NO</span>
            <strong className="text-slate-900 font-bold block">{effectiveStation}</strong>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 block font-sans font-semibold">DERIVED LOT</span>
            <strong className="text-indigo-600 font-bold block truncate">{effectiveDerivedLot}</strong>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 block font-sans font-semibold">RECIPE NAME</span>
            <strong className="text-slate-900 font-bold block truncate">{effectiveRecipe}</strong>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 block font-sans font-semibold">BATCH NO.</span>
            <strong className="text-slate-900 font-bold block truncate">{effectiveBatchNo}</strong>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 block font-sans font-semibold">TARGET QUANTITY</span>
            <strong className="text-slate-900 font-bold block truncate">{effectiveBatchSize}</strong>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 block font-sans font-semibold">GOOD TABS</span>
            <strong className="text-emerald-700 font-bold block truncate">{prod.goodTablets}</strong>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 block font-sans font-semibold">YIELD %</span>
            <strong className="text-emerald-700 font-bold block truncate">{prod.yieldPercent}</strong>
          </div>
        </div>
      </div>

      {/* =========================================================================
          CONTINUOUS VERTICAL SECTIONS
         ========================================================================= */}

      {/* 1. PRODUCT INFORMATION */}
      <section aria-label="Product Information" className="space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-600" />
            PRODUCT INFORMATION
          </h2>
          <span className="text-[11px] text-slate-400 font-mono">Periodic Production Report</span>
        </div>

        <div className="bg-white rounded-xl overflow-hidden shadow-sm">
          <CompressionFieldGrid fields={[
            { name: "Station No", value: effectiveStation },
            { name: "Derived Lot No.", value: effectiveDerivedLot },
            { name: "Machine Name", value: safeStr(bInfo.machineName, equipmentName) },
            { name: "Product Name", value: effectiveProduct },
            { name: "User ID / Operator", value: `${effectiveUserId} (${effectiveOperator})` },
            { name: "Batch No.", value: effectiveBatchNo },
            { name: "Recipe Name", value: effectiveRecipe },
            { name: "Target Quantity", value: effectiveBatchSize },
            { name: "Print Interval", value: `${safeStr(bInfo.printInterval)} Tabs` },
            { name: "Running Time", value: effectiveRunningTime },
            { name: "Total Counter", value: `${prod.totalTablets} Tabs` },
            { name: "Total Running Time", value: effectiveTotalRunningTime },
          ]} />
        </div>
      </section>

      {/* 2. SETTING VALUE */}
      <section aria-label="Setting Value" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-600" />
              SETTING VALUE
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Machine setpoint configurations and critical safety thresholds</p>
          </div>
          <div className="relative max-w-xs w-full">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter setting values..."
              value={paramSearch}
              onChange={(e) => setParamSearch(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            />
          </div>
        </div>

        <div className="space-y-3">
          {settingValueGroups.map((grp) => {
            const isCollapsed = collapsedGroups[grp.id] || false;
            const filteredParams = grp.parameters.filter((p) =>
              !paramSearch || p.name.toLowerCase().includes(paramSearch.toLowerCase())
            );

            if (filteredParams.length === 0) return null;

            return (
              <div key={grp.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleGroup(grp.id)}
                  aria-expanded={!isCollapsed}
                  className="w-full bg-slate-50 hover:bg-slate-100/80 px-5 py-3 flex items-center justify-between border-b border-slate-200 text-left transition cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">{grp.title}</span>
                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      {filteredParams.length} Parameters
                    </span>
                  </div>
                  <div className="text-slate-400">
                    {isCollapsed ? <CaretRight className="h-4 w-4" /> : <CaretDown className="h-4 w-4" />}
                  </div>
                </button>

                {!isCollapsed && (grp.id !== "STOP_CONDITION" ? (
                  <CompressionFieldGrid fields={filteredParams.map((p) => ({
                    name: p.name,
                    value: `${p.setVal}${p.unit ? ` ${p.unit}` : ""}`,
                  }))} />
                ) : (
                  <CompressionDataTable
                    headers={["Parameter", "% Setting", "kN Limit", "Stop Condition"]}
                    rows={filteredParams.map((p) => [
                      p.name,
                      p.setVal === "-" ? "-" : `${p.setVal} %`,
                      !p.kn || p.kn === "-" ? "-" : `${p.kn} kN`,
                      p.unit,
                    ])}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. OPERATION VALUE */}
      <section aria-label="Operation Value" className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-600" />
              OPERATION VALUE
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Real-time operational execution values during batch run</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <CompressionFieldGrid fields={operationValues} />
        </div>
      </section>

      {/* 4. PRESSURE DATA */}
      <section aria-label="Pressure Data" className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-600" />
              PRESSURE DATA
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Pre & Main compression pressure statistics across punch stations</p>
          </div>
        </div>

        <CompressionDataTable
          headers={["Section", "Mean (kN)", "SD (%)", "Min (kN) [Punch]", "Max (kN) [Punch]"]}
          rows={[
            ["Pre Pressure", safeStr(pp.meanKn), safeStr(pp.sdPercent), `${safeStr(pp.minKn)} [#${safeStr(pp.minPunchNo)}]`, `${safeStr(pp.maxKn)} [#${safeStr(pp.maxPunchNo)}]`],
            ["Main Pressure", safeStr(mp.meanKn), safeStr(mp.sdPercent), `${safeStr(mp.minKn)} [#${safeStr(mp.minPunchNo)}]`, `${safeStr(mp.maxKn)} [#${safeStr(mp.maxPunchNo)}]`],
            ["Filling Depth Adjustments", `Increase: ${safeStr(adj.increaseTimes)} times`, `Decrease: ${safeStr(adj.decreaseTimes)} times`, "-", "-"],
          ]}
        />
      </section>

      <section aria-label="Tightness" className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-2">TIGHTNESS</h2>
        <CompressionDataTable
          headers={["Section", "Average (kN)", "SD (%)", "Max (kN)", "Max Punch No."]}
          rows={[
            { key: "upperPunch", name: "Upper Punch" },
            { key: "lowerPunch", name: "Lower Punch" },
            { key: "ejectionForce", name: "Ejection Force" },
          ].map(({ key, name }) => {
            const values = (tightness[key] || {}) as Record<string, unknown>;
            return [name, safeStr(values.averageKn), safeStr(values.sdPercent), safeStr(values.maxKn), safeStr(values.maxPunch)];
          })}
        />
      </section>

      <section aria-label="Tablet Checker" className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-2">TABLET CHECKER</h2>
        <CompressionDataTable
          headers={["Measurement", "Average", "Max", "Min", "SD (%)"]}
          rows={[
            { key: "weightMg", name: "Weight (mg)" },
            { key: "thicknessMm", name: "Thickness (mm)" },
            { key: "diameterMm", name: "Diameter (mm)" },
            { key: "hardnessN", name: "Hardness (N)" },
          ].map(({ key, name }) => {
            const values = (checker[key] || {}) as Record<string, unknown>;
            return [name, safeStr(values.average), safeStr(values.max), safeStr(values.min), safeStr(values.sdPercent)];
          })}
        />
      </section>

      {/* 5. TABLET DATA & COUNTERS */}
      <section aria-label="Tablet Data" className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-600" />
              TABLET DATA
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Production tablet counters, good yield, and rejection classification</p>
          </div>
          <span className="text-[11px] text-emerald-600 font-bold">{prod.yieldPercent} Good Yield</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {[
            { name: "Total Counter :", value: prod.totalTablets, color: "text-slate-900" },
            { name: "A.W.C Counter :", value: prod.awcCount, color: "text-amber-600" },
            { name: "HEP (High Rejection) :", value: prod.hepCount, color: "text-rose-600" },
            { name: "LEP (Low Rejection) :", value: prod.lepCount, color: "text-slate-600" },
            { name: "GOOD :", value: prod.goodTablets, color: "text-emerald-600" },
          ].map((counter) => (
            <div key={counter.name} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">{counter.name}</span>
              <strong className={`text-xl font-bold font-mono mt-1 block ${counter.color}`}>{counter.value} Tabs</strong>
            </div>
          ))}
        </div>
      </section>

      {/* 6. ALARM HISTORY */}
      <section aria-label="Alarm History" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-600" />
              ALARM HISTORY
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Chronological record of machine alarms and fault events from telemetry</p>
          </div>
          <div className="relative max-w-xs w-full">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search alarm or user..."
              value={alarmSearch}
              onChange={(e) => {
                setAlarmSearch(e.target.value);
                setAlarmPage(1);
              }}
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {paginatedAlarms.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              <Info className="h-6 w-6 mx-auto mb-2 text-slate-300" />
              No alarms recorded for this compression batch interval.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">No</th>
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Batch No.</th>
                    <th className="py-3 px-4">Message</th>
                    <th className="py-3 px-4">Severity / Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {paginatedAlarms.map((alm, idx) => (
                    <tr key={`comp_alm_${alm.no || idx}_${idx}`} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">{String(alm.no || (alarmPage - 1) * pageSize + idx + 1)}</td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{formatDateTime(pickText(alm, ALARM_TIME_KEYS))}</td>
                      <td className="py-3 px-4 font-sans text-slate-700 truncate max-w-[140px]">{pickText(alm, ["product", "productName"]) || effectiveProduct}</td>
                      <td className="py-3 px-4 text-slate-600">{pickText(alm, ["batchNo", "batchNumber"]) || effectiveBatchNo}</td>
                      <td className="py-3 px-4 font-sans font-semibold text-slate-900">{pickText(alm, ALARM_MSG_KEYS) || "-"}</td>
                      <td className="py-3 px-4 font-sans text-slate-500">{pickText(alm, ["remark", "severity"]) || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredAlarms.length > pageSize && (
            <div className="p-3 border-t border-slate-200 flex justify-end">
              <Pagination
                page={alarmPage}
                pageSize={pageSize}
                totalRecords={filteredAlarms.length}
                onPageChange={setAlarmPage}
              />
            </div>
          )}
        </div>
      </section>

      {/* 7. OPERATING HISTORY */}
      <section aria-label="Operating History" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-600" />
              OPERATING HISTORY / AUDIT TRAIL
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Machine state changes, parameter modifications, and recipe events</p>
          </div>
          <div className="relative max-w-xs w-full">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search operating message..."
              value={auditSearch}
              onChange={(e) => {
                setAuditSearch(e.target.value);
                setAuditPage(1);
              }}
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {paginatedAudits.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              <Info className="h-6 w-6 mx-auto mb-2 text-slate-300" />
              No operating audit trail entries recorded for this batch.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">No</th>
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Batch No.</th>
                    <th className="py-3 px-4">Message / Action</th>
                    <th className="py-3 px-4">Previous</th>
                    <th className="py-3 px-4">New</th>
                    <th className="py-3 px-4">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {paginatedAudits.map((a, idx) => (
                    <tr key={`comp_audit_${idx}_${a.time || idx}`} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">{String(a.no || (auditPage - 1) * pageSize + idx + 1)}</td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{formatDateTime(pickText(a, ["time", "timestamp", "eventAt", "occurred_time"]))}</td>
                      <td className="py-3 px-4 font-sans text-slate-700 truncate max-w-[120px]">{pickText(a, ["product", "productName"]) || effectiveProduct}</td>
                      <td className="py-3 px-4 text-slate-600">{pickText(a, ["batchNo", "batchNumber"]) || effectiveBatchNo}</td>
                      <td className="py-3 px-4 font-sans font-bold text-slate-900">{pickText(a, ["message", "action", "eventName", "description"]) || "-"}</td>
                      <td className="py-3 px-4 text-slate-500">{pickText(a, ["previous", "previousValue", "previousState"]) || "-"}</td>
                      <td className="py-3 px-4 font-bold text-indigo-700">{pickText(a, ["newV", "new", "newValue", "newState"]) || "-"}</td>
                      <td className="py-3 px-4 font-sans text-slate-500">{pickText(a, ["remark", "comment"]) || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredAudits.length > pageSize && (
            <div className="p-3 border-t border-slate-200 flex justify-end">
              <Pagination
                page={auditPage}
                pageSize={pageSize}
                totalRecords={filteredAudits.length}
                onPageChange={setAuditPage}
              />
            </div>
          )}
        </div>
      </section>

      {/* 8. LOGIN / LOGOUT HISTORY */}
      <section aria-label="Login Logout History" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              USER LOGIN / LOGOUT HISTORY
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Chronological record of operator and supervisor workstation access</p>
          </div>
          <div className="relative max-w-xs w-full">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search user or login activity..."
              value={loginSearch}
              onChange={(e) => {
                setLoginSearch(e.target.value);
                setLoginPage(1);
              }}
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {paginatedLogins.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              <Info className="h-6 w-6 mx-auto mb-2 text-slate-300" />
              No user login / logout records found for this compression batch timeframe.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">No</th>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">User ID</th>
                    <th className="py-3 px-4">Operator / Name</th>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Batch No.</th>
                    <th className="py-3 px-4">Activity / Action</th>
                    <th className="py-3 px-4">Status / Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {paginatedLogins.map((l, idx) => {
                    const lAny = l as Record<string, unknown>;
                    const timeStr = String(lAny.time || lAny.timestamp || lAny.dt || lAny.event_time || "-");
                    const userIdStr = String(lAny.userId || lAny.u || lAny.user_id || "-");
                    const opNameStr = String(lAny.operatorName || lAny.userName || lAny.user_name || userIdStr);
                    const actStr = String(lAny.action || lAny.act || lAny.eventType || "USER_LOGIN");
                    const isLogin = actStr.toUpperCase().includes("LOGIN");
                    return (
                      <tr key={`comp_login_${idx}_${timeStr}`} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-bold text-slate-900">{String(lAny.no || (loginPage - 1) * pageSize + idx + 1)}</td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{formatDateTime(timeStr === "-" ? "" : timeStr)}</td>
                        <td className="py-3 px-4 font-sans font-bold text-slate-800">{userIdStr}</td>
                        <td className="py-3 px-4 font-sans text-slate-700">{opNameStr}</td>
                        <td className="py-3 px-4 font-sans text-slate-700 truncate max-w-[120px]">{String(lAny.prod || lAny.productName || lAny.product || effectiveProduct)}</td>
                        <td className="py-3 px-4 text-slate-600">{String(lAny.bNo || lAny.batchNo || effectiveBatchNo)}</td>
                        <td className="py-3 px-4 font-sans">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                            isLogin ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}>
                            {actStr}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-500">{String(lAny.rem || lAny.remark || lAny.status || "SUCCESS")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filteredLogins.length > pageSize && (
            <div className="p-3 border-t border-slate-200 flex justify-end">
              <Pagination
                page={loginPage}
                pageSize={pageSize}
                totalRecords={filteredLogins.length}
                onPageChange={setLoginPage}
              />
            </div>
          )}
        </div>
      </section>

      {/* 9. WORKFLOW CHANGES SUMMARY */}
      <section aria-label="Workflow Changes Summary" className="space-y-4">
        <div className="border-b border-slate-200 pb-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-indigo-600" />
            WORKFLOW CHANGES SUMMARY
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Review, approval and status transitions recorded for this batch lot</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {workflowRows.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              <Info className="h-6 w-6 mx-auto mb-2 text-slate-300" />
              No workflow actions have been recorded for this batch yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">No</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Stage</th>
                    <th className="py-3 px-4">Status Change</th>
                    <th className="py-3 px-4">Performed By</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Date / Time</th>
                    <th className="py-3 px-4">Comments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workflowRows.map((w, idx) => {
                    const fromStage = pickText(w, ["fromStageCode"]);
                    const toStage = pickText(w, ["toStageCode"]);
                    const prevStatus = pickText(w, ["previousStatus"]);
                    const newStatus = pickText(w, ["newStatus"]);
                    return (
                      <tr key={`comp_wf_${idx}`} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{idx + 1}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{(pickText(w, ["actionName", "actionCode"]) || "-").replace(/_/g, " ")}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{fromStage || toStage ? `${fromStage || "-"} → ${toStage || "-"}` : "-"}</td>
                        <td className="py-3 px-4 font-mono text-indigo-700">{prevStatus || newStatus ? `${(prevStatus || "-").replace(/_/g, " ")} → ${(newStatus || "-").replace(/_/g, " ")}` : "-"}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{pickText(w, ["performerName", "performedBy"]) || "-"}</td>
                        <td className="py-3 px-4 text-slate-600">{pickText(w, ["performerRole"]) || "-"}</td>
                        <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">{formatDateTime(pickText(w, ["timestamp", "performedAt", "createdAt"]))}</td>
                        <td className="py-3 px-4 text-slate-500 max-w-[260px]">{pickText(w, ["comments", "justification", "esignatureReason"]) || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* 10. PRINT CONTROLLED SUMMARY */}
      <section aria-label="Print Controlled Summary" className="space-y-4">
        <div className="border-b border-slate-200 pb-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Printer className="h-3.5 w-3.5 text-emerald-600" />
            PRINT CONTROLLED SUMMARY
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Controlled GxP copies issued for this batch lot</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {printRows.length === 0 ? (
            <div className="p-4 flex items-center justify-between text-[11px] text-slate-500">
              <span>No controlled copies have been printed yet for this batch.</span>
              <span className="text-slate-400 font-mono">0 copies authorized</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Copy No</th>
                    <th className="py-3 px-4">Printed By</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Printed At</th>
                    <th className="py-3 px-4">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {printRows.map((p, idx) => (
                    <tr key={`comp_print_${idx}`} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{pickText(p, ["copyNo"]) || idx + 1}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{pickText(p, ["printedBy"]) || "-"}</td>
                      <td className="py-3 px-4 text-slate-600">{pickText(p, ["userRole"]) || "-"}</td>
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">{formatDateTime(pickText(p, ["printedAt"]))}</td>
                      <td className="py-3 px-4 text-slate-500 max-w-[300px]">{pickText(p, ["reason"]) || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default CompressionReportView;

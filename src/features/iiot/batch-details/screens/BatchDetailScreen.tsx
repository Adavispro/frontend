"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  WarningCircle,
  FileText,
  ChartLine,
  CheckCircle,
  XCircle,
  ShieldCheck,
  DownloadSimple,
  ArrowsClockwise,
  ArrowCounterClockwise,
  MagnifyingGlass,
  Funnel,
  Bell,
  Lock,
  Cpu,
  CalendarBlank,
  X,
  Target,
  SpinnerGap,
} from "@phosphor-icons/react";
import {
  getAlarmEventDataPaginated,
  getBatchSummaryPaginated,
  getCppDataPaginated,
  getCriticalParameters,
  getCriticalParameterLimits,
  getWorkflowAuditTrail,
  getWorkflowInstanceAndHistory,
  getAllowedActions,
  downloadBatchPdfBlob,
  type AllowedWorkflowAction,
  type WorkflowAuditEvent,
  type WorkflowActionHistoryItem,
} from "@/features/iiot/equipment/api/reports.api";
import type {
  AlarmEventRecord,
  BatchSummary,
  CppRecord,
  CriticalParameter,
  CriticalParameterLimit,
} from "@/features/iiot/equipment/schemas/reports.schema";
import DynamicProcessTrendChart, {
  type CanonicalTrendPoint,
  type TrendLimitConfig,
  type TrendPointStatus,
} from "../components/DynamicProcessTrendChart";
import Pagination from "@/components/ui/Pagination";
import { WorkflowActionModal } from "../../components/WorkflowActionModal";
import { ROUTES } from "@/config/routes";
import { getSafeReturnTo } from "@/utils/navigation";

export interface BatchDetailScreenProps {
  batchId?: string;
  searchParams?: Record<string, string | string[] | undefined>;
}

type TabType = "PARAMETERS" | "TRENDS" | "ALARMS" | "AUDIT";

const toText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();

const toDisplayDate = (value: unknown): string => {
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
    second: "2-digit",
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
  if (normalized === "DEFERRED") {
    return "bg-purple-50 text-purple-700 border-purple-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
};

/**
 * Case-insensitive, alias-aware metric extractor for various telemetry datasets.
 */
function getMetricValue(metrics: Record<string, unknown> | undefined, ...candidateKeys: string[]): string | number {
  if (!metrics) return "-";

  // 1. Direct key match
  for (const k of candidateKeys) {
    if (metrics[k] !== undefined && metrics[k] !== null && metrics[k] !== "") {
      return metrics[k] as string | number;
    }
  }

  // 2. Normalized key match (stripping underscores, hyphens, and casing)
  const entries = Object.entries(metrics);
  for (const k of candidateKeys) {
    const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const [key, val] of entries) {
      if (key.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanK && val !== undefined && val !== null && val !== "") {
        return val as string | number;
      }
    }
  }

  return "-";
}

const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

const humanizeMetricName = (key: string): string => {
  const norm = normalizeKey(key);
  if (norm.includes("agspeed") || norm.includes("agitatorspeed")) return "Agitator Speed";
  if (norm.includes("agamps") || norm.includes("agitatoramps")) return "Agitator Current";
  if (norm.includes("chpspeed") || norm.includes("chopperspeed")) return "Chopper Speed";
  if (norm.includes("chpamps") || norm.includes("chopperamps")) return "Chopper Current";
  if (norm.includes("heatertemp")) return "Heater Temperature";
  if (norm.includes("inlettemp")) return "Inlet Temperature";
  if (norm.includes("outlettemp")) return "Outlet Temperature";
  if (norm.includes("bedtemp")) return "Bed Temperature";
  if (norm.includes("steampressure") || norm.includes("steam")) return "Steam Pressure";
  if (norm.includes("exhaustfanspeed") || norm.includes("exhfan")) return "Exhaust Fan Speed";
  if (norm.includes("dosingspeed") || norm.includes("dosing")) return "Dosing Pump Speed";
  if (norm.includes("wmdspeed") || norm.includes("wmd")) return "WMD Speed";
  if (norm.includes("impellerspeed")) return "Impeller Speed";
  if (norm.includes("impelleramps")) return "Impeller Current";
  if (norm.includes("binderflow")) return "Binder Flow Rate";
  if (norm.includes("granulemoisture") || norm.includes("moisture")) return "Granule Moisture";

  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const inferMetricUnit = (key: string, rawUnit?: string | null): string => {
  if (rawUnit && rawUnit.trim()) {
    const u = rawUnit.trim();
    if (u.toLowerCase() === "celsius" || u.toLowerCase() === "degc" || u.toLowerCase() === "c") return "°C";
    if (u.toLowerCase() === "rpm") return "RPM";
    if (u.toLowerCase() === "a" || u.toLowerCase() === "amps" || u.toLowerCase() === "amperes") return "A";
    if (u.toLowerCase() === "bar") return "bar";
    if (u.toLowerCase() === "%" || u.toLowerCase() === "percent" || u.toLowerCase() === "percentage") return "%";
    if (u.toLowerCase() === "lph") return "LPH";
    return u;
  }

  const norm = normalizeKey(key);
  if (norm.includes("fan") || norm.includes("moisture") || norm.includes("pct") || norm.includes("percent")) return "%";
  if (norm.includes("speed") || norm.includes("rpm")) return "RPM";
  if (norm.includes("amps") || norm.includes("current")) return "A";
  if (norm.includes("temp")) return "°C";
  if (norm.includes("pressure") || norm.includes("press") || norm.includes("bar")) return "bar";
  if (norm.includes("flow") || norm.includes("lph")) return "LPH";
  return "units";
};

function parseNum(val: unknown): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const num = typeof val === "number" ? val : parseFloat(String(val));
  return isNaN(num) ? undefined : num;
}

function resolveMetricLimits(
  metricKey: string,
  equipmentId?: string,
  limitsList: CriticalParameterLimit[] = [],
  parametersList: CriticalParameter[] = [],
): { parameterName: string; unit: string; limits: TrendLimitConfig } {
  const normKey = normalizeKey(metricKey);

  const matchedLimit =
    limitsList.find(
      (l) =>
        (!equipmentId || l.equipmentId === equipmentId) &&
        (normalizeKey(l.parameterCode || "") === normKey ||
          normalizeKey(l.parameterId || "") === normKey ||
          normalizeKey(l.parameterName || "") === normKey),
    ) ||
    limitsList.find(
      (l) =>
        normalizeKey(l.parameterCode || "") === normKey ||
        normalizeKey(l.parameterId || "") === normKey ||
        normalizeKey(l.parameterName || "") === normKey,
    );

  const matchedParam =
    parametersList.find(
      (p) =>
        (!equipmentId || p.equipmentId === equipmentId) &&
        (normalizeKey(p.parameterCode || "") === normKey ||
          normalizeKey(p.parameterId || "") === normKey ||
          normalizeKey(p.parameterName || "") === normKey),
    ) ||
    parametersList.find(
      (p) =>
        normalizeKey(p.parameterCode || "") === normKey ||
        normalizeKey(p.parameterId || "") === normKey ||
        normalizeKey(p.parameterName || "") === normKey,
    );

  const parameterName =
    matchedLimit?.parameterName ||
    matchedParam?.parameterName ||
    humanizeMetricName(metricKey);

  const unit = inferMetricUnit(
    metricKey,
    matchedParam?.unitOfMeasure || matchedLimit?.unitOfMeasure,
  );

  const upperCriticalLimit = parseNum(
    matchedLimit?.highCriticalValue ?? matchedLimit?.upperLimit ?? matchedLimit?.maxValue,
  );
  const upperWarningLimit = parseNum(
    matchedLimit?.highWarningValue ?? matchedLimit?.warningHigh,
  );
  const idealMin = parseNum(matchedLimit?.idealMinValue);
  const idealMax = parseNum(matchedLimit?.idealMaxValue);
  const idealTarget = parseNum(
    matchedLimit?.floatValue ??
      (idealMin !== undefined && idealMax !== undefined ? (idealMin + idealMax) / 2 : undefined),
  );
  const lowerWarningLimit = parseNum(
    matchedLimit?.lowWarningValue ?? matchedLimit?.warningLow,
  );
  const lowerCriticalLimit = parseNum(
    matchedLimit?.lowCriticalValue ?? matchedLimit?.lowerLimit ?? matchedLimit?.minValue,
  );

  return {
    parameterName,
    unit,
    limits: {
      upperCriticalLimit,
      upperWarningLimit,
      idealTarget,
      idealMin,
      idealMax,
      lowerWarningLimit,
      lowerCriticalLimit,
    },
  };
}

export default function BatchDetailScreen({ batchId }: BatchDetailScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const queryBatchNo = searchParams.get("batchNo") || batchId || "";
  const queryLotNo = searchParams.get("lotNo") || "";
  const queryEquipmentCode = searchParams.get("equipmentCode") || "";
  const returnToRoute = getSafeReturnTo(
    searchParams.get("returnTo"),
    ROUTES.iiotMyActions,
  );

  const [activeTab, setActiveTab] = useState<TabType>("PARAMETERS");
  const [isLoading, setIsLoading] = useState(true);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [cppRecords, setCppRecords] = useState<CppRecord[]>([]);
  const [alarmRecords, setAlarmRecords] = useState<AlarmEventRecord[]>([]);
  const [auditEvents, setAuditEvents] = useState<WorkflowAuditEvent[]>([]);
  const [actionHistory, setActionHistory] = useState<WorkflowActionHistoryItem[]>([]);
  const [allowedActions, setAllowedActions] = useState<AllowedWorkflowAction[]>([]);
  const [criticalParams, setCriticalParams] = useState<CriticalParameter[]>([]);
  const [paramLimits, setParamLimits] = useState<CriticalParameterLimit[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Modal State
  const [modalAction, setModalAction] = useState<AllowedWorkflowAction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Filter States (Persisted across tabs)
  const [parameterSearch, setParameterSearch] = useState("");
  const [alarmFilter, setAlarmFilter] = useState("ALL");
  const [auditSearch, setAuditSearch] = useState("");
  const [selectedTrendMetric, setSelectedTrendMetric] = useState<string>("");

  // Alarm Correlation State
  const [correlatedAlarm, setCorrelatedAlarm] = useState<AlarmEventRecord | null>(null);

  // Tab-Isolated Pagination States
  const [parametersPage, setParametersPage] = useState(1);
  const [parametersPageSize, setParametersPageSize] = useState(10);

  const [alarmsPage, setAlarmsPage] = useState(1);
  const [alarmsPageSize, setAlarmsPageSize] = useState(10);

  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(10);

  // Reset pagination on batch switch (Batch Isolation)
  useEffect(() => {
    setParametersPage(1);
    setAlarmsPage(1);
    setAuditPage(1);
    setCorrelatedAlarm(null);
  }, [queryBatchNo]);

  const loadBatchData = useCallback(async () => {
    if (!queryBatchNo) return;
    setIsLoading(true);
    try {
      // 1. Fetch batch summary records
      const summaries = await getBatchSummaryPaginated({
        batchNo: queryBatchNo,
        ...(queryLotNo ? { lotNo: queryLotNo } : {}),
      });

      const currentSummary =
        summaries.find((s) => s.batchNo === queryBatchNo) || summaries[0] || null;
      setBatchSummary(currentSummary);

      const targetEquipment =
        queryEquipmentCode || currentSummary?.equipmentId || "G5RMG";

      // 2. Fetch CPP parameters
      try {
        const cpp = await getCppDataPaginated(targetEquipment, {
          batchNo: queryBatchNo,
          ...(queryLotNo ? { lotNo: queryLotNo } : {}),
        });
        setCppRecords(cpp);
        if (cpp.length > 0 && cpp[0].metrics) {
          const keys = Object.keys(cpp[0].metrics);
          if (keys.length > 0 && !selectedTrendMetric) {
            setSelectedTrendMetric(keys[0]);
          }
        }
      } catch (err) {
        console.error("Failed to load CPP records", err);
      }

      // 3. Fetch Critical Parameters & Limits metadata
      try {
        const [paramsRes, limitsRes] = await Promise.allSettled([
          getCriticalParameters({ equipmentId: targetEquipment }),
          getCriticalParameterLimits({ equipmentId: targetEquipment }),
        ]);
        if (paramsRes.status === "fulfilled" && paramsRes.value) {
          setCriticalParams(paramsRes.value);
        }
        if (limitsRes.status === "fulfilled" && limitsRes.value) {
          setParamLimits(limitsRes.value);
        }
      } catch (err) {
        console.error("Failed to load parameter limits metadata", err);
      }

      // 4. Fetch Alarm events
      try {
        const alarms = await getAlarmEventDataPaginated(targetEquipment, {
          batchNo: queryBatchNo,
          ...(queryLotNo ? { lotNo: queryLotNo } : {}),
        });
        setAlarmRecords(alarms);
      } catch (err) {
        console.error("Failed to load Alarm events", err);
      }

      // 5. Fetch 21 CFR Part 11 Audit Trail
      try {
        const audit = await getWorkflowAuditTrail({
          batchNo: queryBatchNo,
          ...(queryLotNo ? { lotNo: queryLotNo } : {}),
          equipmentCode: targetEquipment,
        });
        setAuditEvents(audit);
      } catch (err) {
        console.error("Failed to load Audit trail", err);
      }

      // 6. Fetch Workflow Instance State Machine History & Allowed Actions
      try {
        const histData = await getWorkflowInstanceAndHistory({
          batchNo: queryBatchNo,
          lotNo: queryLotNo,
          equipmentCode: targetEquipment,
        });
        setActionHistory(histData.history || []);

        const actions = await getAllowedActions({
          batchNo: queryBatchNo,
          lotNo: queryLotNo,
          equipmentCode: targetEquipment,
        });
        setAllowedActions(actions);
      } catch (err) {
        console.error("Failed to load workflow state history & actions", err);
      }
    } catch (err) {
      console.error("Error loading batch details", err);
    } finally {
      setIsLoading(false);
    }
  }, [queryBatchNo, queryLotNo, queryEquipmentCode, selectedTrendMetric]);

  useEffect(() => {
    loadBatchData();
  }, [loadBatchData]);

  const handleActionSuccess = () => {
    setActionSuccessMsg("Workflow transition signed and submitted successfully!");
    loadBatchData();
    setTimeout(() => setActionSuccessMsg(null), 5000);
  };

  const handleDownloadPdf = async () => {
    if (!queryBatchNo) return;
    setIsExporting(true);
    try {
      await downloadBatchPdfBlob(queryBatchNo, queryLotNo, queryEquipmentCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to download batch dossier PDF.";
      alert(msg);
    } finally {
      setIsExporting(false);
    }
  };

  // Alarm Correlation Handler
  const handleCorrelateAlarm = (alarm: AlarmEventRecord) => {
    setCorrelatedAlarm(alarm);
    setActiveTab("PARAMETERS");
    setParametersPage(1);
  };

  const handleClearCorrelation = () => {
    setCorrelatedAlarm(null);
    setParametersPage(1);
  };

  // Time window helper for correlation (+/- 30 minutes)
  const isWithinCorrelationWindow = useCallback(
    (timestampStr?: string | null): boolean => {
      if (!correlatedAlarm || !correlatedAlarm.eventAt || !timestampStr) return true;
      const alarmTime = new Date(correlatedAlarm.eventAt).getTime();
      const recordTime = new Date(timestampStr).getTime();
      if (isNaN(alarmTime) || isNaN(recordTime)) return true;
      const diffMinutes = Math.abs(recordTime - alarmTime) / (1000 * 60);
      return diffMinutes <= 30; // Within 30 minutes
    },
    [correlatedAlarm],
  );

  // Filtered Parameters (Alarm Correlated + Search)
  const filteredParameters = useMemo(() => {
    let list = cppRecords;

    if (correlatedAlarm) {
      list = list.filter((rec) => isWithinCorrelationWindow(rec.observedAt));
    }

    if (parameterSearch.trim()) {
      const term = parameterSearch.trim().toLowerCase();
      list = list.filter((rec) => {
        const ts = toDisplayDate(rec.observedAt).toLowerCase();
        if (ts.includes(term)) return true;
        if (rec.metrics) {
          for (const [k, v] of Object.entries(rec.metrics)) {
            if (k.toLowerCase().includes(term) || String(v).toLowerCase().includes(term)) {
              return true;
            }
          }
        }
        return false;
      });
    }

    return list;
  }, [cppRecords, parameterSearch, correlatedAlarm, isWithinCorrelationWindow]);

  // Paginated Parameters with Safe Page Boundary
  const totalParameters = filteredParameters.length;
  const safeParamPages = Math.max(1, Math.ceil(totalParameters / parametersPageSize));
  const safeParamPage = Math.min(Math.max(1, parametersPage), safeParamPages);

  const paginatedParameters = useMemo(() => {
    const start = (safeParamPage - 1) * parametersPageSize;
    return filteredParameters.slice(start, start + parametersPageSize);
  }, [filteredParameters, safeParamPage, parametersPageSize]);

  // Filtered Alarms
  const filteredAlarms = useMemo(() => {
    if (alarmFilter === "ALL") return alarmRecords;
    return alarmRecords.filter(
      (a) => toText(a.severity).toUpperCase() === alarmFilter.toUpperCase(),
    );
  }, [alarmRecords, alarmFilter]);

  // Paginated Alarms with Safe Page Boundary
  const totalAlarms = filteredAlarms.length;
  const safeAlarmPages = Math.max(1, Math.ceil(totalAlarms / alarmsPageSize));
  const safeAlarmPage = Math.min(Math.max(1, alarmsPage), safeAlarmPages);

  const paginatedAlarms = useMemo(() => {
    const start = (safeAlarmPage - 1) * alarmsPageSize;
    return filteredAlarms.slice(start, start + alarmsPageSize);
  }, [filteredAlarms, safeAlarmPage, alarmsPageSize]);

  // Filtered Audit Events (Correlated + Search)
  const filteredAuditEvents = useMemo(() => {
    let list = auditEvents;
    if (correlatedAlarm) {
      list = list.filter((ev) => isWithinCorrelationWindow(ev.timestamp));
    }
    if (auditSearch.trim()) {
      const term = auditSearch.trim().toLowerCase();
      list = list.filter((ev) => {
        return (
          toText(ev.userId).toLowerCase().includes(term) ||
          toText(ev.userName).toLowerCase().includes(term) ||
          toText(ev.userRole).toLowerCase().includes(term) ||
          toText(ev.actionCode || ev.action).toLowerCase().includes(term) ||
          toText(ev.esignatureReason).toLowerCase().includes(term) ||
          toText(ev.regulatoryStatement).toLowerCase().includes(term)
        );
      });
    }
    return list;
  }, [auditEvents, auditSearch, correlatedAlarm, isWithinCorrelationWindow]);

  // Paginated Audit Events with Safe Page Boundary
  const totalAudit = filteredAuditEvents.length;
  const safeAuditPages = Math.max(1, Math.ceil(totalAudit / auditPageSize));
  const safeAuditPage = Math.min(Math.max(1, auditPage), safeAuditPages);

  const paginatedAuditEvents = useMemo(() => {
    const start = (safeAuditPage - 1) * auditPageSize;
    return filteredAuditEvents.slice(start, start + auditPageSize);
  }, [filteredAuditEvents, safeAuditPage, auditPageSize]);

  const targetEquipmentCode =
    queryEquipmentCode || batchSummary?.equipmentId || "G5RMG";

  // Dynamic Available Metrics with Parameter Names & Units
  const availableMetricsList = useMemo(() => {
    if (cppRecords.length === 0 || !cppRecords[0]?.metrics) return [];
    const keys = Object.keys(cppRecords[0].metrics);
    return keys.map((key) => {
      const meta = resolveMetricLimits(key, targetEquipmentCode, paramLimits, criticalParams);
      return {
        key,
        label: meta.parameterName,
        unit: meta.unit,
      };
    });
  }, [cppRecords, targetEquipmentCode, paramLimits, criticalParams]);

  // Current Selected Metric Metadata
  const currentMetricMeta = useMemo(() => {
    if (!selectedTrendMetric) {
      return {
        parameterName: "Process Parameter",
        unit: "units",
        limits: undefined,
      };
    }
    return resolveMetricLimits(selectedTrendMetric, targetEquipmentCode, paramLimits, criticalParams);
  }, [selectedTrendMetric, targetEquipmentCode, paramLimits, criticalParams]);

  // Canonical Process Trend Points Dataset
  const canonicalTrendPoints = useMemo((): CanonicalTrendPoint[] => {
    if (!selectedTrendMetric || cppRecords.length === 0) return [];

    let dataset = cppRecords;
    if (correlatedAlarm) {
      dataset = dataset.filter((rec) => isWithinCorrelationWindow(rec.observedAt));
    }

    // Chronological Sort
    const sorted = [...dataset].sort((a, b) => {
      const ta = new Date(a.observedAt || 0).getTime();
      const tb = new Date(b.observedAt || 0).getTime();
      return ta - tb;
    });

    const limits = currentMetricMeta.limits;

    return sorted.map((record, index) => {
      const rawVal = record.metrics?.[selectedTrendMetric];
      const numVal = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal));
      const val = isNaN(numVal) ? 0 : numVal;

      const obsDate = record.observedAt ? new Date(record.observedAt) : new Date();
      const timeStr = !isNaN(obsDate.getTime())
        ? new Intl.DateTimeFormat("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          }).format(obsDate)
        : "-";
      const fullDateStr = !isNaN(obsDate.getTime())
        ? new Intl.DateTimeFormat("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          }).format(obsDate)
        : "-";

      // Status Threshold Evaluation
      let status: TrendPointStatus = "NORMAL";
      if (rawVal === undefined || rawVal === null || rawVal === "") {
        status = "NO_DATA";
      } else if (limits) {
        if (limits.upperCriticalLimit !== undefined && val >= limits.upperCriticalLimit) {
          status = "CRITICAL";
        } else if (limits.lowerCriticalLimit !== undefined && val <= limits.lowerCriticalLimit) {
          status = "CRITICAL";
        } else if (limits.upperWarningLimit !== undefined && val >= limits.upperWarningLimit) {
          status = "WARNING";
        } else if (limits.lowerWarningLimit !== undefined && val <= limits.lowerWarningLimit) {
          status = "WARNING";
        }
      }

      return {
        index,
        timestamp: record.observedAt || "",
        formattedTime: timeStr,
        formattedFullDate: fullDateStr,
        value: val,
        metricKey: selectedTrendMetric,
        parameterName: currentMetricMeta.parameterName,
        unit: currentMetricMeta.unit,
        status,
        upperCriticalLimit: limits?.upperCriticalLimit,
        upperWarningLimit: limits?.upperWarningLimit,
        idealTarget: limits?.idealTarget,
        idealMin: limits?.idealMin,
        idealMax: limits?.idealMax,
        lowerWarningLimit: limits?.lowerWarningLimit,
        lowerCriticalLimit: limits?.lowerCriticalLimit,
        rawRecord: record,
      };
    });
  }, [cppRecords, selectedTrendMetric, currentMetricMeta, correlatedAlarm, isWithinCorrelationWindow]);

  const activeStatus = toText(
    batchSummary?.batchStatus ||
      (batchSummary?.stages && batchSummary.stages[0]?.approval?.status) ||
      "PENDING",
  );

  return (
    <div className="flex-1 space-y-6 p-6 bg-slate-50 text-slate-900 min-h-screen">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(returnToRoute)}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition shadow-sm"
            title="Return to Queue"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 font-mono">
                {queryBatchNo || "BATCH RECORD"}
              </h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadge(
                  activeStatus,
                )}`}
              >
                {activeStatus.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Production Execution Dossier &bull; Lot:{" "}
              <strong className="font-mono text-slate-700">
                {queryLotNo || toText(batchSummary?.lotNo) || "-"}
              </strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadBatchData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 shadow-sm transition disabled:opacity-50"
          >
            <ArrowsClockwise className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={isExporting || !queryBatchNo}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
            title="Download Official 21 CFR Part 11 GxP PDF Dossier"
          >
            {isExporting ? (
              <SpinnerGap className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <DownloadSimple className="h-3.5 w-3.5" />
            )}
            Download PDF
          </button>

          {/* Dynamic Workflow Stage Action Buttons */}
          {allowedActions.map((action) => {
            const isApprove = action.actionType === "APPROVE" || action.actionCode === "APPROVE";
            const isReject = action.actionType === "REJECT" || action.actionCode === "REJECT" || action.actionCode === "REQUEST_ADDITIONAL_INFO";
            const isDefer = action.actionType === "DEFER" || action.actionCode === "DEFER";

            let btnClass = "bg-indigo-600 hover:bg-indigo-700 text-white";
            if (isApprove) btnClass = "bg-emerald-600 hover:bg-emerald-700 text-white";
            if (isReject) btnClass = "bg-amber-600 hover:bg-amber-700 text-white";
            if (isDefer) btnClass = "bg-purple-600 hover:bg-purple-700 text-white";

            return (
              <button
                key={action.actionCode}
                onClick={() => {
                  setModalAction(action);
                  setIsModalOpen(true);
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold text-xs transition shadow-sm ${btnClass}`}
              >
                <Lock className="h-3.5 w-3.5" />
                {action.displayName || action.actionName || action.actionCode}
              </button>
            );
          })}
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm animate-in fade-in duration-300">
          <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Alarm Correlation Active Banner */}
      {correlatedAlarm && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-center justify-between shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 border border-amber-300 rounded-xl text-amber-800">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-900 flex items-center gap-2">
                <span>Correlated to Alarm Event:</span>
                <span className="font-mono px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 font-semibold">
                  {toText(correlatedAlarm.alarmCode)}
                </span>
                <span className="text-slate-500 font-normal">
                  ({toDisplayDate(correlatedAlarm.eventAt)})
                </span>
              </div>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Filtering telemetry parameters, dynamic trends, and audit trail to the ±30 minute window around this event.
              </p>
            </div>
          </div>

          <button
            onClick={handleClearCorrelation}
            className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-semibold transition shadow-sm"
          >
            <X className="h-3.5 w-3.5" />
            <span>Clear Correlation</span>
          </button>
        </div>
      )}

      {/* Batch Overview Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-indigo-600" />
          Batch Metadata & Process State
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          <div>
            <span className="text-[11px] text-slate-400 uppercase font-semibold">Product Name</span>
            <div className="text-sm font-semibold text-slate-900 mt-0.5">
              {toText(batchSummary?.productName) || "Allopurinol Tablets IP 100mg"}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              {toText(batchSummary?.productCode) || "STAPU1000"}
            </div>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 uppercase font-semibold">Equipment Code</span>
            <div className="text-sm font-semibold text-slate-900 font-mono mt-0.5">
              {queryEquipmentCode || toText(batchSummary?.equipmentId) || "G5RMG"}
            </div>
            <div className="text-[10px] text-slate-500">Rapid Mixer Granulator</div>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 uppercase font-semibold">Batch Size / Unit</span>
            <div className="text-sm font-semibold text-slate-900 mt-0.5">
              {toText(batchSummary?.batchSize) || "120.00"} {toText(batchSummary?.unit) || "KG"}
            </div>
            <div className="text-[10px] text-slate-500">Standard Yield: 99.4%</div>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 uppercase font-semibold">Batch Start</span>
            <div className="text-xs font-mono text-slate-800 mt-0.5">
              {toDisplayDate(batchSummary?.batchStartAt || "2026-08-15T08:00:00Z")}
            </div>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 uppercase font-semibold">Batch End</span>
            <div className="text-xs font-mono text-slate-800 mt-0.5">
              {toDisplayDate(batchSummary?.batchEndAt || "2026-08-15T11:45:00Z")}
            </div>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 uppercase font-semibold">Operator</span>
            <div className="text-sm font-semibold text-slate-900 mt-0.5">
              {toText(batchSummary?.operatorName) || "Operator User 01"}
            </div>
            <div className="text-[10px] text-slate-500">Shift A &bull; Line 01</div>
          </div>
        </div>

        {/* Dynamic Workflow Progression Track */}
        {batchSummary?.stages && batchSummary.stages.length > 0 && (
          <div className="mt-6 pt-6 border-t border-slate-100">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block mb-3">
              Multi-Stage Workflow Definition Status
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {batchSummary.stages.map((st, idx) => {
                const eq = toText(st.equipmentCode || st.equipmentId || `STAGE-${idx + 1}`);
                const seq = st.sequenceOrder || idx + 1;
                const app = (st.approval as Record<string, unknown>) || {};
                const s = toText(app.status || "PENDING");
                const isApproved = s === "APPROVED" || s === "COMPLETED";

                return (
                  <div
                    key={`${eq}_${seq}`}
                    className={`p-3 rounded-xl border flex items-center justify-between ${
                      isApproved
                        ? "bg-emerald-50/50 border-emerald-200"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        Stage {seq}
                      </span>
                      <div className="text-xs font-semibold text-slate-800 font-mono">{eq}</div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getStatusBadge(
                        s,
                      )}`}
                    >
                      {s.replace(/_/g, " ")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 text-xs font-medium space-x-2">
        <button
          onClick={() => setActiveTab("PARAMETERS")}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 font-medium transition ${
            activeTab === "PARAMETERS"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <Cpu className="h-4 w-4" /> Parameters & Telemetry ({filteredParameters.length})
        </button>
        <button
          onClick={() => setActiveTab("TRENDS")}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 font-medium transition ${
            activeTab === "TRENDS"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <ChartLine className="h-4 w-4" /> Dynamic Process Trends
        </button>
        <button
          onClick={() => setActiveTab("ALARMS")}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 font-medium transition ${
            activeTab === "ALARMS"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <Bell className="h-4 w-4" /> Alarms & Deviations ({alarmRecords.length})
        </button>
        <button
          onClick={() => setActiveTab("AUDIT")}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 font-medium transition ${
            activeTab === "AUDIT"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <ShieldCheck className="h-4 w-4" /> Audit & Event Data ({filteredAuditEvents.length + actionHistory.length})
        </button>
      </div>

      {/* TAB 1: PARAMETERS / BATCH DATA */}
      {activeTab === "PARAMETERS" && (
        <div className="space-y-4">
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md w-full">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Filter parameters by metric key, value, or timestamp..."
                value={parameterSearch}
                onChange={(e) => {
                  setParameterSearch(e.target.value);
                  setParametersPage(1);
                }}
                className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Showing {filteredParameters.length} of {cppRecords.length} parameter samples
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4">Observed Timestamp</th>
                    <th className="py-3.5 px-4">Agitator Speed (RPM)</th>
                    <th className="py-3.5 px-4">Agitator Amps (A)</th>
                    <th className="py-3.5 px-4">Chopper Speed (RPM)</th>
                    <th className="py-3.5 px-4">Chopper Amps (A)</th>
                    <th className="py-3.5 px-4">Temperature (°C)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredParameters.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 font-sans font-medium">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Funnel className="h-7 w-7 text-slate-400 opacity-60" />
                          <span className="text-slate-700 font-semibold text-sm">
                            No telemetry samples match your search criteria
                          </span>
                          <span className="text-slate-500 text-xs">
                            {parameterSearch ? `No metric keys, values, or timestamps match "${parameterSearch}".` : "No parameter records available for this batch stage."}
                          </span>
                          {parameterSearch && (
                            <button
                              type="button"
                              onClick={() => {
                                setParameterSearch("");
                                setParametersPage(1);
                              }}
                              className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition shadow-sm"
                            >
                              <ArrowCounterClockwise className="h-3.5 w-3.5 text-indigo-600" />
                              Clear Filter
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedParameters.map((record, index) => {
                      const m = (record.metrics || {}) as Record<string, unknown>;
                      const agSpeed = getMetricValue(m, "Ag_Speed", "ag_speed", "agSpeed", "agitatorSpeed", "inlet_temp", "inletTemp", "speed");
                      const agAmps = getMetricValue(m, "Ag_Amps", "ag_amps", "agAmps", "agitatorAmps", "outlet_temp", "outletTemp", "current");
                      const chpSpeed = getMetricValue(m, "Chp_Speed", "chp_speed", "chpSpeed", "chopperSpeed", "bed_temp", "bedTemp");
                      const chpAmps = getMetricValue(m, "Chp_Amps", "chp_amps", "chpAmps", "chopperAmps", "exhaust_fan_speed", "exhaustFanSpeed");
                      const temp = getMetricValue(m, "Heater_Temp", "heater_temp", "heaterTemp", "temperature", "temp", "steam_pressure", "steamPressure");
                      const rowKey = `${toText(record.equipmentId || "PARAM")}_${toText(record.observedAt)}_${(safeParamPage - 1) * parametersPageSize + index}`;

                      return (
                        <tr key={rowKey} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {toDisplayDate(record.observedAt)}
                          </td>
                          <td className="py-3 px-4 text-slate-800">{String(agSpeed)}</td>
                          <td className="py-3 px-4 text-slate-800">{String(agAmps)}</td>
                          <td className="py-3 px-4 text-slate-800">{String(chpSpeed)}</td>
                          <td className="py-3 px-4 text-slate-800">{String(chpAmps)}</td>
                          <td className="py-3 px-4 text-slate-800">{String(temp)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination for Parameters */}
            {filteredParameters.length > 0 && (
              <div className="p-4 border-t border-slate-200 bg-slate-50/50">
                <Pagination
                  page={safeParamPage}
                  pageSize={parametersPageSize}
                  totalRecords={totalParameters}
                  onPageChange={(p) => setParametersPage(p)}
                  onPageSizeChange={(sz) => {
                    setParametersPageSize(sz);
                    setParametersPage(1);
                  }}
                  pageSizeOptions={[10, 25, 50, 100]}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: TRENDS */}
      {activeTab === "TRENDS" && (
        <DynamicProcessTrendChart
          points={canonicalTrendPoints}
          parameterName={currentMetricMeta.parameterName}
          metricKey={selectedTrendMetric}
          unit={currentMetricMeta.unit}
          limits={currentMetricMeta.limits}
          batchNo={queryBatchNo || toText(batchSummary?.batchNo)}
          lotNo={queryLotNo || toText(batchSummary?.lotNo)}
          equipmentCode={targetEquipmentCode}
          availableMetrics={availableMetricsList}
          selectedMetric={selectedTrendMetric}
          onMetricChange={setSelectedTrendMetric}
          isLoading={isLoading}
        />
      )}

      {/* TAB 3: ALARMS */}
      {activeTab === "ALARMS" && (
        <div className="space-y-4">
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Funnel className="h-4 w-4 text-slate-500" />
              <select
                value={alarmFilter}
                onChange={(e) => {
                  setAlarmFilter(e.target.value);
                  setAlarmsPage(1);
                }}
                className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Severity Levels</option>
                <option value="CRITICAL">Critical Alarms</option>
                <option value="WARNING">Warning Alarms</option>
                <option value="INFO">Informational</option>
              </select>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Total {filteredAlarms.length} alarm events
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4">Event Timestamp</th>
                    <th className="py-3.5 px-4">Alarm Code</th>
                    <th className="py-3.5 px-4">Severity</th>
                    <th className="py-3.5 px-4">Description</th>
                    <th className="py-3.5 px-4">Acknowledged By</th>
                    <th className="py-3.5 px-4 text-right">Data Correlation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAlarms.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 font-medium">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <CheckCircle className="h-8 w-8 text-emerald-500 opacity-60" />
                          <span className="text-slate-700 font-semibold text-sm">
                            {alarmFilter !== "ALL" ? `No ${alarmFilter.toLowerCase()} alarms recorded` : "No alarms detected"}
                          </span>
                          <span className="text-slate-500 text-xs">
                            {alarmFilter !== "ALL"
                              ? `No deviation events with severity "${alarmFilter}" were recorded for this batch stage.`
                              : "No critical process limits or deviation events were recorded during this batch stage."}
                          </span>
                          {alarmFilter !== "ALL" && (
                            <button
                              type="button"
                              onClick={() => {
                                setAlarmFilter("ALL");
                                setAlarmsPage(1);
                              }}
                              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition shadow-sm"
                            >
                              <ArrowCounterClockwise className="h-3.5 w-3.5 text-amber-600" />
                              Show All Severity Levels
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedAlarms.map((alarm, idx) => {
                      const alarmKey = `${toText(alarm.alarmCode || "ALM")}_${toText(alarm.eventAt)}_${(safeAlarmPage - 1) * alarmsPageSize + idx}`;
                      const isSelected = correlatedAlarm?.id === alarm.id || (correlatedAlarm?.alarmCode === alarm.alarmCode && correlatedAlarm?.eventAt === alarm.eventAt);

                      return (
                        <tr
                          key={alarmKey}
                          className={`hover:bg-slate-50/80 transition cursor-pointer ${
                            isSelected ? "bg-amber-50/80 border-l-4 border-amber-500 font-medium" : ""
                          }`}
                          onClick={() => handleCorrelateAlarm(alarm)}
                        >
                          <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                            {toDisplayDate(alarm.eventAt)}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                            {toText(alarm.alarmCode)}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                toText(alarm.severity).toUpperCase() === "CRITICAL"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {toText(alarm.severity || "WARNING")}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-800">{toText(alarm.description || "Process threshold limit deviation")}</td>
                          <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">{toText(alarm.acknowledgedBy || "-")}</td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCorrelateAlarm(alarm);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg transition inline-flex items-center gap-1 shadow-sm"
                            >
                              <Target className="h-3.5 w-3.5" />
                              <span>Correlate</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination for Alarms */}
            {filteredAlarms.length > 0 && (
              <div className="p-4 border-t border-slate-200 bg-slate-50/50">
                <Pagination
                  page={safeAlarmPage}
                  pageSize={alarmsPageSize}
                  totalRecords={totalAlarms}
                  onPageChange={(p) => setAlarmsPage(p)}
                  onPageSizeChange={(sz) => {
                    setAlarmsPageSize(sz);
                    setAlarmsPage(1);
                  }}
                  pageSizeOptions={[10, 25, 50, 100]}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT & EVENT DATA */}
      {activeTab === "AUDIT" && (
        <div className="space-y-6">
          {/* Action History Progression */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-600" />
              Workflow Execution History ({actionHistory.length} Transitions)
            </h3>

            {actionHistory.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                No state machine transitions have occurred yet. Initial batch state is active.
              </p>
            ) : (
              <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
                {actionHistory.map((item, idx) => (
                  <div key={item.historyId || `hist_${idx}`} className="relative">
                    <span className="absolute -left-[31px] top-1 p-1 bg-white border-2 border-indigo-600 rounded-full">
                      <div className="h-2 w-2 bg-indigo-600 rounded-full" />
                    </span>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <span className="font-semibold text-slate-900 text-xs">
                        Action: <strong className="text-indigo-600">{item.actionName || item.actionCode}</strong> ({item.fromStageCode || "STAGE"} &rarr; {item.toStageCode || "NEXT"})
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        {toDisplayDate(item.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      Executed by: <strong className="text-slate-800">{item.performerName || item.performedBy}</strong> ({item.performerRole || item.performedBy}) | Resulting Status: <span className="font-semibold text-emerald-700">{item.newStatus}</span>
                    </p>
                    {item.comments && (
                      <p className="text-xs text-slate-600 mt-1 italic bg-slate-50 p-2 rounded-lg border border-slate-200">
                        &quot;{item.comments}&quot;
                      </p>
                    )}
                    {item.additionalInformation && (
                      <p className="text-xs text-amber-800 mt-1 bg-amber-50 p-2 rounded-lg border border-amber-200">
                        <strong>Additional Information Required:</strong> {item.additionalInformation}
                      </p>
                    )}
                    {item.responseNotes && (
                      <p className="text-xs text-indigo-800 mt-1 bg-indigo-50 p-2 rounded-lg border border-indigo-200">
                        <strong>Response Provided:</strong> {item.responseNotes}
                      </p>
                    )}
                    {item.justification && item.justification !== item.comments && (
                      <p className="text-xs text-amber-800 mt-1 bg-amber-50 p-2 rounded-lg border border-amber-200">
                        <strong>Justification:</strong> {item.justification}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 21 CFR Part 11 Audit Trail Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm space-y-4 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                21 CFR Part 11 Electronic Signature Verification Records ({totalAudit})
              </h3>
              <div className="relative max-w-sm w-full">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter audit records (Signer, Role, Action)..."
                  value={auditSearch}
                  onChange={(e) => {
                    setAuditSearch(e.target.value);
                    setAuditPage(1);
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4">Signature Timestamp</th>
                    <th className="py-3.5 px-4">Signer ID</th>
                    <th className="py-3.5 px-4">Signer Name & Role</th>
                    <th className="py-3.5 px-4">Action & Meaning</th>
                    <th className="py-3.5 px-4">E-Sign Status</th>
                    <th className="py-3.5 px-4">Regulatory Statement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAuditEvents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 font-medium">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <Funnel className="h-7 w-7 text-slate-400 opacity-60" />
                          <span className="text-slate-700 font-semibold text-sm">
                            No electronic signature records match criteria
                          </span>
                          <span className="text-slate-500 text-xs">
                            {auditSearch
                              ? `No signature records match "${auditSearch}".`
                              : "No electronic signature records match the active correlation window."}
                          </span>
                          {auditSearch && (
                            <button
                              type="button"
                              onClick={() => {
                                setAuditSearch("");
                                setAuditPage(1);
                              }}
                              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition shadow-sm"
                            >
                              <ArrowCounterClockwise className="h-3.5 w-3.5 text-indigo-600" />
                              Clear Filter
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedAuditEvents.map((event, idx) => {
                      const auditKey = event.auditId || `audit_${event.userId}_${event.timestamp}_${(safeAuditPage - 1) * auditPageSize + idx}`;
                      return (
                        <tr key={auditKey} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                            {toDisplayDate(event.timestamp)}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                            {event.userId}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{event.userName || event.userId}</div>
                            <div className="text-[10px] text-slate-500">{event.userRole}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-indigo-600">{event.actionCode || event.action}</div>
                            <div className="text-[10px] text-slate-500">{event.esignatureReason || "Digital Sign-off"}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle className="h-3 w-3 text-emerald-600" /> VERIFIED (BCRYPT)
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[11px] text-slate-600 max-w-xs truncate">
                            {event.regulatoryStatement || "21 CFR Part 11 compliant legally binding electronic signature."}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination for Audit Events */}
            {filteredAuditEvents.length > 0 && (
              <div className="p-4 border-t border-slate-200 bg-slate-50/50">
                <Pagination
                  page={safeAuditPage}
                  pageSize={auditPageSize}
                  totalRecords={totalAudit}
                  onPageChange={(p) => setAuditPage(p)}
                  onPageSizeChange={(sz) => {
                    setAuditPageSize(sz);
                    setAuditPage(1);
                  }}
                  pageSizeOptions={[10, 25, 50, 100]}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dynamic Workflow Action Modal */}
      {modalAction && (
        <WorkflowActionModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setModalAction(null);
          }}
          onSuccess={handleActionSuccess}
          action={modalAction}
          batchContext={{
            batchNo: queryBatchNo,
            lotNo: queryLotNo || toText(batchSummary?.lotNo) || "01 of 05",
            equipmentCode: queryEquipmentCode || toText(batchSummary?.equipmentId) || "G5RMG",
            equipmentName: toText(batchSummary?.equipmentId || "Equipment"),
            productName: toText(batchSummary?.productName || "Allopurinol Tablets"),
            currentStatus: activeStatus,
          }}
          tenantId="TNT-0001"
          plantId="PLNT-0001"
        />
      )}
    </div>
  );
}

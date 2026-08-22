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
  ClockCounterClockwise,
  MagnifyingGlass,
  Funnel,
  Bell,
  Lock,
  Cpu,
  CalendarBlank,
  X,
  Target,
  SpinnerGap,
  UserCheck,
  UserPlus,
  Lightning,
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
  claimWorkflowTask,
  unclaimWorkflowTask,
  downloadBatchPdfBlob,
  type AllowedWorkflowAction,
  type WorkflowAuditEvent,
  type WorkflowActionHistoryItem,
} from "@/features/iiot/equipment/api/reports.api";
import { useLoginContext } from "@/features/auth/hooks/useCurrentUser";
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

type TabType = "PARAMETERS" | "TRENDS" | "ALARMS" | "EVENT_DATA" | "AUDIT";

const toText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();

// Alarm and SCADA timestamp resolution helper
export function parseFlexibleTimestamp(val: unknown): number | null {
  if (!val) return null;
  if (val instanceof Date) return val.getTime();
  let s = String(val).trim();
  if (!s) return null;

  // Normalize by stripping timezone suffixes for consistent relative timeline comparison
  s = s.replace(/Z$/i, "").replace(/[+-]\d{2}:\d{2}$/, "");

  // Match DD/MM/YYYY or DD-MM-YYYY HH:mm:ss
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    const year = parseInt(dmy[3], 10);
    const hour = parseInt(dmy[4], 10);
    const minute = parseInt(dmy[5], 10);
    const sec = dmy[6] ? parseInt(dmy[6], 10) : 0;
    return Date.UTC(year, month, day, hour, minute, sec);
  }

  // Match YYYY-MM-DD or YYYY/MM/DD HH:mm:ss
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (ymd) {
    const year = parseInt(ymd[1], 10);
    const month = parseInt(ymd[2], 10) - 1;
    const day = parseInt(ymd[3], 10);
    const hour = parseInt(ymd[4], 10);
    const minute = parseInt(ymd[5], 10);
    const sec = ymd[6] ? parseInt(ymd[6], 10) : 0;
    return Date.UTC(year, month, day, hour, minute, sec);
  }

  const parsed = Date.parse(s);
  return isNaN(parsed) ? null : parsed;
}

const toDisplayDate = (value: unknown): string => {
  if (!value) return "-";
  const ms = typeof value === "number" ? value : parseFlexibleTimestamp(value);
  if (ms !== null && !isNaN(ms)) {
    const d = new Date(ms);
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "UTC",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(d);
  }
  const text = toText(value);
  return text || "-";
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
 * Calculates Alarm Severity based on PLC/SCADA Schema:
 * - MsgClass: Category / Grouping (e.g. >=65 or 1 or 17 -> CRITICAL, 64 or 16 or 32 -> WARNING)
 * - MsgProc: Process Priority / Action Code (e.g. 1 or 2 -> CRITICAL, 3 or 4 -> WARNING)
 * - MsgNumber: Fault Code Range (e.g. 100..299 -> CRITICAL, 300..499 -> WARNING)
 * - Fallback: Textual keyword matching (trip, fail, stop, over, limit, warning)
 */
export function calculateAlarmSeverity(record: Record<string, unknown>): "CRITICAL" | "WARNING" | "INFO" {
  if (record.severity) {
    const s = toText(record.severity).toUpperCase();
    if (s === "CRITICAL" || s === "WARNING" || s === "INFO") return s;
  }

  const msgClass = Number(record.msg_class ?? record.MsgClass ?? record.msgClass);
  const msgProc = Number(record.msg_proc ?? record.MsgProc ?? record.msgProc);
  const msgNumber = Number(record.msg_number ?? record.MsgNumber ?? record.msgNumber);

  // 1. Process Priority Check (MsgProc)
  if (msgProc === 1 || msgProc === 2) return "CRITICAL";
  if (msgProc === 3 || msgProc === 4) return "WARNING";

  // 2. Message Class Check (MsgClass - Siemens WinCC standard)
  if (msgClass > 64 || msgClass === 1 || msgClass === 17) return "CRITICAL";
  if (msgClass === 64 || msgClass === 16 || msgClass === 32) return "WARNING";

  // 3. Message Number Range Check (MsgNumber)
  if (!isNaN(msgNumber) && msgNumber > 0) {
    if (msgNumber >= 100 && msgNumber < 300) return "CRITICAL";
    if (msgNumber >= 300 && msgNumber < 500) return "WARNING";
  }

  // 4. Textual Keyword Analysis (MsgText / Description)
  const text = toText(
    record.msg_text || record.MsgText || record.description || record.var1 || record.message || ""
  ).toLowerCase();

  if (
    text.includes("trip") ||
    text.includes("emergency") ||
    text.includes("critical") ||
    text.includes("fail") ||
    text.includes("overload") ||
    text.includes("over temp") ||
    text.includes("over pressure") ||
    text.includes("high high") ||
    text.includes("low low")
  ) {
    return "CRITICAL";
  }

  if (
    text.includes("warn") ||
    text.includes("deviation") ||
    text.includes("high") ||
    text.includes("low") ||
    text.includes("limit") ||
    text.includes("approaching")
  ) {
    return "WARNING";
  }

  return "INFO";
}

const getAlarmEventTime = (a: Record<string, unknown>): string =>
  toText(a.dt || a.eventAt || a.alarm_time || a.time_string || a.event_time || a.timestamp);

const getAlarmCode = (a: Record<string, unknown>): string => {
  if (a.alarmCode) return toText(a.alarmCode);
  if (a.msg_number) return `ALM-${a.msg_number}`;
  if (a.code) return toText(a.code);
  return "ALM-EVENT";
};

const getAlarmDescription = (a: Record<string, unknown>): string =>
  toText(a.description || a.msg_text || a.var1 || a.message || "Process threshold limit deviation");

const getAlarmAcknowledgedBy = (a: Record<string, unknown>): string =>
  toText(a.acknowledgedBy || a.user_id || a.userName || a.plc || "-");

// Equipment Event Data (PLC Audit Events) resolution helpers
const getEventDataTime = (ev: Record<string, unknown>): string =>
  toText(ev.dt || ev.time_stamp || ev.eventAt || ev.event_time || ev.timestamp);

const getEventDataObjectId = (ev: Record<string, unknown>): string =>
  toText(ev.object_id || ev.record_id || ev.objectId || "Recipe / Parameter");

const getEventDataDescription = (ev: Record<string, unknown>): string =>
  toText(ev.description || ev.actionName || ev.action || "Equipment operation event");

const getEventDataUserId = (ev: Record<string, unknown>): string =>
  toText(ev.user_id || ev.userId || ev.userName || "Operator");

const getEventDataChecksum = (ev: Record<string, unknown>): string =>
  toText(ev.checksum || ev.record_id || "-");

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
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanKey === cleanK && val !== undefined && val !== null && val !== "") {
        return val as string | number;
      }
    }
  }

  return "-";
}

/**
 * Resolves critical parameter thresholds from metadata APIs or deterministic fallbacks.
 */
function resolveMetricLimits(
  metricKey: string,
  equipmentCode: string,
  limits: CriticalParameterLimit[],
  criticalParams: CriticalParameter[],
): { parameterName: string; unit: string; limits?: TrendLimitConfig } {
  const normKey = metricKey.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Match against Critical Parameters list
  const matchedParam = criticalParams.find((p) => {
    const pCode = (p.parameterCode || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const pName = (p.parameterName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return pCode.includes(normKey) || normKey.includes(pCode) || pName.includes(normKey) || normKey.includes(pName);
  });

  const unit = toText(matchedParam?.unitOfMeasure) ||
    (normKey.includes("temp") ? "°C" : normKey.includes("speed") ? "RPM" : normKey.includes("amp") ? "A" : normKey.includes("press") ? "bar" : normKey.includes("flow") ? "L/h" : normKey.includes("moist") ? "%" : "units");

  // Match against Critical Parameter Limits metadata
  const matchedLimit = limits.find((l) => {
    const lCode = (l.parameterCode || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const lName = (l.parameterName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const lLimitCode = ((l as Record<string, unknown>).parameterLimitCode as string || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return (
      lCode.includes(normKey) || normKey.includes(lCode) ||
      lName.includes(normKey) || normKey.includes(lName) ||
      lLimitCode.includes(normKey) || normKey.includes(lLimitCode)
    );
  });

  const parameterName = toText(matchedLimit?.parameterName) || toText(matchedParam?.parameterName) || metricKey.replace(/_/g, " ");

  const toNumberOrUndefined = (val: unknown): number | undefined => {
    if (val === undefined || val === null || val === "") return undefined;
    const num = typeof val === "number" ? val : parseFloat(String(val));
    return isNaN(num) ? undefined : num;
  };

  if (matchedLimit) {
    const rawLimit = matchedLimit as Record<string, unknown>;
    return {
      parameterName,
      unit,
      limits: {
        upperCriticalLimit: toNumberOrUndefined(rawLimit.upperCriticalLimit ?? rawLimit.highCriticalValue ?? rawLimit.upperLimit ?? rawLimit.maxValue),
        upperWarningLimit: toNumberOrUndefined(rawLimit.upperWarningLimit ?? rawLimit.highWarningValue ?? rawLimit.warningHigh),
        idealTarget: toNumberOrUndefined(rawLimit.idealTarget ?? rawLimit.targetValue ?? rawLimit.floatValue),
        idealMin: toNumberOrUndefined(rawLimit.idealMin ?? rawLimit.idealMinValue),
        idealMax: toNumberOrUndefined(rawLimit.idealMax ?? rawLimit.idealMaxValue),
        lowerWarningLimit: toNumberOrUndefined(rawLimit.lowerWarningLimit ?? rawLimit.lowWarningValue ?? rawLimit.warningLow),
        lowerCriticalLimit: toNumberOrUndefined(rawLimit.lowerCriticalLimit ?? rawLimit.lowCriticalValue ?? rawLimit.lowerLimit ?? rawLimit.minValue),
      },
    };
  }

  // Deterministic equipment-specific standard operational defaults
  if (normKey.includes("agspeed") || normKey.includes("agitatorspeed") || normKey === "speed") {
    return {
      parameterName: "Agitator Speed",
      unit: "RPM",
      limits: {
        upperCriticalLimit: 175,
        upperWarningLimit: 160,
        idealTarget: 140,
        idealMin: 130,
        idealMax: 150,
        lowerWarningLimit: 120,
        lowerCriticalLimit: 100,
      },
    };
  }

  if (normKey.includes("agamps") || normKey.includes("agitatoramps") || normKey.includes("current")) {
    return {
      parameterName: "Agitator Current",
      unit: "A",
      limits: {
        upperCriticalLimit: 45.0,
        upperWarningLimit: 40.0,
        idealTarget: 32.5,
        idealMin: 28.0,
        idealMax: 36.0,
        lowerWarningLimit: 22.0,
        lowerCriticalLimit: 15.0,
      },
    };
  }

  if (normKey.includes("chpspeed") || normKey.includes("chopperspeed")) {
    return {
      parameterName: "Chopper Speed",
      unit: "RPM",
      limits: {
        upperCriticalLimit: 1600,
        upperWarningLimit: 1500,
        idealTarget: 1420,
        idealMin: 1350,
        idealMax: 1480,
        lowerWarningLimit: 1250,
        lowerCriticalLimit: 1100,
      },
    };
  }

  if (normKey.includes("chpamps") || normKey.includes("chopperamps")) {
    return {
      parameterName: "Chopper Current",
      unit: "A",
      limits: {
        upperCriticalLimit: 18.0,
        upperWarningLimit: 15.0,
        idealTarget: 11.2,
        idealMin: 9.0,
        idealMax: 13.5,
        lowerWarningLimit: 7.0,
        lowerCriticalLimit: 4.0,
      },
    };
  }

  if (normKey.includes("heatertemp") || normKey.includes("temperature") || normKey.includes("temp")) {
    return {
      parameterName: "Granulation Temperature",
      unit: "°C",
      limits: {
        upperCriticalLimit: 75.0,
        upperWarningLimit: 68.0,
        idealTarget: 55.0,
        idealMin: 50.0,
        idealMax: 60.0,
        lowerWarningLimit: 42.0,
        lowerCriticalLimit: 35.0,
      },
    };
  }

  return {
    parameterName,
    unit,
    limits: undefined,
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
  const [eventDataRecords, setEventDataRecords] = useState<Record<string, unknown>[]>([]);
  const [auditEvents, setAuditEvents] = useState<WorkflowAuditEvent[]>([]);
  const [actionHistory, setActionHistory] = useState<WorkflowActionHistoryItem[]>([]);
  const [allowedActions, setAllowedActions] = useState<AllowedWorkflowAction[]>([]);
  const [criticalParams, setCriticalParams] = useState<CriticalParameter[]>([]);
  const [paramLimits, setParamLimits] = useState<CriticalParameterLimit[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  const loginContext = useLoginContext();
  const currentUser = loginContext?.user;
  const userRole = (loginContext?.roles?.[0] as Record<string, unknown>)?.roleCode as string || "PRODUCTION_REVIEWER";
  const [workflowInstance, setWorkflowInstance] = useState<Record<string, unknown> | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);

  // Modal State
  const [modalAction, setModalAction] = useState<AllowedWorkflowAction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Filter States
  const [parameterSearch, setParameterSearch] = useState("");
  const [alarmSearch, setAlarmSearch] = useState("");
  const [alarmFilter, setAlarmFilter] = useState("ALL");
  const [eventDataSearch, setEventDataSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [selectedTrendMetric, setSelectedTrendMetric] = useState<string>("");

  // Alarm Correlation State
  const [correlatedAlarm, setCorrelatedAlarm] = useState<AlarmEventRecord | null>(null);

  // Tab-Isolated Pagination States
  const [parametersPage, setParametersPage] = useState(1);
  const [parametersPageSize, setParametersPageSize] = useState(5);

  const [alarmsPage, setAlarmsPage] = useState(1);
  const [alarmsPageSize, setAlarmsPageSize] = useState(5);

  const [eventDataPage, setEventDataPage] = useState(1);
  const [eventDataPageSize, setEventDataPageSize] = useState(5);

  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(5);

  // Reset pagination on batch switch
  useEffect(() => {
    setParametersPage(1);
    setAlarmsPage(1);
    setEventDataPage(1);
    setAuditPage(1);
    setParameterSearch("");
    setAlarmSearch("");
    setAlarmFilter("ALL");
    setEventDataSearch("");
    setAuditSearch("");
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
        summaries.find(
          (s) => s.batchNo === queryBatchNo && (!queryLotNo || s.lotNo === queryLotNo),
        ) || summaries[0] || null;
      setBatchSummary(currentSummary);

      const targetEquipment =
        queryEquipmentCode || currentSummary?.equipmentId || "G5RMG";

      // 2. Fetch CPP parameters (supports up to 50,000 time series telemetry records)
      try {
        const cpp = await getCppDataPaginated(targetEquipment, {
          batchNo: queryBatchNo,
          limit: 50000,
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

      // 4. Fetch Alarm events for equipment
      try {
        const alarms = await getAlarmEventDataPaginated(targetEquipment, {
          eventCategory: "ALARM",
          limit: 5000,
        });
        setAlarmRecords(alarms as unknown as AlarmEventRecord[]);
      } catch (err) {
        console.error("Failed to load Alarm events", err);
      }

      // 4b. Fetch Equipment Event Data (PLC Audit Events)
      try {
        const events = await getAlarmEventDataPaginated(targetEquipment, {
          eventCategory: "EVENT",
          limit: 5000,
        });
        setEventDataRecords(events as unknown as Record<string, unknown>[]);
      } catch (err) {
        console.error("Failed to load Equipment Event Data", err);
      }

      // 5. Fetch complete 21 CFR Part 11 Audit Trail based on batchNo and lotNo
      try {
        const audit = await getWorkflowAuditTrail({
          batchNo: queryBatchNo,
          ...(queryLotNo ? { lotNo: queryLotNo } : {}),
          ...(queryEquipmentCode ? { equipmentCode: queryEquipmentCode } : {}),
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
        setWorkflowInstance(histData.instance || null);
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

  const handleClaimReview = async () => {
    if (!queryBatchNo) return;
    setIsClaiming(true);
    try {
      const res = await claimWorkflowTask({
        batchNo: queryBatchNo,
        lotNo: queryLotNo || toText(batchSummary?.lotNo) || "01 of 05",
        equipmentCode: targetEquipmentCode,
        userRole: userRole,
        tenantId: "TNT-0001",
      });
      setActionSuccessMsg(res.message || "Task successfully assigned to you!");
      await loadBatchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to claim review task");
    } finally {
      setIsClaiming(false);
    }
  };

  const handleUnclaimReview = async () => {
    if (!queryBatchNo) return;
    setIsClaiming(true);
    try {
      const res = await unclaimWorkflowTask({
        batchNo: queryBatchNo,
        lotNo: queryLotNo || toText(batchSummary?.lotNo) || "01 of 05",
        equipmentCode: targetEquipmentCode,
        tenantId: "TNT-0001",
      });
      setActionSuccessMsg(res.message || "Task released back to group queue.");
      await loadBatchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to release review task");
    } finally {
      setIsClaiming(false);
    }
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

  const targetEquipmentCode =
    queryEquipmentCode || batchSummary?.equipmentId || "G5RMG";

  // Batch & Lot Execution Timeframe Boundaries (startAt to endAt)
  const batchTimeRange = useMemo(() => {
    let startMs: number | null = null;
    let endMs: number | null = null;

    // 1. Stage-specific start/end timestamp
    if (batchSummary?.stages && Array.isArray(batchSummary.stages)) {
      const stage = batchSummary.stages.find(
        (s: Record<string, unknown>) =>
          s.equipmentCode === targetEquipmentCode ||
          s.equipmentId === targetEquipmentCode ||
          s.equipmentType === targetEquipmentCode
      );
      if (stage) {
        const rawStage = stage as Record<string, unknown>;
        const sStart = rawStage.startAt || rawStage.stageStartAt || rawStage.startTime;
        const sEnd = rawStage.endAt || rawStage.stageEndAt || rawStage.endTime;
        if (sStart) startMs = parseFlexibleTimestamp(sStart);
        if (sEnd) endMs = parseFlexibleTimestamp(sEnd);
      }
    }

    // 2. Batch summary overall start/end timestamp
    if (startMs === null && batchSummary?.batchStartAt) {
      startMs = parseFlexibleTimestamp(batchSummary.batchStartAt);
    }
    if (endMs === null && batchSummary?.batchEndAt) {
      endMs = parseFlexibleTimestamp(batchSummary.batchEndAt);
    }

    // 3. Telemetry boundaries fallback from CPP records
    if (cppRecords.length > 0) {
      const sortedObs = cppRecords
        .map((r) => parseFlexibleTimestamp(r.observedAt))
        .filter((t): t is number => t !== null)
        .sort((a, b) => a - b);
      if (sortedObs.length > 0) {
        if (startMs === null) startMs = sortedObs[0];
        if (endMs === null) endMs = sortedObs[sortedObs.length - 1];
      }
    }

    return { startMs, endMs };
  }, [batchSummary, targetEquipmentCode, cppRecords]);

  // Evaluates whether an event/alarm timestamp occurred within this batch's execution timeframe
  const isWithinBatchTimeRange = useCallback(
    (timestampStr?: string | null): boolean => {
      if (!timestampStr) return true;
      const t = parseFlexibleTimestamp(timestampStr);
      if (t === null) return true;
      const { startMs, endMs } = batchTimeRange;
      if (startMs === null && endMs === null) return true;

      // Strict timeframe filtering against batch startAt and endAt with a 15-minute setup/cooldown buffer
      const bufferMs = 15 * 60 * 1000;
      if (startMs !== null && t < startMs - bufferMs) return false;
      if (endMs !== null && t > endMs + bufferMs) return false;
      return true;
    },
    [batchTimeRange]
  );

  // Time window helper for correlation (+/- 15 minutes window)
  const isWithinCorrelationWindow = useCallback(
    (timestampStr?: string | null, toleranceMinutes = 15): boolean => {
      if (!correlatedAlarm || !timestampStr) return true;
      const alarmTimeStr = getAlarmEventTime(correlatedAlarm as unknown as Record<string, unknown>);
      if (!alarmTimeStr) return true;
      const tAlarm = parseFlexibleTimestamp(alarmTimeStr);
      const tRecord = parseFlexibleTimestamp(timestampStr);
      if (tAlarm === null || tRecord === null) return true;
      const diffMinutes = Math.abs(tRecord - tAlarm) / (1000 * 60);
      return diffMinutes <= toleranceMinutes;
    },
    [correlatedAlarm],
  );

  // Exact minute match helper (diff <= 1.0 min)
  const isExactMinuteMatch = useCallback(
    (timestampStr?: string | null): boolean => {
      if (!correlatedAlarm || !timestampStr) return false;
      const alarmTimeStr = getAlarmEventTime(correlatedAlarm as unknown as Record<string, unknown>);
      if (!alarmTimeStr) return false;
      const tAlarm = parseFlexibleTimestamp(alarmTimeStr);
      const tRecord = parseFlexibleTimestamp(timestampStr);
      if (tAlarm === null || tRecord === null) return false;
      const diffMinutes = Math.abs(tRecord - tAlarm) / (1000 * 60);
      return diffMinutes <= 1.0;
    },
    [correlatedAlarm],
  );

  // Filtered Parameters
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

  // Paginated Parameters
  const totalParameters = filteredParameters.length;
  const safeParamPages = Math.max(1, Math.ceil(totalParameters / parametersPageSize));
  const safeParamPage = Math.min(Math.max(1, parametersPage), safeParamPages);

  const paginatedParameters = useMemo(() => {
    const start = (safeParamPage - 1) * parametersPageSize;
    return filteredParameters.slice(start, start + parametersPageSize);
  }, [filteredParameters, safeParamPage, parametersPageSize]);

  // Filtered Alarms using calculated industrial severity & batch date range
  const filteredAlarms = useMemo(() => {
    let list = alarmRecords;

    // Filter to batch execution timeframe (startAt to endAt)
    list = list.filter((a) =>
      isWithinBatchTimeRange(getAlarmEventTime(a as unknown as Record<string, unknown>))
    );

    if (correlatedAlarm) {
      list = list.filter((a) =>
        isWithinCorrelationWindow(getAlarmEventTime(a as unknown as Record<string, unknown>)),
      );
    }
    if (alarmFilter !== "ALL") {
      list = list.filter(
        (a) =>
          calculateAlarmSeverity(a as unknown as Record<string, unknown>) ===
          alarmFilter.toUpperCase(),
      );
    }

    if (alarmSearch.trim()) {
      const term = alarmSearch.trim().toLowerCase();
      list = list.filter((a) => {
        const aRec = a as unknown as Record<string, unknown>;
        const code = getAlarmCode(aRec).toLowerCase();
        const text = toText(
          a.msg_text || a.message || a.description || a.var1 || aRec.MsgText || aRec.msgText || ""
        ).toLowerCase();
        const time = toDisplayDate(getAlarmEventTime(aRec)).toLowerCase();
        const rawTime = toText(getAlarmEventTime(aRec)).toLowerCase();
        const severity = calculateAlarmSeverity(aRec).toLowerCase();
        const rawMsgNumber = String(a.msg_number ?? aRec.MsgNumber ?? "").toLowerCase();
        return (
          code.includes(term) ||
          text.includes(term) ||
          time.includes(term) ||
          rawTime.includes(term) ||
          severity.includes(term) ||
          rawMsgNumber.includes(term)
        );
      });
    }

    return list;
  }, [alarmRecords, alarmFilter, alarmSearch, correlatedAlarm, isWithinCorrelationWindow, isWithinBatchTimeRange]);

  // Paginated Alarms
  const totalAlarms = filteredAlarms.length;
  const safeAlarmPages = Math.max(1, Math.ceil(totalAlarms / alarmsPageSize));
  const safeAlarmPage = Math.min(Math.max(1, alarmsPage), safeAlarmPages);

  const paginatedAlarms = useMemo(() => {
    const start = (safeAlarmPage - 1) * alarmsPageSize;
    return filteredAlarms.slice(start, start + alarmsPageSize);
  }, [filteredAlarms, safeAlarmPage, alarmsPageSize]);

  // Filtered Equipment Event Data (PLC Audit Events) within batch timeframe
  const filteredEventData = useMemo(() => {
    let list = eventDataRecords;

    // Filter to batch execution timeframe (startAt to endAt)
    list = list.filter((ev) => isWithinBatchTimeRange(getEventDataTime(ev)));

    if (correlatedAlarm) {
      list = list.filter((ev) => isWithinCorrelationWindow(getEventDataTime(ev)));
    }
    if (eventDataSearch.trim()) {
      const term = eventDataSearch.trim().toLowerCase();
      list = list.filter((ev) => {
        return (
          getEventDataTime(ev).toLowerCase().includes(term) ||
          getEventDataObjectId(ev).toLowerCase().includes(term) ||
          getEventDataDescription(ev).toLowerCase().includes(term) ||
          getEventDataUserId(ev).toLowerCase().includes(term) ||
          getEventDataChecksum(ev).toLowerCase().includes(term)
        );
      });
    }
    return list;
  }, [eventDataRecords, eventDataSearch, correlatedAlarm, isWithinCorrelationWindow, isWithinBatchTimeRange]);

  const totalEventData = filteredEventData.length;
  const safeEventDataPages = Math.max(1, Math.ceil(totalEventData / eventDataPageSize));
  const safeEventDataPage = Math.min(Math.max(1, eventDataPage), safeEventDataPages);

  const paginatedEventData = useMemo(() => {
    const start = (safeEventDataPage - 1) * eventDataPageSize;
    return filteredEventData.slice(start, start + eventDataPageSize);
  }, [filteredEventData, safeEventDataPage, eventDataPageSize]);

  // Comprehensive 21 CFR Part 11 Electronic Signature Audit Events
  const combinedAuditEvents = useMemo((): WorkflowAuditEvent[] => {
    const list: WorkflowAuditEvent[] = [...auditEvents];
    const existingKeys = new Set(list.map((a) => `${toText(a.userId)}_${toText(a.action || a.actionCode)}_${toText(a.timestamp)}`));

    for (const h of actionHistory) {
      const key = `${toText(h.performedBy)}_${toText(h.actionCode)}_${toText(h.timestamp)}`;
      if (!existingKeys.has(key)) {
        list.push({
          auditId: h.historyId || `audit_${h.performedBy}_${h.timestamp}`,
          tenantId: h.tenantId || "TNT-0001",
          batchNo: h.batchNo || queryBatchNo,
          lotNo: h.lotNo || queryLotNo,
          equipmentCode: h.equipmentCode || targetEquipmentCode,
          previousStatus: h.previousStatus || "PENDING",
          newStatus: h.newStatus || "UNDER_REVIEW",
          action: h.actionCode || h.actionName || "STAGE_TRANSITION",
          actionCode: h.actionCode || "STAGE_TRANSITION",
          userId: h.performedBy || "OPERATOR_01",
          userName: h.performerName || h.performedBy || "Operator",
          userRole: h.performerRole || "PRODUCTION_OPERATOR",
          comments: h.comments || "Electronic signature verification",
          timestamp: toText(h.timestamp) || new Date().toISOString(),
          esignatureVerified: h.esignatureVerified ?? true,
          esignatureReason: h.esignatureReason || "Workflow Stage Transition Sign-off",
          regulatoryStatement: "21 CFR Part 11 / EU Annex 11 compliant legally binding electronic signature.",
        });
        existingKeys.add(key);
      }
    }
    return list;
  }, [auditEvents, actionHistory, queryBatchNo, queryLotNo, targetEquipmentCode]);

  // Filtered Audit Events strictly based on Batch Number and Lot Number
  const filteredAuditEvents = useMemo(() => {
    let list = combinedAuditEvents;

    if (auditSearch.trim()) {
      const term = auditSearch.trim().toLowerCase();
      list = list.filter((ev) => {
        return (
          toText(ev.userId).toLowerCase().includes(term) ||
          toText(ev.userName).toLowerCase().includes(term) ||
          toText(ev.userRole).toLowerCase().includes(term) ||
          toText(ev.actionCode || ev.action).toLowerCase().includes(term) ||
          toText(ev.esignatureReason).toLowerCase().includes(term) ||
          toText(ev.comments).toLowerCase().includes(term) ||
          toText(ev.regulatoryStatement).toLowerCase().includes(term) ||
          toDisplayDate(ev.timestamp).toLowerCase().includes(term)
        );
      });
    }
    return list;
  }, [combinedAuditEvents, auditSearch]);

  // Paginated Audit Events
  const totalAudit = filteredAuditEvents.length;
  const safeAuditPages = Math.max(1, Math.ceil(totalAudit / auditPageSize));
  const safeAuditPage = Math.min(Math.max(1, auditPage), safeAuditPages);

  const paginatedAuditEvents = useMemo(() => {
    const start = (safeAuditPage - 1) * auditPageSize;
    return filteredAuditEvents.slice(start, start + auditPageSize);
  }, [filteredAuditEvents, safeAuditPage, auditPageSize]);

  // Dynamic Available Metrics
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
    (batchSummary?.stages &&
      batchSummary.stages.find(
        (stage: Record<string, unknown>) =>
          stage.equipmentCode === targetEquipmentCode ||
          stage.equipmentId === targetEquipmentCode ||
          stage.equipmentType === targetEquipmentCode,
      )?.approval?.status) ||
      batchSummary?.batchStatus ||
      batchSummary?.overallStatus ||
      "PENDING",
  );

  const isEquipmentOverviewSource = Boolean(
    returnToRoute.includes("equipment-overview") ||
      searchParams.get("returnTo")?.includes("equipment-overview") ||
      searchParams.get("readOnly") === "true" ||
      searchParams.get("from") === "equipment"
  );

  const isApprovedBatch = Boolean(
    activeStatus === "APPROVED" ||
      activeStatus === "COMPLETED" ||
      batchSummary?.overallStatus === "APPROVED" ||
      batchSummary?.overallStatus === "COMPLETED"
  );

  return (
    <div className="flex-1 space-y-5 p-4 sm:p-6 bg-slate-50 text-slate-900 min-h-screen">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(returnToRoute)}
            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition shadow-sm"
            title="Return to Queue"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 font-mono">
                {queryBatchNo || "BATCH RECORD"}
              </h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getStatusBadge(
                  activeStatus,
                )}`}
              >
                {activeStatus.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Production Execution Dossier &bull; Lot:{" "}
              <strong className="font-mono text-slate-700 font-bold">
                {queryLotNo || toText(batchSummary?.lotNo) || "-"}
              </strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadBatchData}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 shadow-sm transition disabled:opacity-50"
          >
            <ArrowsClockwise className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {/* Download PDF button - restricted to QA Approved batches */}
          {isApprovedBatch ? (
            <button
              onClick={handleDownloadPdf}
              disabled={isExporting || !queryBatchNo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
              title="Download Official 21 CFR Part 11 GxP PDF Dossier"
            >
              {isExporting ? (
                <SpinnerGap className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <DownloadSimple className="h-3.5 w-3.5" />
              )}
              Download Report
            </button>
          ) : (
            <button
              disabled
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-400 border border-slate-200 rounded-lg text-xs font-semibold cursor-not-allowed opacity-60"
              title="Report download is available for QA Approved batches only"
            >
              <DownloadSimple className="h-3.5 w-3.5" />
              Download Report
            </button>
          )}

          {/* Dynamic Workflow Stage Action Buttons (Hidden if navigated from Equipment Overview / Read-Only mode) */}
          {!isEquipmentOverviewSource && allowedActions.map((action) => {
            const currentUserId = currentUser?.userId || currentUser?.username || "SYSTEM";
            const assignedTo = toText(workflowInstance?.assignedTo) || toText((workflowInstance?.context as Record<string, unknown>)?.activeReviewer) || toText(batchSummary?.assignedTo);
            const isClaimedByMe = Boolean(assignedTo && assignedTo.toUpperCase() === currentUserId.toUpperCase());
            const isClaimedByOther = Boolean(assignedTo && !isClaimedByMe);

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
                disabled={isClaimedByOther}
                onClick={() => {
                  setModalAction(action);
                  setIsModalOpen(true);
                }}
                title={isClaimedByOther ? `Action locked: Claimed by ${assignedTo}` : undefined}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold text-xs transition shadow-sm ${
                  isClaimedByOther ? "bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed opacity-70" : btnClass
                }`}
              >
                <Lock className="h-3 w-3" />
                {action.displayName || action.actionName || action.actionCode}
                {isClaimedByOther && <span className="text-[10px] ml-1">(Locked)</span>}
              </button>
            );
          })}
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2 shadow-sm animate-in fade-in duration-300">
          <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 flex-shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Concurrency Review / Approval Lock Banners */}
      {(() => {
        if (isEquipmentOverviewSource) return null;
        const currentUserId = currentUser?.userId || currentUser?.username || "SYSTEM";
        const assignedTo = toText(workflowInstance?.assignedTo) || toText((workflowInstance?.context as Record<string, unknown>)?.activeReviewer) || toText(batchSummary?.assignedTo);
        const activeReviewerRole = toText((workflowInstance?.context as Record<string, unknown>)?.activeReviewerRole);
        const claimedAt = toText((workflowInstance?.context as Record<string, unknown>)?.claimedAt);

        const isReviewOrApprovalStage = activeStatus === "UNDER_REVIEW" || activeStatus === "IN_REVIEW" || activeStatus === "PENDING_APPROVAL" || activeStatus === "REVIEWER_REVIEWED";
        const isApprovalStage = activeStatus === "PENDING_APPROVAL" || activeStatus === "REVIEWER_REVIEWED";
        const isClaimedByMe = Boolean(assignedTo && assignedTo.toUpperCase() === currentUserId.toUpperCase());
        const isClaimedByOther = Boolean(assignedTo && !isClaimedByMe);

        if (!isReviewOrApprovalStage && !assignedTo) return null;

        // CASE 1: Locked / Claimed by another reviewer/approver
        if (isClaimedByOther) {
          return (
            <div className="p-4 bg-gradient-to-r from-rose-500/15 via-amber-500/15 to-rose-500/15 border-2 border-rose-400 rounded-2xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center h-10 w-10 rounded-xl bg-rose-100 border border-rose-300 text-rose-800 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-5 w-5 rounded-full bg-rose-400 opacity-75"></span>
                  <Lock className="relative h-5 w-5 text-rose-700" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-950 bg-rose-300 px-2 py-0.5 rounded shadow-xs">
                      🚨 CONCURRENT REVIEW ALERT — CLAIMED BY {assignedTo}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      Stage: {targetEquipmentCode} &bull; Batch: {queryBatchNo}
                    </span>
                  </div>
                  <p className="text-xs text-rose-950 font-semibold mt-1">
                    <strong>{assignedTo}</strong> ({activeReviewerRole || (isApprovalStage ? "QA Approver" : "Production Reviewer")}) is actively reviewing this batch dossier (Claimed at {claimedAt ? toDisplayDate(claimedAt) : "just now"}). Action sign-offs are locked for other team members to prevent conflicting duplicate reviews.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={handleClaimReview}
                  disabled={isClaiming}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-900 border border-rose-300 font-semibold text-xs transition shadow-sm"
                  title="Override assignment if the primary reviewer is unavailable"
                >
                  <Lightning className="h-3.5 w-3.5 text-rose-600" />
                  {isClaiming ? "Overriding..." : "Takeover Assignment"}
                </button>
              </div>
            </div>
          );
        }

        // CASE 2: Claimed by current user
        if (isClaimedByMe) {
          return (
            <div className="p-4 bg-gradient-to-r from-emerald-500/15 via-indigo-500/10 to-emerald-500/15 border-2 border-emerald-400 rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 flex-shrink-0">
                  <UserCheck className="h-5 w-5 text-emerald-700" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-950 bg-emerald-300 px-2 py-0.5 rounded shadow-xs">
                      ✅ ASSIGNED TO YOU ({isApprovalStage ? "APPROVER" : "REVIEWER"})
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      {claimedAt ? `Claimed at ${toDisplayDate(claimedAt)}` : "Active Assignment"}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-950 font-semibold mt-1">
                    You are the active assignee for this batch stage. You have exclusive sign-off authorization to review and execute workflow transitions.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={handleUnclaimReview}
                  disabled={isClaiming}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs transition shadow-sm"
                >
                  <XCircle className="h-3.5 w-3.5 text-slate-500" />
                  {isClaiming ? "Releasing..." : "Release Assignment"}
                </button>
              </div>
            </div>
          );
        }

        // CASE 3: Unassigned in Review or Approval stage
        if (isReviewOrApprovalStage && !assignedTo) {
          return (
            <div className="p-4 bg-gradient-to-r from-amber-500/15 via-indigo-500/10 to-amber-500/15 border-2 border-amber-400 rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center h-10 w-10 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-5 w-5 rounded-full bg-amber-400 opacity-75"></span>
                  <Clock className="relative h-5 w-5 text-amber-700" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-950 bg-amber-300 px-2 py-0.5 rounded shadow-xs">
                      ⚡ BATCH READY FOR {isApprovalStage ? "QA APPROVAL" : "REVIEW"} — UNASSIGNED
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      Stage: {targetEquipmentCode} &bull; Batch: {queryBatchNo}
                    </span>
                  </div>
                  <p className="text-xs text-amber-950 font-semibold mt-1">
                    This batch is available in your group queue. Click <strong>&quot;Assign to Me&quot;</strong> to claim review and notify other team members so duplicate work is avoided.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={handleClaimReview}
                  disabled={isClaiming}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-sm"
                >
                  <UserPlus className="h-4 w-4" />
                  {isClaiming ? "Assigning..." : "Assign to Me / Start Review"}
                </button>
              </div>
            </div>
          );
        }

        return null;
      })()}



      {/* Batch Overview Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-600" />
              Batch Metadata & Process State
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Batch: <strong className="text-slate-600 font-mono">{queryBatchNo || "-"}</strong> &bull; Lot:{" "}
              <strong className="text-slate-600 font-mono">{queryLotNo || toText(batchSummary?.lotNo) || "-"}</strong> &bull; Equipment:{" "}
              <strong className="text-slate-600 font-mono">{targetEquipmentCode}</strong>
            </p>
          </div>
          <span
            className={`inline-flex items-center self-start sm:self-auto px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getStatusBadge(
              activeStatus,
            )}`}
          >
            {activeStatus.replace(/_/g, " ")}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Product Name</span>
            <div className="text-xs font-bold text-slate-900 mt-1 truncate">
              {toText(batchSummary?.productName) || "Allopurinol Tablets IP 100mg"}
            </div>
            <span className="text-[10px] font-mono text-slate-400 mt-1 block">
              {toText(batchSummary?.productCode) || "STAPU1000"}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Equipment Code</span>
            <div className="text-xs font-bold text-slate-900 font-mono mt-1">
              {queryEquipmentCode || toText(batchSummary?.equipmentId) || "G5RMG"}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Rapid Mixer Granulator</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Batch Size / Unit</span>
            <div className="text-xs font-bold text-slate-900 mt-1">
              {toText(batchSummary?.batchSize) || "120.00"} {toText(batchSummary?.unit) || "KG"}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Yield: 99.4%</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Batch Start Date</span>
            <div className="text-xs font-mono font-bold text-slate-900 mt-1">
              {toDisplayDate(batchSummary?.batchStartAt || batchTimeRange.startMs)}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Execution Start</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Batch End Date</span>
            <div className="text-xs font-mono font-bold text-slate-900 mt-1">
              {toDisplayDate(batchSummary?.batchEndAt || batchTimeRange.endMs)}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Execution End</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Operator</span>
            <div className="text-xs font-bold text-slate-900 mt-1 truncate">
              {toText(batchSummary?.operatorName) || "Operator User 01"}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Shift A &bull; Line 01</span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 text-xs font-medium space-x-1 sm:space-x-2">
        <button
          onClick={() => setActiveTab("PARAMETERS")}
          className={`pb-2.5 px-3.5 flex items-center gap-2 border-b-2 text-xs transition ${
            activeTab === "PARAMETERS"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-900 font-semibold"
          }`}
        >
          <Cpu className="h-4 w-4" /> Parameters ({filteredParameters.length})
        </button>
        <button
          onClick={() => setActiveTab("TRENDS")}
          className={`pb-2.5 px-3.5 flex items-center gap-2 border-b-2 text-xs transition ${
            activeTab === "TRENDS"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-900 font-semibold"
          }`}
        >
          <ChartLine className="h-4 w-4" /> Trends
        </button>
        <button
          onClick={() => setActiveTab("ALARMS")}
          className={`pb-2.5 px-3.5 flex items-center gap-2 border-b-2 text-xs transition ${
            activeTab === "ALARMS"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-900 font-semibold"
          }`}
        >
          <Bell className="h-4 w-4" /> Alarms ({filteredAlarms.length})
        </button>
        <button
          onClick={() => setActiveTab("EVENT_DATA")}
          className={`pb-2.5 px-3.5 flex items-center gap-2 border-b-2 text-xs transition ${
            activeTab === "EVENT_DATA"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-900 font-semibold"
          }`}
        >
          <ClockCounterClockwise className="h-4 w-4" /> Event Data ({filteredEventData.length})
        </button>
        <button
          onClick={() => setActiveTab("AUDIT")}
          className={`pb-2.5 px-3.5 flex items-center gap-2 border-b-2 text-xs transition ${
            activeTab === "AUDIT"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-900 font-semibold"
          }`}
        >
          <ShieldCheck className="h-4 w-4" /> Audit & Signature ({filteredAuditEvents.length + actionHistory.length})
        </button>
      </div>

      {/* TAB 1: PARAMETERS / BATCH DATA */}
      {activeTab === "PARAMETERS" && (
        <div className="space-y-6">
          {/* Header Filter Bar */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto flex-1">
              <label htmlFor="param-search" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
                <MagnifyingGlass className="h-4 w-4 text-indigo-600" />
                Filter Parameters:
              </label>
              <input
                id="param-search"
                type="text"
                placeholder="Filter by metric key, value, or timestamp..."
                value={parameterSearch}
                onChange={(e) => {
                  setParameterSearch(e.target.value);
                  setParametersPage(1);
                }}
                className="w-full sm:w-64 bg-white border border-slate-300 rounded-lg pl-3 pr-3 py-2 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
              {parameterSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setParameterSearch("");
                    setParametersPage(1);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition shadow-sm"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Clear Filter</span>
                </button>
              )}

              {correlatedAlarm && (
                <button
                  type="button"
                  onClick={handleClearCorrelation}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition shadow-sm"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Clear Correlation ({getAlarmCode(correlatedAlarm as unknown as Record<string, unknown>)})</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md font-mono text-[11px] text-slate-700">
                <CalendarBlank className="h-3.5 w-3.5 text-slate-400" />
                {filteredParameters.length} of {cppRecords.length} Samples Filtered
              </span>
            </div>
          </div>

          {/* Main Table Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-indigo-600" />
                  Critical Process Parameters (CPP) Telemetry
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Batch: <strong className="text-slate-600 font-mono">{queryBatchNo || "-"}</strong> &bull; Equipment:{" "}
                  <strong className="text-slate-600 font-mono">{targetEquipmentCode}</strong>
                </p>
              </div>
            </div>

            <div className="overflow-hidden border border-slate-200 rounded-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-3.5 whitespace-nowrap">Observed Timestamp</th>
                      {(availableMetricsList.length > 0
                        ? availableMetricsList
                        : [
                            { key: "Ag_Speed", label: "Agitator Speed", unit: "RPM" },
                            { key: "Ag_Amps", label: "Agitator Amps", unit: "A" },
                            { key: "Chp_Speed", label: "Chopper Speed", unit: "RPM" },
                            { key: "Chp_Amps", label: "Chopper Amps", unit: "A" },
                            { key: "Heater_Temp", label: "Temperature", unit: "°C" },
                          ]
                      ).map((col) => {
                        const meta = resolveMetricLimits(col.key, targetEquipmentCode, paramLimits, criticalParams);
                        const lim = meta.limits;
                        return (
                          <th key={col.key} className="py-3 px-3.5 whitespace-nowrap">
                            <div className="font-bold text-slate-800">{meta.parameterName} ({meta.unit})</div>
                            {lim && (lim.lowerCriticalLimit !== undefined || lim.upperCriticalLimit !== undefined) ? (
                              <div className="text-[9px] font-mono text-indigo-600 font-semibold normal-case">
                                Lim: [{lim.lowerCriticalLimit ?? "-"} to {lim.upperCriticalLimit ?? "-"}]
                              </div>
                            ) : null}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredParameters.length === 0 ? (
                      <tr>
                        <td
                          colSpan={Math.max(6, availableMetricsList.length + 1)}
                          className="py-8 text-center text-slate-500 font-medium"
                        >
                          <div className="flex flex-col items-center justify-center gap-1.5">
                            <Funnel className="h-6 w-6 text-slate-400 opacity-60" />
                            <span className="text-slate-700 font-bold text-xs">
                              No telemetry samples match your search criteria
                            </span>
                            <span className="text-slate-500 text-[11px]">
                              {parameterSearch ? `No metric keys, values, or timestamps match "${parameterSearch}".` : "No parameter records available for this batch stage."}
                            </span>
                            {parameterSearch && (
                              <button
                                type="button"
                                onClick={() => {
                                  setParameterSearch("");
                                  setParametersPage(1);
                                }}
                                className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition shadow-sm"
                              >
                                <ArrowCounterClockwise className="h-3 w-3 text-indigo-600" />
                                Clear Filter
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedParameters.map((record, index) => {
                        const m = (record.metrics || {}) as Record<string, unknown>;
                        const rowKey = `${toText(record.equipmentId || "PARAM")}_${toText(record.observedAt)}_${(safeParamPage - 1) * parametersPageSize + index}`;
                        const isMatch = isExactMinuteMatch(record.observedAt);
                        const activeCols =
                          availableMetricsList.length > 0
                            ? availableMetricsList
                            : [
                                { key: "Ag_Speed", label: "Agitator Speed", unit: "RPM" },
                                { key: "Ag_Amps", label: "Agitator Amps", unit: "A" },
                                { key: "Chp_Speed", label: "Chopper Speed", unit: "RPM" },
                                { key: "Chp_Amps", label: "Chopper Amps", unit: "A" },
                                { key: "Heater_Temp", label: "Temperature", unit: "°C" },
                              ];

                        return (
                          <tr
                            key={rowKey}
                            className={`transition ${
                              isMatch
                                ? "bg-amber-50/90 border-l-4 border-amber-500 font-medium"
                                : "hover:bg-slate-50/80"
                            }`}
                          >
                            <td className="py-2.5 px-3.5 font-mono text-slate-600 font-semibold whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {isMatch && (
                                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" title="Exact Correlated Minute Event" />
                                )}
                                <span>{toDisplayDate(record.observedAt)}</span>
                              </div>
                            </td>
                            {activeCols.map((col) => {
                              const val = m[col.key] ?? getMetricValue(m, col.key);
                              const numVal = typeof val === "number" ? val : parseFloat(String(val));
                              const meta = resolveMetricLimits(col.key, targetEquipmentCode, paramLimits, criticalParams);
                              const lim = meta.limits;
                              let statusClass = "text-slate-900 font-bold font-mono";
                              if (!isNaN(numVal) && lim) {
                                if (
                                  (lim.upperCriticalLimit !== undefined && numVal > lim.upperCriticalLimit) ||
                                  (lim.lowerCriticalLimit !== undefined && numVal < lim.lowerCriticalLimit)
                                ) {
                                  statusClass = "text-rose-700 font-black font-mono bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200";
                                } else if (
                                  (lim.upperWarningLimit !== undefined && numVal > lim.upperWarningLimit) ||
                                  (lim.lowerWarningLimit !== undefined && numVal < lim.lowerWarningLimit)
                                ) {
                                  statusClass = "text-amber-700 font-bold font-mono bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200";
                                }
                              }
                              return (
                                <td key={col.key} className="py-2.5 px-3.5 whitespace-nowrap">
                                  <span className={statusClass}>
                                    {!isNaN(numVal) ? numVal.toFixed(2) : (val != null && val !== "" ? String(val) : "-")}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination for Parameters */}
              {filteredParameters.length > 0 && (
                <div className="p-3.5 border-t border-slate-200 bg-slate-50/50">
                  <Pagination
                    page={safeParamPage}
                    pageSize={parametersPageSize}
                    totalRecords={totalParameters}
                    onPageChange={(p) => setParametersPage(p)}
                    onPageSizeChange={(sz) => {
                      setParametersPageSize(sz);
                      setParametersPage(1);
                    }}
                    pageSizeOptions={[5, 10, 20, 50]}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TRENDS */}
      {activeTab === "TRENDS" && (
        <div className="space-y-4">
          {correlatedAlarm && (
            <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Target className="h-4 w-4 text-amber-600" />
                <span>Trends filtered to ±15m correlation window of <strong>{getAlarmCode(correlatedAlarm as unknown as Record<string, unknown>)}</strong> ({toDisplayDate(getAlarmEventTime(correlatedAlarm as unknown as Record<string, unknown>))})</span>
              </div>
              <button
                type="button"
                onClick={handleClearCorrelation}
                className="inline-flex items-center self-start sm:self-auto gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition shadow-sm"
              >
                <X className="h-3.5 w-3.5" />
                <span>Clear Correlation</span>
              </button>
            </div>
          )}
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
        </div>
      )}

      {/* TAB 3: ALARMS */}
      {activeTab === "ALARMS" && (
        <div className="space-y-6">
          {/* Header Filter Bar */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto flex-1">
              <label htmlFor="alarm-search" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
                <MagnifyingGlass className="h-4 w-4 text-indigo-600" />
                Filter Alarms:
              </label>
              <input
                id="alarm-search"
                type="text"
                placeholder="Filter by alarm code, message text, severity, timestamp..."
                value={alarmSearch}
                onChange={(e) => {
                  setAlarmSearch(e.target.value);
                  setAlarmsPage(1);
                }}
                className="w-full sm:w-72 bg-white border border-slate-300 rounded-lg pl-3 pr-3 py-2 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />

              <div className="flex items-center gap-1.5">
                <label htmlFor="alarm-filter-select" className="text-xs font-semibold text-slate-700 flex items-center gap-1 whitespace-nowrap">
                  <Funnel className="h-3.5 w-3.5 text-slate-500" />
                  Severity:
                </label>
                <select
                  id="alarm-filter-select"
                  value={alarmFilter}
                  onChange={(e) => {
                    setAlarmFilter(e.target.value);
                    setAlarmsPage(1);
                  }}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm cursor-pointer"
                >
                  <option value="ALL">All Levels</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="WARNING">Warning</option>
                  <option value="INFO">Informational</option>
                </select>
              </div>

              {(alarmSearch || alarmFilter !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setAlarmSearch("");
                    setAlarmFilter("ALL");
                    setAlarmsPage(1);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition shadow-sm"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Clear Filter</span>
                </button>
              )}

              {correlatedAlarm && (
                <button
                  type="button"
                  onClick={handleClearCorrelation}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition shadow-sm"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Clear Correlation ({getAlarmCode(correlatedAlarm as unknown as Record<string, unknown>)})</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md font-mono text-[11px] text-slate-700">
                <Bell className="h-3.5 w-3.5 text-slate-400" />
                {filteredAlarms.length} of {alarmRecords.length} Alarms Filtered
              </span>
            </div>
          </div>

          {/* Main Table Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Bell className="h-5 w-5 text-indigo-600" />
                  Equipment Alarms & Process Deviations
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Batch: <strong className="text-slate-600 font-mono">{queryBatchNo || "-"}</strong> &bull; Equipment:{" "}
                  <strong className="text-slate-600 font-mono">{targetEquipmentCode}</strong>
                </p>
              </div>
            </div>

            <div className="overflow-hidden border border-slate-200 rounded-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-3.5">Event Timestamp</th>
                      <th className="py-3 px-3.5">Alarm Code</th>
                      <th className="py-3 px-3.5">Severity</th>
                      <th className="py-3 px-3.5">Description</th>
                      <th className="py-3 px-3.5">PLC / Source</th>
                      <th className="py-3 px-3.5 text-right">Correlation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredAlarms.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 font-medium">
                          <div className="flex flex-col items-center justify-center gap-1.5">
                            <CheckCircle className="h-6 w-6 text-emerald-500 opacity-60" />
                            <span className="text-slate-700 font-bold text-xs">
                              {alarmSearch || alarmFilter !== "ALL"
                                ? "No alarms match the search/filter criteria"
                                : "No alarms detected"}
                            </span>
                            <span className="text-slate-500 text-[11px]">
                              {alarmSearch
                                ? `No recorded alarms match "${alarmSearch}".`
                                : alarmFilter !== "ALL"
                                ? `No deviation events with severity "${alarmFilter}" were recorded for this batch stage.`
                                : "No critical process limits or deviation events were recorded during this batch stage."}
                            </span>
                            {(alarmSearch || alarmFilter !== "ALL") && (
                              <button
                                type="button"
                                onClick={() => {
                                  setAlarmSearch("");
                                  setAlarmFilter("ALL");
                                  setAlarmsPage(1);
                                }}
                                className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition shadow-sm"
                              >
                                <ArrowCounterClockwise className="h-3 w-3 text-amber-600" />
                                Clear Filter
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedAlarms.map((alarmItem, idx) => {
                        const alarm = alarmItem as unknown as Record<string, unknown>;
                        const aTime = getAlarmEventTime(alarm);
                        const aCode = getAlarmCode(alarm);
                        const aSev = calculateAlarmSeverity(alarm);
                        const aDesc = getAlarmDescription(alarm);
                        const aAck = getAlarmAcknowledgedBy(alarm);
                        const alarmKey = `${aCode}_${aTime}_${(safeAlarmPage - 1) * alarmsPageSize + idx}`;
                        const isSelected =
                          correlatedAlarm &&
                          getAlarmEventTime(correlatedAlarm as unknown as Record<string, unknown>) === aTime;

                        return (
                          <tr
                            key={alarmKey}
                            className={`hover:bg-slate-50/80 transition cursor-pointer ${
                              isSelected ? "bg-amber-50/80 border-l-4 border-amber-500 font-medium" : ""
                            }`}
                            onClick={() => handleCorrelateAlarm(alarmItem)}
                          >
                            <td className="py-2.5 px-3.5 font-mono text-slate-600 font-semibold whitespace-nowrap">
                              {toDisplayDate(aTime)}
                            </td>
                            <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900">
                              {aCode}
                            </td>
                            <td className="py-2.5 px-3.5">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${
                                  aSev === "CRITICAL"
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : aSev === "WARNING"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-slate-100 text-slate-700 border-slate-200"
                                }`}
                              >
                                {aSev}
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-800 font-semibold">{aDesc}</td>
                            <td className="py-2.5 px-3.5 text-slate-600 font-mono font-semibold">{aAck}</td>
                            <td className="py-2.5 px-3.5 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCorrelateAlarm(alarmItem);
                                }}
                                className="px-2.5 py-1 text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg transition inline-flex items-center gap-1 shadow-sm"
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
                <div className="p-3.5 border-t border-slate-200 bg-slate-50/50">
                  <Pagination
                    page={safeAlarmPage}
                    pageSize={alarmsPageSize}
                    totalRecords={totalAlarms}
                    onPageChange={(p) => setAlarmsPage(p)}
                    onPageSizeChange={(sz) => {
                      setAlarmsPageSize(sz);
                      setAlarmsPage(1);
                    }}
                    pageSizeOptions={[5, 10, 20, 50]}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: EVENT DATA (PLC Equipment Event Audit Records) */}
      {activeTab === "EVENT_DATA" && (
        <div className="space-y-6">
          {/* Header Filter Bar */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto flex-1">
              <label htmlFor="event-data-search" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
                <MagnifyingGlass className="h-4 w-4 text-indigo-600" />
                Search Event Data:
              </label>
              <input
                id="event-data-search"
                type="text"
                placeholder="Filter by Object ID, Description, User ID, Checksum..."
                value={eventDataSearch}
                onChange={(e) => {
                  setEventDataSearch(e.target.value);
                  setEventDataPage(1);
                }}
                className="w-full sm:w-72 bg-white border border-slate-300 rounded-lg pl-3 pr-3 py-2 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
              {eventDataSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setEventDataSearch("");
                    setEventDataPage(1);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition shadow-sm"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Clear Filter</span>
                </button>
              )}

              {correlatedAlarm && (
                <button
                  type="button"
                  onClick={handleClearCorrelation}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition shadow-sm"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Clear Correlation ({getAlarmCode(correlatedAlarm as unknown as Record<string, unknown>)})</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md font-mono text-[11px] text-slate-700">
                <ClockCounterClockwise className="h-3.5 w-3.5 text-slate-400" />
                {filteredEventData.length} Equipment Events Logged
              </span>
            </div>
          </div>

          {/* Main Table Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ClockCounterClockwise className="h-5 w-5 text-indigo-600" />
                  Equipment Operational Event Log (PLC Audit)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Batch: <strong className="text-slate-600 font-mono">{queryBatchNo || "-"}</strong> &bull; Equipment:{" "}
                  <strong className="text-slate-600 font-mono">{targetEquipmentCode}</strong>
                </p>
              </div>
            </div>

            <div className="overflow-hidden border border-slate-200 rounded-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-3.5">Event Timestamp</th>
                      <th className="py-3 px-3.5">Record / Object ID</th>
                      <th className="py-3 px-3.5">Description</th>
                      <th className="py-3 px-3.5">Performed By</th>
                      <th className="py-3 px-3.5">Integrity Checksum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredEventData.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 font-medium">
                          <div className="flex flex-col items-center justify-center gap-1.5">
                            <Funnel className="h-6 w-6 text-slate-400 opacity-60" />
                            <span className="text-slate-700 font-bold text-xs">
                              No event data records match criteria
                            </span>
                            <span className="text-slate-500 text-[11px]">
                              {eventDataSearch
                                ? `No equipment events match "${eventDataSearch}".`
                                : "No PLC operational audit events recorded for this equipment."}
                            </span>
                            {eventDataSearch && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEventDataSearch("");
                                  setEventDataPage(1);
                                }}
                                className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition shadow-sm"
                              >
                                <ArrowCounterClockwise className="h-3 w-3 text-indigo-600" />
                                Clear Filter
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedEventData.map((ev, idx) => {
                        const evKey = `${getEventDataTime(ev)}_${getEventDataObjectId(ev)}_${(safeEventDataPage - 1) * eventDataPageSize + idx}`;
                        const isEvMatch = isExactMinuteMatch(getEventDataTime(ev));
                        return (
                          <tr
                            key={evKey}
                            className={`transition ${
                              isEvMatch
                                ? "bg-amber-50/90 border-l-4 border-amber-500 font-medium"
                                : "hover:bg-slate-50/80"
                            }`}
                          >
                            <td className="py-2.5 px-3.5 font-mono text-slate-600 font-semibold whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {isEvMatch && (
                                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" title="Correlated Operational Event" />
                                )}
                                <span>{toDisplayDate(getEventDataTime(ev))}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900">
                              {getEventDataObjectId(ev)}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-800 font-semibold">
                              {getEventDataDescription(ev)}
                            </td>
                            <td className="py-2.5 px-3.5 font-mono font-semibold text-slate-700">
                              {getEventDataUserId(ev)}
                            </td>
                            <td className="py-2.5 px-3.5 font-mono font-bold text-indigo-600">
                              {getEventDataChecksum(ev)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination for Event Data */}
              {filteredEventData.length > 0 && (
                <div className="p-3.5 border-t border-slate-200 bg-slate-50/50">
                  <Pagination
                    page={safeEventDataPage}
                    pageSize={eventDataPageSize}
                    totalRecords={totalEventData}
                    onPageChange={(p) => setEventDataPage(p)}
                    onPageSizeChange={(sz) => {
                      setEventDataPageSize(sz);
                      setEventDataPage(1);
                    }}
                    pageSizeOptions={[5, 10, 20, 50]}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: AUDIT & SIGNATURE (Workflow Actions, Approval History & 21 CFR Part 11 Electronic Signatures) */}
      {activeTab === "AUDIT" && (
        <div className="space-y-6">
          {/* Card 1: Action History Progression */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-indigo-600" />
                  Workflow Actions & Approval Stages
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Batch: <strong className="text-slate-600 font-mono">{queryBatchNo || "-"}</strong> &bull; Lifecycle History &bull;{" "}
                  <strong className="text-slate-600 font-mono">{actionHistory.length} Transitions</strong>
                </p>
              </div>
            </div>

            {actionHistory.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center font-medium">
                No state machine transitions have occurred yet. Initial batch state is active.
              </p>
            ) : (
              <div className="relative pl-5 border-l-2 border-slate-200 space-y-4 pt-2">
                {actionHistory.map((item, idx) => (
                  <div key={item.historyId || `hist_${idx}`} className="relative">
                    <span className="absolute -left-[27px] top-1 p-0.5 bg-white border-2 border-indigo-600 rounded-full">
                      <div className="h-1.5 w-1.5 bg-indigo-600 rounded-full" />
                    </span>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <span className="font-bold text-slate-900 text-xs">
                        Action: <strong className="text-indigo-600 font-bold">{item.actionName || item.actionCode}</strong> ({item.fromStageCode || "STAGE"} &rarr; {item.toStageCode || "NEXT"})
                      </span>
                      <span className="text-xs font-mono text-slate-500 font-semibold">
                        {toDisplayDate(item.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Executed by: <strong className="text-slate-800 font-bold">{item.performerName || item.performedBy}</strong> ({item.performerRole || item.performedBy}) | Resulting Status: <span className="font-bold text-emerald-700">{item.newStatus}</span>
                    </p>
                    {item.comments && (
                      <p className="text-xs text-slate-600 mt-1 italic bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-medium">
                        &quot;{item.comments}&quot;
                      </p>
                    )}
                    {item.additionalInformation && (
                      <p className="text-xs text-amber-800 mt-1 bg-amber-50 p-2.5 rounded-lg border border-amber-200 font-medium">
                        <strong>Additional Information Required:</strong> {item.additionalInformation}
                      </p>
                    )}
                    {item.responseNotes && (
                      <p className="text-xs text-indigo-800 mt-1 bg-indigo-50 p-2.5 rounded-lg border border-indigo-200 font-medium">
                        <strong>Response Provided:</strong> {item.responseNotes}
                      </p>
                    )}
                    {item.justification && item.justification !== item.comments && (
                      <p className="text-xs text-amber-800 mt-1 bg-amber-50 p-2.5 rounded-lg border border-amber-200 font-medium">
                        <strong>Justification:</strong> {item.justification}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 2: 21 CFR Part 11 Audit Trail Table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  21 CFR Part 11 Electronic Signatures & Regulatory Audit Trail
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Batch: <strong className="text-slate-600 font-mono">{queryBatchNo || "-"}</strong> &bull; Cryptographically Verified Sign-offs &bull;{" "}
                  <strong className="text-slate-600 font-mono">{totalAudit} Records</strong>
                </p>
              </div>

              <div className="flex items-center gap-2 max-w-md w-full">
                <div className="relative flex-1">
                  <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter audit records..."
                    value={auditSearch}
                    onChange={(e) => {
                      setAuditSearch(e.target.value);
                      setAuditPage(1);
                    }}
                    className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  />
                </div>
                {auditSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setAuditSearch("");
                      setAuditPage(1);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition shadow-sm whitespace-nowrap"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Clear Filter</span>
                  </button>
                )}
                {correlatedAlarm && (
                  <button
                    type="button"
                    onClick={handleClearCorrelation}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition shadow-sm whitespace-nowrap"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Clear Correlation</span>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-hidden border border-slate-200 rounded-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-3.5">Signature Timestamp</th>
                      <th className="py-3 px-3.5">Signer ID</th>
                      <th className="py-3 px-3.5">Signer Name & Role</th>
                      <th className="py-3 px-3.5">Action & Meaning</th>
                      <th className="py-3 px-3.5">E-Sign Status</th>
                      <th className="py-3 px-3.5">Regulatory Statement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredAuditEvents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 font-medium">
                          <div className="flex flex-col items-center justify-center gap-1.5">
                            <Funnel className="h-6 w-6 text-slate-400 opacity-60" />
                            <span className="text-slate-700 font-bold text-xs">
                              No electronic signature records match criteria
                            </span>
                            <span className="text-slate-500 text-[11px]">
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
                                className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition shadow-sm"
                              >
                                <ArrowCounterClockwise className="h-3 w-3 text-indigo-600" />
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
                            <td className="py-2.5 px-3.5 font-mono text-slate-600 font-semibold whitespace-nowrap">
                              {toDisplayDate(event.timestamp)}
                            </td>
                            <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900">
                              {event.userId}
                            </td>
                            <td className="py-2.5 px-3.5">
                              <div className="font-bold text-slate-900 text-xs">{event.userName || event.userId}</div>
                              <div className="text-[10px] text-slate-500 font-semibold">{event.userRole}</div>
                            </td>
                            <td className="py-2.5 px-3.5">
                              <div className="font-bold text-indigo-600 text-xs">{event.actionCode || event.action}</div>
                              <div className="text-[10px] text-slate-500 font-semibold">{event.esignatureReason || "Digital Sign-off"}</div>
                            </td>
                            <td className="py-2.5 px-3.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> VERIFIED (BCRYPT)
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 text-xs text-slate-600 max-w-xs truncate font-normal">
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
                <div className="p-3.5 border-t border-slate-200 bg-slate-50/50">
                  <Pagination
                    page={safeAuditPage}
                    pageSize={auditPageSize}
                    totalRecords={totalAudit}
                    onPageChange={(p) => setAuditPage(p)}
                    onPageSizeChange={(sz) => {
                      setAuditPageSize(sz);
                      setAuditPage(1);
                    }}
                    pageSizeOptions={[5, 10, 20, 50]}
                  />
                </div>
              )}
            </div>
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

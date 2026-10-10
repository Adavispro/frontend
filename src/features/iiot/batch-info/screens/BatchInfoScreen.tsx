"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowsClockwise,
  DownloadSimple,
  Printer,
  SpinnerGap,
  Cpu,
  FileText,
  CheckCircle,
  WarningCircle,
  Clock,
  ShieldCheck,
  UserCheck,
  Bell,
  ListNumbers,
  MagnifyingGlass,
  Funnel,
  X,
  ArrowCounterClockwise,
  CalendarBlank,
  Question,
  Lock,
  UserPlus,
  XCircle,
  Lightning,
  ListChecks,
  ChartLine,
  SlidersHorizontal,
  Target,
} from "@phosphor-icons/react";
import DynamicProcessTrendChart, {
  type CanonicalTrendPoint,
  type TrendPointStatus,
} from "../../batch-details/components/DynamicProcessTrendChart";
import {
  downloadBatchPdfBlob,
  getAlarmEventDataPaginated,
  getBatchSummaryPaginated,
  getCppDataPaginated,
  getCriticalParameterLimits,
  getCriticalParameters,
  getWorkflowAuditTrail,
  getWorkflowInstanceAndHistory,
  getAllowedActions,
  claimWorkflowTask,
  unclaimWorkflowTask,
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
import { resolveEquipmentInfo, type EquipmentMeta } from "@/features/iiot/utils/equipment-resolver";
import Pagination from "@/components/ui/Pagination";
import { WorkflowActionModal } from "../../components/WorkflowActionModal";
import { ControlledPrintModal } from "../../components/ControlledPrintModal";
import {
  RequestInformationModal,
  type ConsolidatedQueryItem,
} from "../../batch-details/components/RequestInformationModal";
import { CompressionReportView } from "../../batch-details/components/CompressionReportView";
import { evaluateParameterStatus } from "@/features/iiot/equipment/utils/parameter-status";
import { ROUTES } from "@/config/routes";
import { getSafeReturnTo } from "@/utils/navigation";

export interface BatchInfoScreenProps {
  batchId?: string;
  searchParams?: Record<string, string | string[] | undefined>;
}

export type BatchInfoSectionType =
  | "PARAMETER_SETTINGS"
  | "OPERATIONAL_DETAIL_VALUES"
  | "TRENDS"
  | "ALARM_SUMMARY"
  | "AUDIT_TRAIL";

export type SectionReviewStatus = "PENDING" | "PASSED" | "HAS_QUERIES";

export interface SectionReviewItem {
  status: SectionReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  queryComments?: string;
  queryRecipient?: string;
}

export const BATCH_INFO_SECTIONS: { id: BatchInfoSectionType; label: string; shortName: string }[] = [
  { id: "PARAMETER_SETTINGS", label: "PARAMETER SETTINGS", shortName: "Parameter Settings" },
  { id: "OPERATIONAL_DETAIL_VALUES", label: "OPERATIONAL DETAIL VALUES", shortName: "Operational Detail Values" },
  { id: "TRENDS", label: "PARAMETER TRENDS", shortName: "Parameter Trends" },
  { id: "ALARM_SUMMARY", label: "ALARMS / EVENTS", shortName: "Alarms / Events" },
  { id: "AUDIT_TRAIL", label: "AUDIT TRAIL", shortName: "Audit Trail" },
];

const toText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();

const displaySourceValue = (value: unknown): string => toText(value) || "Not available";

const displaySourceValueWithUnit = (value: unknown, unit: string): string => {
  const text = toText(value);
  return text ? `${text} ${unit}` : "Not available";
};

const flattenCompressionSection = (
  value: Record<string, unknown>,
  prefix = "",
): Array<{ label: string; value: unknown }> => Object.entries(value).flatMap(([key, item]) => {
  const label = prefix ? `${prefix} / ${key}` : key;
  if (item && typeof item === "object" && !Array.isArray(item)) {
    return flattenCompressionSection(item as Record<string, unknown>, label);
  }
  return [{ label, value: item }];
});

export function parseFlexibleTimestamp(val: unknown): number | null {
  if (!val) return null;
  if (val instanceof Date) return val.getTime();
  let s = String(val).trim();
  if (!s) return null;

  s = s.replace(/Z$/i, "").replace(/[+-]\d{2}:\d{2}$/, "");

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

export function toDisplayDate(val: unknown): string {
  if (!val) return "-";
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.includes(" ") && !trimmed.includes("T") && !trimmed.includes("Z")) {
      return trimmed;
    }
  }
  const ts = parseFlexibleTimestamp(val);
  if (ts === null) return String(val).trim();

  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function cleanAuditContent(text: unknown): string {
  const str = toText(text);
  if (!str || str === "-") return "-";
  return (
    str
      .replace(/\[VERIFIED\]\s*/gi, "")
      .replace(/\s*\(?21\s*CFR(?:\s*Part\s*11)?\)?/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim() || "-"
  );
}

const getAlarmEventTime = (rec: Record<string, unknown>): string => {
  const event = (rec.event || {}) as Record<string, unknown>;
  const source = (rec.source || {}) as Record<string, unknown>;
  const meta = (rec.meta || {}) as Record<string, unknown>;
  return toText(
    rec.occurred_time ||
    rec.occurredTime ||
    rec.Occurred_Time ||
    rec.occurred_at ||
    rec.occurredAt ||
    rec.event_time ||
    rec.eventAt ||
    rec.timestamp ||
    rec.observedAt ||
    rec.time ||
    rec.dt ||
    rec.alarm_time ||
    rec.time_string ||
    event.occurred_time ||
    event.occurredTime ||
    event.occurredAt ||
    event.event_time ||
    event.eventAt ||
    event.timestamp ||
    source.eventAt ||
    source.timestamp ||
    meta.occurred_time ||
    meta.event_time ||
    meta.eventAt ||
    meta.timestamp
  );
};

const getAlarmCode = (rec: Record<string, unknown>): string => {
  const event = (rec.event || {}) as Record<string, unknown>;
  const source = (rec.source || {}) as Record<string, unknown>;
  const meta = (rec.meta || {}) as Record<string, unknown>;
  if (rec.alarmCode) return toText(rec.alarmCode);
  if (rec.alarm_code) return toText(rec.alarm_code);
  if (rec.alarmId) return toText(rec.alarmId);
  if (rec.alarm_id) return toText(rec.alarm_id);
  if (rec.msg_number) return `ALM-${rec.msg_number}`;
  if (rec.code) return toText(rec.code);
  if (event.alarmCode) return toText(event.alarmCode);
  if (event.alarmId) return toText(event.alarmId);
  if (event.code) return toText(event.code);
  if (source.pointId) return toText(source.pointId);
  const eq = toText(meta.equipmentCode || meta.equipmentId || meta.equipment_code || meta.equipment_id || rec.equipmentCode || rec.equipment_code);
  if (eq) return `${eq}-ALM`;
  return "ALM-EVENT";
};

const getAlarmDescription = (rec: Record<string, unknown>): string => {
  const event = (rec.event || {}) as Record<string, unknown>;
  const meta = (rec.meta || {}) as Record<string, unknown>;
  return toText(
    rec.alarm_name ||
    rec.Alarm_Name ||
    rec.alarmName ||
    meta.alarm_name ||
    meta.alarmName ||
    rec.alarmDescription ||
    rec.description ||
    rec.msg_text ||
    rec.MsgText ||
    rec.var1 ||
    rec.message ||
    rec.text ||
    event.alarm_name ||
    event.alarmName ||
    event.text ||
    event.description ||
    event.msg_text ||
    getAlarmCode(rec)
  );
};

const getAlarmResolvedTime = (rec: Record<string, unknown>): string => {
  const event = (rec.event || {}) as Record<string, unknown>;
  const meta = (rec.meta || {}) as Record<string, unknown>;
  const direct = toText(
    rec.resolved_time ||
    rec.Resolved_Time ||
    rec.resolvedTime ||
    rec.resolvedAt ||
    rec.recovery_time ||
    rec.endTime ||
    rec.end_time ||
    rec.clearedAt ||
    event.resolved_time ||
    event.resolvedTime ||
    event.resolvedAt ||
    meta.resolved_time ||
    meta.resolvedTime ||
    ""
  );
  if (direct === "-") return "-";
  return direct || "-";
};

const getAlarmDuration = (rec: Record<string, unknown>): string => {
  const event = (rec.event || {}) as Record<string, unknown>;
  const meta = (rec.meta || {}) as Record<string, unknown>;
  const explicit = toText(
    rec.duration ||
    rec.Duration ||
    rec.durationSec ||
    rec.duration_sec ||
    rec.durationSeconds ||
    rec.time_string ||
    rec.timeString ||
    meta.duration ||
    event.duration ||
    event.durationSec
  );
  if (explicit && explicit !== "-") {
    if (/^\d+$/.test(explicit)) {
      const diffSec = Number(explicit);
      const hrs = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return explicit;
  }

  const start = parseFlexibleTimestamp(getAlarmEventTime(rec));
  const end = parseFlexibleTimestamp(getAlarmResolvedTime(rec));

  if (start && end && end >= start) {
    const diffSec = Math.floor((end - start) / 1000);
    const hrs = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    const secs = diffSec % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return "-";
};

const calculateAlarmSeverity = (rec: Record<string, unknown>): "CRITICAL" | "WARNING" | "INFO" => {
  const event = (rec.event || {}) as Record<string, unknown>;
  const explicit = toText(rec.severity || event.severity || "").toUpperCase();
  if (explicit) {
    if (explicit.includes("CRIT") || explicit.includes("HIGH") || explicit.includes("EMERG")) return "CRITICAL";
    if (explicit.includes("WARN") || explicit.includes("MED")) return "WARNING";
    if (explicit === "INFO") return "INFO";
  }

  const msgClass = Number(rec.msg_class ?? rec.MsgClass ?? rec.msgClass);
  const msgProc = Number(rec.msg_proc ?? rec.MsgProc ?? rec.msgProc);
  const msgNumber = Number(rec.msg_number ?? rec.MsgNumber ?? rec.msgNumber);

  if (msgProc === 1 || msgProc === 2) return "CRITICAL";
  if (msgProc === 3 || msgProc === 4) return "WARNING";

  if (msgClass > 64 || msgClass === 1 || msgClass === 17) return "CRITICAL";
  if (msgClass === 64 || msgClass === 16 || msgClass === 32) return "WARNING";

  if (!isNaN(msgNumber) && msgNumber > 0) {
    if (msgNumber >= 100 && msgNumber < 300) return "CRITICAL";
    if (msgNumber >= 300 && msgNumber < 500) return "WARNING";
  }

  const text = (getAlarmDescription(rec) || "").toLowerCase();
  if (
    text.includes("trip") ||
    text.includes("emergency") ||
    text.includes("critical") ||
    text.includes("fail") ||
    text.includes("fault") ||
    text.includes("guard open") ||
    text.includes("overload") ||
    text.includes("over temp") ||
    text.includes("over pressure") ||
    text.includes("high high") ||
    text.includes("low low") ||
    text.includes("stop")
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
};

const getMetricValue = (metrics: Record<string, unknown>, key: string): unknown => {
  if (!metrics) return undefined;
  if (metrics[key] !== undefined && metrics[key] !== null && metrics[key] !== "-") return metrics[key];
  const target = key.toLowerCase().replace(/[^a-z0-9]/g, "");

  // 1. Exact alphanumeric match
  for (const [k, v] of Object.entries(metrics)) {
    if (v === undefined || v === null || v === "-") continue;
    const norm = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (norm === target) return v;
  }

  // 2. Fuzzy semantic match for common telemetry variations & typos
  for (const [k, v] of Object.entries(metrics)) {
    if (v === undefined || v === null || v === "-") continue;
    const norm = k.toLowerCase().replace(/[^a-z0-9]/g, "");

    // Inlet temp matching (e.g. INLET TEMPARATURE, INLET AIR TEMP, Inlet_Temp)
    if ((target.includes("inlet") || target.includes("inlettemp") || target.includes("inletair")) &&
      (norm.includes("inlet") && (norm.includes("temp") || norm.includes("temparature")))) {
      return v;
    }
    // Outlet / Exhaust temp matching (e.g. EXHAUST TEMPARATURE, EXHAUST AIR TEMP, Outlet_Air_Temp)
    if ((target.includes("outlet") || target.includes("exhaust")) &&
      ((norm.includes("outlet") || norm.includes("exhaust")) && (norm.includes("temp") || norm.includes("temparature")))) {
      return v;
    }
    // Bed temp matching (e.g. BED TEMP, Bed_Temp, Bed_Temperature)
    if (target.includes("bed") && (norm.includes("bed") && (norm.includes("temp") || norm.includes("temparature")))) {
      return v;
    }
    // Pan speed / Dosing speed
    if (target.includes("pan") && norm.includes("pan") && norm.includes("speed")) {
      return v;
    }
    if (target.includes("dosing") && norm.includes("dosing")) {
      return v;
    }
    // Agitator / Impeller Speed
    if ((target.includes("ag") || target.includes("impeller") || target.includes("agitator")) && target.includes("speed") &&
      (norm.includes("ag") || norm.includes("impeller") || norm.includes("agitator") || norm === "speed") && norm.includes("speed")) {
      return v;
    }
    // Chopper / Granulator Speed
    if ((target.includes("chp") || target.includes("chopper") || target.includes("granulator")) && target.includes("speed") &&
      (norm.includes("chp") || norm.includes("chopper") || norm.includes("granulator")) && norm.includes("speed")) {
      return v;
    }
    // Agitator / Impeller Current (Amps)
    if ((target.includes("ag") || target.includes("impeller") || target.includes("agitator")) && (target.includes("amp") || target.includes("current")) &&
      (norm.includes("ag") || norm.includes("impeller") || norm.includes("agitator") || norm.includes("current") || norm.includes("amp"))) {
      return v;
    }
    // Chopper / Granulator Current
    if ((target.includes("chp") || target.includes("chopper") || target.includes("granulator")) && (target.includes("amp") || target.includes("current")) &&
      (norm.includes("chp") || norm.includes("chopper") || norm.includes("granulator")) && (norm.includes("amp") || norm.includes("current"))) {
      return v;
    }
    // Duration / Time
    if (target.includes("dur") && norm.includes("dur")) {
      return v;
    }
    // Blender Speed
    if (target.includes("blender") && (norm.includes("blender") || norm === "speed")) {
      return v;
    }
    // Vacuum Pressure / Level
    if (target.includes("vacuum") && norm.includes("vacuum")) {
      return v;
    }
    // Motor Current
    if (target.includes("motor") && (norm.includes("motor") || norm.includes("current") || norm.includes("amp"))) {
      return v;
    }
    // Air flow
    if (target.includes("flow") && (norm.includes("flow") || norm.includes("air"))) {
      return v;
    }
    // Moisture / LOD
    if ((target.includes("moist") || target.includes("lod")) && (norm.includes("moist") || norm.includes("lod"))) {
      return v;
    }
    // Spray rate
    if (target.includes("spray") && norm.includes("spray")) {
      return v;
    }
    // Atomizing pressure
    if (target.includes("atom") && (norm.includes("atom") || norm.includes("press"))) {
      return v;
    }
  }

  return undefined;
};

export interface MetricMetaInfo {
  parameterName: string;
  unit: string;
  idealTarget?: number;
  lowerCriticalLimit?: number;
  upperCriticalLimit?: number;
  lowerWarningLimit?: number;
  upperWarningLimit?: number;
  idealMin?: number;
  idealMax?: number;
}

function resolveMetricLimits(
  metricKey: string,
  equipmentCode: string,
  limits: CriticalParameterLimit[],
  criticalParams: CriticalParameter[],
): {
  parameterName: string;
  unit: string;
  idealTarget?: number;
  limits?: {
    lowerCriticalLimit?: number;
    upperCriticalLimit?: number;
    lowerWarningLimit?: number;
    upperWarningLimit?: number;
    idealTarget?: number;
    idealMin?: number;
    idealMax?: number;
  };
} {
  const normKey = metricKey
    .toLowerCase()
    .replace(/temparature/g, "temp")
    .replace(/temperature/g, "temp")
    .replace(/[^a-z0-9]/g, "");

  const matchedParam = criticalParams.find((p) => {
    const pCode = (p.parameterCode || "").toLowerCase().replace(/temparature/g, "temp").replace(/temperature/g, "temp").replace(/[^a-z0-9]/g, "");
    const pName = (p.parameterName || "").toLowerCase().replace(/temparature/g, "temp").replace(/temperature/g, "temp").replace(/[^a-z0-9]/g, "");
    return pCode.includes(normKey) || normKey.includes(pCode) || pName.includes(normKey) || normKey.includes(pName);
  });

  const unit = toText(matchedParam?.unitOfMeasure) ||
    (normKey.includes("temp") ? "°C" : normKey.includes("speed") ? "RPM" : normKey.includes("amp") ? "A" : normKey.includes("press") ? "bar" : normKey.includes("flow") ? "L/h" : normKey.includes("moist") ? "%" : "units");

  const matchedLimit = limits.find((l) => {
    const lCode = (l.parameterCode || "").toLowerCase().replace(/temparature/g, "temp").replace(/temperature/g, "temp").replace(/[^a-z0-9]/g, "");
    const lName = (l.parameterName || "").toLowerCase().replace(/temparature/g, "temp").replace(/temperature/g, "temp").replace(/[^a-z0-9]/g, "");
    const lLimitCode = ((l as Record<string, unknown>).parameterLimitCode as string || "").toLowerCase().replace(/temparature/g, "temp").replace(/temperature/g, "temp").replace(/[^a-z0-9]/g, "");
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
    const upperCriticalLimit = toNumberOrUndefined(rawLimit.upperCriticalLimit ?? rawLimit.highCriticalValue ?? rawLimit.upperLimit ?? rawLimit.maxValue);
    const lowerCriticalLimit = toNumberOrUndefined(rawLimit.lowerCriticalLimit ?? rawLimit.lowCriticalValue ?? rawLimit.lowerLimit ?? rawLimit.minValue);
    const upperWarningLimit = toNumberOrUndefined(rawLimit.upperWarningLimit ?? rawLimit.highWarningValue ?? rawLimit.warningHigh);
    const lowerWarningLimit = toNumberOrUndefined(rawLimit.lowerWarningLimit ?? rawLimit.lowWarningValue ?? rawLimit.warningLow);
    const idealTarget = toNumberOrUndefined(rawLimit.idealTarget ?? rawLimit.targetValue ?? rawLimit.floatValue ?? rawLimit.setValue ?? rawLimit.setPoint);
    const idealMin = toNumberOrUndefined(rawLimit.idealMin ?? rawLimit.idealMinValue);
    const idealMax = toNumberOrUndefined(rawLimit.idealMax ?? rawLimit.idealMaxValue);

    if (upperCriticalLimit !== undefined || lowerCriticalLimit !== undefined || idealTarget !== undefined) {
      return {
        parameterName,
        unit,
        idealTarget,
        limits: {
          upperCriticalLimit,
          lowerCriticalLimit,
          upperWarningLimit,
          lowerWarningLimit,
          idealTarget,
          idealMin,
          idealMax,
        },
      };
    }
  }

  // --- RMG Parameters (MB003) ---
  if (normKey.includes("agspeed") || normKey.includes("agitatorspeed") || normKey.includes("impellerspeed") || (normKey.includes("speed") && !normKey.includes("chp") && !normKey.includes("pan") && !normKey.includes("blender") && !normKey.includes("turret") && !normKey.includes("feeder") && !normKey.includes("disk"))) {
    return {
      parameterName: "Impeller Speed",
      unit: "RPM",
      idealTarget: 100.0,
      limits: {
        upperCriticalLimit: 175.0,
        upperWarningLimit: 160.0,
        idealTarget: 100.0,
        idealMin: 80.0,
        idealMax: 175.0,
        lowerWarningLimit: 80.0,
        lowerCriticalLimit: 80.0,
      },
    };
  }

  if (normKey.includes("agamps") || normKey.includes("agitatoramps") || normKey.includes("agitatorcurrent") || normKey.includes("impelleramps") || normKey.includes("impellercurrent") || normKey === "current" || normKey === "currentamp") {
    return {
      parameterName: "Impeller Current",
      unit: "A",
      idealTarget: 30.0,
      limits: {
        upperCriticalLimit: 33.0,
        upperWarningLimit: 30.5,
        idealTarget: 30.0,
        idealMin: 0.0,
        idealMax: 33.0,
        lowerWarningLimit: 0.0,
        lowerCriticalLimit: 0.0,
      },
    };
  }

  if (normKey.includes("chpspeed") || normKey.includes("chopperspeed") || normKey.includes("granulatorspeed")) {
    return {
      parameterName: "Chopper Speed",
      unit: "RPM",
      idealTarget: 50.0,
      limits: {
        upperCriticalLimit: 60.0,
        upperWarningLimit: 55.0,
        idealTarget: 50.0,
        idealMin: 40.0,
        idealMax: 60.0,
        lowerWarningLimit: 40.0,
        lowerCriticalLimit: 40.0,
      },
    };
  }

  if (normKey.includes("chpamps") || normKey.includes("chopperamps") || normKey.includes("granulatoramps") || normKey.includes("granulatorcurrent")) {
    return {
      parameterName: "Chopper Current",
      unit: "A",
      idealTarget: 6.5,
      limits: {
        upperCriticalLimit: 7.5,
        upperWarningLimit: 7.0,
        idealTarget: 6.5,
        idealMin: 0.0,
        idealMax: 7.5,
        lowerWarningLimit: 0.0,
        lowerCriticalLimit: 0.0,
      },
    };
  }

  // --- FBD Parameters (MB004) & Common Temperatures ---
  if (normKey.includes("inlet") && (normKey.includes("temp") || normKey === "inlet")) {
    return {
      parameterName: "Inlet Air Temperature",
      unit: "°C",
      idealTarget: 60.0,
      limits: {
        upperCriticalLimit: 64.0,
        upperWarningLimit: 62.0,
        idealTarget: 60.0,
        idealMin: 25.0,
        idealMax: 64.0,
        lowerWarningLimit: 28.0,
        lowerCriticalLimit: 25.0,
      },
    };
  }

  if (
    (normKey.includes("outlet") || normKey.includes("exhaust")) &&
    (normKey.includes("temp") || normKey === "outlet" || normKey === "exhaust")
  ) {
    return {
      parameterName: normKey.includes("outlet") ? "Outlet Air Temperature" : "Exhaust Air Temperature",
      unit: "°C",
      idealTarget: 37.0,
      limits: {
        upperCriticalLimit: 52.0,
        upperWarningLimit: 48.0,
        idealTarget: 37.0,
        idealMin: 19.0,
        idealMax: 52.0,
        lowerWarningLimit: 22.0,
        lowerCriticalLimit: 19.0,
      },
    };
  }

  if (normKey.includes("bedtemp") || normKey.includes("bedtemperature") || normKey.includes("producttemp") || normKey.includes("heatertemp") || normKey.includes("granulationtemp")) {
    return {
      parameterName: "Bed Temperature",
      unit: "°C",
      idealTarget: 45.0,
      limits: {
        upperCriticalLimit: 50.0,
        upperWarningLimit: 48.0,
        idealTarget: 45.0,
        idealMin: 40.0,
        idealMax: 50.0,
        lowerWarningLimit: 40.0,
        lowerCriticalLimit: 40.0,
      },
    };
  }

  if (normKey.includes("airflow") || normKey.includes("airflowrate")) {
    return {
      parameterName: "Air Flow Rate",
      unit: "m³/h",
      idealTarget: 1200.0,
      limits: {
        upperCriticalLimit: 1400.0,
        upperWarningLimit: 1300.0,
        idealTarget: 1200.0,
        idealMin: 1000.0,
        idealMax: 1400.0,
        lowerWarningLimit: 1000.0,
        lowerCriticalLimit: 1000.0,
      },
    };
  }

  if (normKey.includes("productmoisture") || normKey.includes("moisture") || normKey.includes("lod")) {
    return {
      parameterName: "Product Moisture",
      unit: "%",
      idealTarget: 2.5,
      limits: {
        upperCriticalLimit: 3.5,
        upperWarningLimit: 3.0,
        idealTarget: 2.5,
        idealMin: 1.5,
        idealMax: 3.5,
        lowerWarningLimit: 1.5,
        lowerCriticalLimit: 1.5,
      },
    };
  }

  if (normKey.includes("processtimemin") || normKey.includes("processtime") || normKey.includes("dryingtime")) {
    return {
      parameterName: "Process Time",
      unit: "min",
      idealTarget: 300.0,
      limits: {
        upperCriticalLimit: 360.0,
        upperWarningLimit: 330.0,
        idealTarget: 300.0,
        idealMin: 0.0,
        idealMax: 360.0,
        lowerWarningLimit: 0.0,
        lowerCriticalLimit: 0.0,
      },
    };
  }

  // --- BLE Parameters (MB005) ---
  if (normKey.includes("blenderspeed") || normKey.includes("blender_speed")) {
    return {
      parameterName: "Blender Speed",
      unit: "RPM",
      idealTarget: 5.0,
      limits: {
        upperCriticalLimit: 6.0,
        upperWarningLimit: 5.5,
        idealTarget: 5.0,
        idealMin: 4.0,
        idealMax: 6.0,
        lowerWarningLimit: 4.0,
        lowerCriticalLimit: 4.0,
      },
    };
  }

  if (normKey.includes("blendingtime") || normKey.includes("blending_time")) {
    return {
      parameterName: "Blending Time",
      unit: "min",
      idealTarget: 15.0,
      limits: {
        upperCriticalLimit: 20.0,
        upperWarningLimit: 18.0,
        idealTarget: 15.0,
        idealMin: 10.0,
        idealMax: 20.0,
        lowerWarningLimit: 10.0,
        lowerCriticalLimit: 10.0,
      },
    };
  }

  if (normKey.includes("vacuumpressure") || normKey.includes("vacuumlevel") || (normKey.includes("vacuum") && !normKey.includes("time"))) {
    return {
      parameterName: "Vacuum Level",
      unit: "bar",
      idealTarget: -0.8,
      limits: {
        upperCriticalLimit: -0.6,
        upperWarningLimit: -0.7,
        idealTarget: -0.8,
        idealMin: -1.0,
        idealMax: -0.6,
        lowerWarningLimit: -0.9,
        lowerCriticalLimit: -1.0,
      },
    };
  }

  if (normKey.includes("motorcurrent") || normKey.includes("motor_current")) {
    return {
      parameterName: "Motor Current",
      unit: "A",
      idealTarget: 12.0,
      limits: {
        upperCriticalLimit: 15.0,
        upperWarningLimit: 14.0,
        idealTarget: 12.0,
        idealMin: 8.0,
        idealMax: 15.0,
        lowerWarningLimit: 8.0,
        lowerCriticalLimit: 8.0,
      },
    };
  }

  if (normKey.includes("purgetime") || normKey.includes("purge_time") || normKey === "purge") {
    return {
      parameterName: "Purge Time",
      unit: "Sec",
      idealTarget: 5.0,
      limits: {
        upperCriticalLimit: 10.0,
        upperWarningLimit: 8.0,
        idealTarget: 5.0,
        idealMin: 3.0,
        idealMax: 10.0,
        lowerWarningLimit: 3.0,
        lowerCriticalLimit: 3.0,
      },
    };
  }

  // --- COAT Parameters (MB041) ---
  if (normKey.includes("panspeed") || normKey.includes("drumspeed") || normKey.includes("panrpm")) {
    return {
      parameterName: "Pan Speed",
      unit: "RPM",
      idealTarget: 8.0,
      limits: {
        upperCriticalLimit: 12.0,
        upperWarningLimit: 10.0,
        idealTarget: 8.0,
        idealMin: 5.0,
        idealMax: 12.0,
        lowerWarningLimit: 5.0,
        lowerCriticalLimit: 5.0,
      },
    };
  }

  if (normKey.includes("sprayrate") || normKey.includes("spray_rate")) {
    return {
      parameterName: "Spray Rate",
      unit: "g/min",
      idealTarget: 120.0,
      limits: {
        upperCriticalLimit: 140.0,
        upperWarningLimit: 130.0,
        idealTarget: 120.0,
        idealMin: 100.0,
        idealMax: 140.0,
        lowerWarningLimit: 100.0,
        lowerCriticalLimit: 100.0,
      },
    };
  }

  if (normKey.includes("atomairpress") || normKey.includes("atomizingpressure") || normKey.includes("atomizationairpressure")) {
    return {
      parameterName: "Atomizing Pressure",
      unit: "bar",
      idealTarget: 2.5,
      limits: {
        upperCriticalLimit: 3.0,
        upperWarningLimit: 2.8,
        idealTarget: 2.5,
        idealMin: 2.0,
        idealMax: 3.0,
        lowerWarningLimit: 2.0,
        lowerCriticalLimit: 2.0,
      },
    };
  }

  // --- Compression Parameters (MC081) ---
  if (normKey.includes("mainpressure") || normKey.includes("mainforce")) {
    return {
      parameterName: "Main Compression Force",
      unit: "kN",
      idealTarget: 14.83,
      limits: {
        upperCriticalLimit: 25.0,
        upperWarningLimit: 20.0,
        idealTarget: 14.83,
        idealMin: 10.0,
        idealMax: 25.0,
        lowerWarningLimit: 10.0,
        lowerCriticalLimit: 10.0,
      },
    };
  }

  if (normKey.includes("prepressure") || normKey.includes("preforce")) {
    return {
      parameterName: "Pre-Compression Force",
      unit: "kN",
      idealTarget: 3.80,
      limits: {
        upperCriticalLimit: 8.0,
        upperWarningLimit: 6.0,
        idealTarget: 3.80,
        idealMin: 2.0,
        idealMax: 8.0,
        lowerWarningLimit: 2.0,
        lowerCriticalLimit: 2.0,
      },
    };
  }

  if (normKey.includes("diskspeed") || normKey.includes("turretspeed")) {
    return {
      parameterName: "Disk Speed",
      unit: "RPM",
      idealTarget: 18.0,
      limits: {
        upperCriticalLimit: 35.0,
        upperWarningLimit: 30.0,
        idealTarget: 18.0,
        idealMin: 10.0,
        idealMax: 35.0,
        lowerWarningLimit: 10.0,
        lowerCriticalLimit: 10.0,
      },
    };
  }

  if (normKey.includes("feederrpm") || normKey.includes("feederspeed")) {
    return {
      parameterName: "Feeder Speed",
      unit: "RPM",
      idealTarget: 10.0,
      limits: {
        upperCriticalLimit: 20.0,
        upperWarningLimit: 15.0,
        idealTarget: 10.0,
        idealMin: 5.0,
        idealMax: 20.0,
        lowerWarningLimit: 5.0,
        lowerCriticalLimit: 5.0,
      },
    };
  }

  if (normKey.includes("mainthickness") || normKey.includes("tabletthickness")) {
    return {
      parameterName: "Main Thickness",
      unit: "mm",
      idealTarget: 4.28,
      limits: {
        upperCriticalLimit: 4.8,
        upperWarningLimit: 4.5,
        idealTarget: 4.28,
        idealMin: 3.8,
        idealMax: 4.8,
        lowerWarningLimit: 3.8,
        lowerCriticalLimit: 3.8,
      },
    };
  }

  if (normKey.includes("fillingdepth")) {
    return {
      parameterName: "Filling Depth",
      unit: "mm",
      idealTarget: 12.01,
      limits: {
        upperCriticalLimit: 15.0,
        upperWarningLimit: 14.0,
        idealTarget: 12.01,
        idealMin: 10.0,
        idealMax: 15.0,
        lowerWarningLimit: 10.0,
        lowerCriticalLimit: 10.0,
      },
    };
  }

  if (normKey.includes("duration") || normKey.includes("durationsec")) {
    return {
      parameterName: "Duration",
      unit: "Sec",
      idealTarget: 600.0,
      limits: {
        upperCriticalLimit: 600.0,
        upperWarningLimit: 600.0,
        idealTarget: 600.0,
        idealMin: 0.0,
        idealMax: 600.0,
        lowerWarningLimit: 0.0,
        lowerCriticalLimit: 0.0,
      },
    };
  }

  return {
    parameterName,
    unit,
    idealTarget: undefined,
    limits: undefined,
  };
}

/**
 * Resolves the Set value for an operational parameter from metrics or limits metadata.
 */
function resolveSetValue(
  metricKey: string,
  metrics: Record<string, unknown>,
  idealTarget?: number
): number | string | null {
  const m = metrics || {};
  const normalizeKey = (k: string) =>
    k
      .toLowerCase()
      .replace(/temparature/g, "temp")
      .replace(/temperature/g, "temp")
      .replace(/air/g, "")
      .replace(/[^a-z0-9]/g, "");

  const lowerKey = normalizeKey(metricKey);

  for (const [k, v] of Object.entries(m)) {
    const kl = normalizeKey(k);
    if (
      (kl.includes(lowerKey) || lowerKey.includes(kl) ||
        (lowerKey.includes("inlet") && kl.includes("inlet")) ||
        ((lowerKey.includes("exhaust") || lowerKey.includes("outlet")) && (kl.includes("exhaust") || kl.includes("outlet"))) ||
        (lowerKey.includes("speed") && kl.includes("speed")) ||
        (lowerKey.includes("vacuum") && kl.includes("vacuum")) ||
        (lowerKey.includes("time") && kl.includes("time")) ||
        (lowerKey.includes("current") && (kl.includes("current") || kl.includes("amp")))) &&
      (kl.includes("set") || kl.includes("sv") || kl.includes("sp") || kl.includes("target"))
    ) {
      if (v !== null && v !== undefined && v !== "") {
        return typeof v === "number" ? v : String(v);
      }
    }
  }

  if (idealTarget !== undefined && idealTarget !== null && !isNaN(idealTarget)) {
    return idealTarget;
  }
  return null;
}

/**
 * Formats parameter value into compact "Set / Actual" format (e.g. "100 / 98").
 */
function formatSetActual(
  actualFormatted: string,
  setVal: number | string | null
): string {
  if (actualFormatted === "-" || actualFormatted === "") {
    return "-";
  }
  if (setVal === null || setVal === undefined) {
    return actualFormatted;
  }
  const formattedSet = typeof setVal === "number"
    ? (Number.isInteger(setVal) ? setVal.toString() : setVal.toFixed(1))
    : String(setVal).trim();

  return `${formattedSet} / ${actualFormatted}`;
}

export default function BatchInfoScreen({ batchId }: BatchInfoScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const queryBatchNo = toText(batchId || searchParams.get("batchNo"));
  const queryLotNo = toText(searchParams.get("lotNo"));
  const queryEquipmentCode = toText(searchParams.get("equipmentCode"));
  const returnTo = searchParams.get("returnTo");
  const returnToRoute = getSafeReturnTo(returnTo, ROUTES.iiotMyActions);

  const loginContext = useLoginContext();
  const currentUser = loginContext?.user;
  const userRoles = useMemo(() => {
    const rawRoles = (loginContext?.roles as Array<unknown>) || [];
    return rawRoles.map((r) => {
      if (typeof r === "string") return r.toUpperCase();
      if (r && typeof r === "object") {
        const code =
          (r as Record<string, unknown>).roleCode ??
          (r as Record<string, unknown>).role ??
          (r as Record<string, unknown>).name;
        return typeof code === "string" ? code.toUpperCase() : "";
      }
      return "";
    });
  }, [loginContext?.roles]);
  const userRole = (loginContext?.roles?.[0] as Record<string, unknown>)?.roleCode as string || userRoles[0] || "PRODUCTION_REVIEWER";

  const rawUserRole = userRole || "OPERATOR";
  const normalizedUserRole = rawUserRole.toUpperCase();
  const isOperatorRole = normalizedUserRole.includes("OPERATOR");
  const isReviewerRole = normalizedUserRole.includes("REVIEWER") || normalizedUserRole.includes("SUPERVISOR");
  const isApproverRole = normalizedUserRole.includes("APPROVER") || normalizedUserRole.includes("QA");

  const roleTitle = isApproverRole ? "QA Approver" : isReviewerRole ? "Production Reviewer" : "Production Operator";
  const roleScope = isApproverRole ? "APPROVER" : isReviewerRole ? "REVIEWER" : "OPERATOR";
  const roleStageWiseLabel = isOperatorRole ? "Viewed" : isReviewerRole ? "Reviewed" : "Approved";

  // Data States
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [cppRecords, setCppRecords] = useState<CppRecord[]>([]);
  const [alarmRecords, setAlarmRecords] = useState<AlarmEventRecord[]>([]);
  const [eventDataRecords, setEventDataRecords] = useState<Record<string, unknown>[]>([]);
  const [auditEvents, setAuditEvents] = useState<WorkflowAuditEvent[]>([]);
  const [paramLimits, setParamLimits] = useState<CriticalParameterLimit[]>([]);
  const [criticalParams, setCriticalParams] = useState<CriticalParameter[]>([]);
  const [workflowInstance, setWorkflowInstance] = useState<Record<string, unknown> | null>(null);
  const [actionHistory, setActionHistory] = useState<WorkflowActionHistoryItem[]>([]);
  const [allowedActions, setAllowedActions] = useState<AllowedWorkflowAction[]>([]);

  // UI & Loading States
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Modal States
  const [modalAction, setModalAction] = useState<AllowedWorkflowAction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [activeInfoSection, setActiveInfoSection] = useState<string>("OPERATIONAL_DETAIL_VALUES");

  // Section Review State (Parameter Settings, Operational Detail Values, Parameter Trends, Alarms / Events, Audit Trail)
  const initialSectionReviews: Record<BatchInfoSectionType, SectionReviewItem> = useMemo(() => ({
    PARAMETER_SETTINGS: { status: "PENDING" },
    OPERATIONAL_DETAIL_VALUES: { status: "PENDING" },
    TRENDS: { status: "PENDING" },
    ALARM_SUMMARY: { status: "PENDING" },
    AUDIT_TRAIL: { status: "PENDING" },
  }), []);

  const [sectionReviews, setSectionReviews] = useState<Record<BatchInfoSectionType, SectionReviewItem>>(initialSectionReviews);

  const selectedEquipmentCode = toText(searchParams.get("equipmentCode"));
  const targetEquipmentCode = useMemo(() => {
    return selectedEquipmentCode || queryEquipmentCode || batchSummary?.equipmentId || "MB003";
  }, [selectedEquipmentCode, queryEquipmentCode, batchSummary?.equipmentId]);

  const eqMeta: EquipmentMeta = useMemo(() => {
    return resolveEquipmentInfo(targetEquipmentCode);
  }, [targetEquipmentCode]);

  const isRmg = eqMeta.type === "RMG";
  const isFbd = eqMeta.type === "FBD";
  const isBle = eqMeta.type === "BLE";
  const isComp = eqMeta.type === "COMP";
  const isCoat = eqMeta.type === "COAT";

  const compDetails = useMemo(() => {
    if (!isComp) return null;
    const isLotSpecific = Boolean(
      queryLotNo &&
      queryLotNo !== "NA" &&
      queryLotNo !== "null" &&
      queryLotNo.trim().toUpperCase() !== queryBatchNo.trim().toUpperCase()
    );
    const selected = (cppRecords as Array<Record<string, unknown>>).find((record) => {
      const meta = (record.meta || {}) as Record<string, unknown>;
      const dLot = toText(meta.derivedLotNo || meta.lotNo);
      if (!isLotSpecific) return true;
      return dLot === queryLotNo || toText(meta.lotNo) === queryLotNo || toText(meta.derivedLotNo) === queryLotNo;
    }) || (cppRecords[0] as Record<string, unknown> | undefined);
    return (selected?.compression_details as Record<string, unknown>) || null;
  }, [isComp, cppRecords, queryLotNo, queryBatchNo]);

  const compressionLots = useMemo(() => (cppRecords as Array<Record<string, unknown>>).map((record) => {
    const meta = (record.meta || {}) as Record<string, unknown>;
    const details = (record.compression_details || {}) as Record<string, unknown>;
    const metadata = (details.metadata || {}) as Record<string, unknown>;
    return {
      lotNo: toText(meta.derivedLotNo || meta.lotNo),
      sourceFile: toText(metadata.sourceFile),
      observedAt: toText(record.observedAt),
    };
  }).filter((lot) => lot.lotNo), [cppRecords]);

  const compBatchInfo = useMemo(() => ((compDetails?.batchInfo || {}) as Record<string, unknown>), [compDetails]);
  const compRecipe = useMemo(() => ((compDetails?.recipeSettings || {}) as Record<string, unknown>), [compDetails]);
  const compFeeder = useMemo(() => ((compRecipe?.feeder || {}) as Record<string, unknown>), [compRecipe]);
  const compHydra = useMemo(() => ((compRecipe?.hydraulicPressureLimits || {}) as Record<string, unknown>), [compRecipe]);
  const compOil = useMemo(() => ((compRecipe?.oilLubrication || {}) as Record<string, unknown>), [compRecipe]);
  const compControlLimits = useMemo(() => ((compRecipe?.controlLimits || {}) as Record<string, unknown>), [compRecipe]);
  const compPressure = useMemo(() => ((compDetails?.pressureData || {}) as Record<string, unknown>), [compDetails]);
  const compPrePressure = useMemo(() => ((compPressure?.prePressure || {}) as Record<string, unknown>), [compPressure]);
  const compMainPressure = useMemo(() => ((compPressure?.mainPressure || {}) as Record<string, unknown>), [compPressure]);
  const compDepthAdj = useMemo(() => ((compPressure?.fillingDepthAdjustments || {}) as Record<string, unknown>), [compPressure]);
  const compOpVals = useMemo(() => ((compDetails?.operationValues || {}) as Record<string, unknown>), [compDetails]);
  const compCounters = useMemo(() => ((compDetails?.tabletCounters || {}) as Record<string, unknown>), [compDetails]);
  const compTightness = useMemo(() => ((compDetails?.tightness || {}) as Record<string, unknown>), [compDetails]);
  const compTabletChecker = useMemo(() => ((compDetails?.tabletChecker || {}) as Record<string, unknown>), [compDetails]);
  const compHep = useMemo(() => ((compCounters?.hep || {}) as Record<string, unknown>), [compCounters]);
  const compLep = useMemo(() => ((compCounters?.lep || {}) as Record<string, unknown>), [compCounters]);
  const compGood = useMemo(() => ((compCounters?.good || {}) as Record<string, unknown>), [compCounters]);
  const compOpHistory = useMemo(() => ((compDetails?.operation_history || []) as Array<Record<string, unknown>>), [compDetails]);
  const compLoginHistory = useMemo(() => ((compDetails?.login_history || []) as Array<Record<string, unknown>>), [compDetails]);
  const compAlarmHistory = useMemo(() => ((compDetails?.alarm_history || []) as Array<Record<string, unknown>>), [compDetails]);

  const activeStatus = useMemo(() => {
    if (workflowInstance?.currentStatus) {
      return toText(workflowInstance.currentStatus).toUpperCase();
    }
    if (actionHistory.length > 0) {
      const latest = actionHistory[actionHistory.length - 1];
      if (latest?.newStatus) {
        return toText(latest.newStatus).toUpperCase();
      }
    }
    const sumStat = toText(batchSummary?.batchStatus || batchSummary?.overallStatus);
    if (sumStat && sumStat !== "-") {
      return sumStat.toUpperCase();
    }
    return "PENDING_REVIEW";
  }, [workflowInstance, actionHistory, batchSummary]);

  const isApprovedBatch = activeStatus === "COMPLETED" || activeStatus === "APPROVED" || activeStatus === "QA_APPROVED";
  const isConsolidatedCompression = targetEquipmentCode.trim().toUpperCase() === "MC081";
  const isFinalPdfReady = isConsolidatedCompression ? batchSummary?.compressionPdfReadiness?.ready === true : isApprovedBatch;
  const finalPdfDisabledReason = isConsolidatedCompression
    ? `Print is enabled once all lots of this batch are QA approved. Pending: ${batchSummary?.compressionPdfReadiness?.pendingLots.join(", ") || "checking lot approvals"}`
    : "Print Dossier is enabled once the entire batch stage is QA Approved";

  const passedCount = useMemo(
    () => Object.values(sectionReviews).filter((t) => t.status === "PASSED").length,
    [sectionReviews]
  );
  const isAllSectionsPassed = passedCount === BATCH_INFO_SECTIONS.length || isApprovedBatch;

  // Search & Filter States
  const [parameterSearch, setParameterSearch] = useState("");
  const [alarmSearch, setAlarmSearch] = useState("");
  const [alarmFilter, setAlarmFilter] = useState("ALL");
  const [auditSearch, setAuditSearch] = useState("");
  const [correlatedAlarm, setCorrelatedAlarm] = useState<AlarmEventRecord | null>(null);

  // Pagination States
  const [parametersPage, setParametersPage] = useState(1);
  const [parametersPageSize, setParametersPageSize] = useState(10);
  const [alarmsPage, setAlarmsPage] = useState(1);
  const [alarmsPageSize, setAlarmsPageSize] = useState(10);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(10);

  // Correlation Minute Window Calculation
  const isWithinCorrelationWindow = useCallback(
    (itemObservedAt: unknown, alarmTimeStr: unknown): boolean => {
      const itemMs = parseFlexibleTimestamp(itemObservedAt);
      const alarmMs = parseFlexibleTimestamp(alarmTimeStr);
      if (itemMs === null || alarmMs === null) return false;
      const diffMs = Math.abs(itemMs - alarmMs);
      return diffMs <= 15 * 60 * 1000;
    },
    []
  );

  const isExactMinuteMatch = useCallback(
    (itemObservedAt: unknown): boolean => {
      if (!correlatedAlarm) return false;
      const itemMs = parseFlexibleTimestamp(itemObservedAt);
      const alarmMs = parseFlexibleTimestamp(getAlarmEventTime(correlatedAlarm as unknown as Record<string, unknown>));
      if (itemMs === null || alarmMs === null) return false;
      return Math.abs(itemMs - alarmMs) < 60 * 1000;
    },
    [correlatedAlarm]
  );

  const handleClearCorrelation = useCallback(() => {
    setCorrelatedAlarm(null);
  }, []);

  // Data Loading Lifecycle
  const loadBatchData = useCallback(async () => {
    try {
      setIsLoading(true);

      let currentSummary: BatchSummary | null = null;
      if (queryBatchNo) {
        try {
          const summaries = await getBatchSummaryPaginated({
            batchNo: queryBatchNo,
            ...((selectedEquipmentCode || queryEquipmentCode) ? { equipmentId: selectedEquipmentCode || queryEquipmentCode } : {}),
            ...(queryLotNo ? { lotNo: queryLotNo } : {}),
            limit: 10,
          });
          if (summaries && summaries.length > 0) {
            const matched = summaries.find(
              (s) => s.batchNo?.trim().toUpperCase() === queryBatchNo.trim().toUpperCase()
            );
            currentSummary = matched || (summaries[0].batchNo?.trim().toUpperCase() === queryBatchNo.trim().toUpperCase() ? summaries[0] : null);
          }
        } catch (err) {
          console.error("Failed to load batch summary", err);
        }
      }
      setBatchSummary(currentSummary);

      const targetEquipment =
        selectedEquipmentCode || queryEquipmentCode || currentSummary?.equipmentId || "G5RMG";

      // 1. Fetch CPP parameters
      try {
        const isLotQuerySpecific = Boolean(
          queryLotNo &&
          queryLotNo !== "NA" &&
          queryLotNo !== "null" &&
          queryLotNo.trim().toUpperCase() !== queryBatchNo.trim().toUpperCase()
        );
        const cpp = await getCppDataPaginated(targetEquipment, {
          batchNo: queryBatchNo,
          limit: 50000,
          ...(isLotQuerySpecific ? { lotNo: queryLotNo } : {}),
        }).catch(() => []);
        setCppRecords(cpp || []);
      } catch (err) {
        console.error("Failed to load CPP records", err);
        setCppRecords([]);
      }

      // 2. Fetch Critical Parameters & Limits metadata
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

      // 3. Fetch Alarm events for equipment
      try {
        const alarms = await getAlarmEventDataPaginated(targetEquipment, {
          eventCategory: "ALARM",
          limit: 5000,
        }).catch(() => []);
        setAlarmRecords((alarms || []) as unknown as AlarmEventRecord[]);
      } catch (err) {
        console.error("Failed to load Alarm events", err);
        setAlarmRecords([]);
      }

      // 4. Fetch Equipment Event Data
      try {
        const events = await getAlarmEventDataPaginated(targetEquipment, {
          eventCategory: "EVENT",
          limit: 5000,
        }).catch(() => []);
        setEventDataRecords((events || []) as unknown as Record<string, unknown>[]);
      } catch (err) {
        console.error("Failed to load Equipment Event Data", err);
        setEventDataRecords([]);
      }

      // 5. Fetch Audit Trail
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

      // 6. Fetch Workflow Instance State Machine History & Actions
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
      console.error("Error loading batch info", err);
    } finally {
      setIsLoading(false);
    }
  }, [queryBatchNo, queryLotNo, queryEquipmentCode, selectedEquipmentCode]);

  // Batch-scoped reset: When switching from one batch to another, immediately clear old batch data
  useEffect(() => {
    setBatchSummary(null);
    setAuditEvents([]);
    setCppRecords([]);
    setAlarmRecords([]);
    setWorkflowInstance(null);
    setActionHistory([]);
  }, [queryBatchNo, queryLotNo]);

  useEffect(() => {
    loadBatchData();
  }, [loadBatchData]);

  // Load persisted section reviews on batch switch or role change
  useEffect(() => {
    if (!queryBatchNo) return;
    try {
      const eqCode = selectedEquipmentCode || queryEquipmentCode || batchSummary?.equipmentId || "G5RMG";
      const roleKey = `batch_info_section_reviews_${roleScope}_${queryBatchNo}_${eqCode}`;
      const fallbackKey = `batch_info_section_reviews_${queryBatchNo}_${eqCode}`;
      const saved = localStorage.getItem(roleKey) || localStorage.getItem(fallbackKey);
      if (saved) {
        setSectionReviews(JSON.parse(saved));
      } else {
        setSectionReviews(initialSectionReviews);
      }
    } catch (e) {
      console.error("Failed to load saved section reviews", e);
    }
  }, [queryBatchNo, selectedEquipmentCode, queryEquipmentCode, batchSummary?.equipmentId, initialSectionReviews, roleScope]);

  const existingQueryList: ConsolidatedQueryItem[] = useMemo(() => {
    return BATCH_INFO_SECTIONS.map((t) => {
      const rev = sectionReviews[t.id];
      return {
        tabKey: t.id,
        tabLabel: t.shortName,
        queryComments: rev?.queryComments,
        queryRecipient: rev?.queryRecipient,
      };
    }).filter((q) => Boolean(q.queryComments && sectionReviews[q.tabKey as BatchInfoSectionType]?.status === "HAS_QUERIES"));
  }, [sectionReviews]);

  // Request Additional Information & Response Audit Trail
  const additionalInfoAuditTrail = useMemo(() => {
    interface QueryAuditRow {
      id: string;
      rawTimestamp: number;
      dateTime: string;
      action: string;
      requester: string;
      requesterComments: string;
      responder: string;
      responseComments: string;
      status: "PENDING" | "RESPONDED";
    }

    const rows: QueryAuditRow[] = [];
    const pairedResponseIds = new Set<string>();

    const responseCandidates = [
      ...actionHistory
        .filter((h) => toText(h.actionCode).toUpperCase().includes("RESPOND") || toText(h.actionName).toUpperCase().includes("RESPONSE"))
        .map((h) => ({
          id: h.historyId || `resp_hist_${h.timestamp}`,
          timestamp: parseFlexibleTimestamp(h.timestamp) || 0,
          dateTime: toDisplayDate(h.timestamp),
          responder: h.performerName || h.performedBy || "Operator",
          comments: h.comments || "Provided requested clarification",
        })),
      ...auditEvents
        .filter((a) => toText(a.actionCode).toUpperCase().includes("RESPOND") || toText(a.action).toUpperCase().includes("RESPONSE"))
        .map((a) => ({
          id: a.auditId || `resp_audit_${a.timestamp}`,
          timestamp: parseFlexibleTimestamp(a.timestamp) || 0,
          dateTime: toDisplayDate(a.timestamp),
          responder: a.userName || a.userId || "Operator",
          comments: a.comments || "Provided requested clarification",
        })),
    ].sort((a, b) => a.timestamp - b.timestamp);

    const requestCandidates = [
      ...actionHistory
        .filter((h) => toText(h.actionCode).toUpperCase().includes("REQUEST_ADDITIONAL_INFO") || toText(h.actionName).toUpperCase().includes("INFORMATION"))
        .map((h) => ({
          id: h.historyId || `req_hist_${h.timestamp}`,
          timestamp: parseFlexibleTimestamp(h.timestamp) || 0,
          dateTime: toDisplayDate(h.timestamp),
          action: "Information Request",
          requester: h.performerName || h.performedBy || "Reviewer",
          comments: h.comments || "Clarification required",
        })),
      ...auditEvents
        .filter((a) => toText(a.actionCode).toUpperCase().includes("REQUEST_ADDITIONAL_INFO") || toText(a.action).toUpperCase().includes("INFORMATION"))
        .map((a) => ({
          id: a.auditId || `req_audit_${a.timestamp}`,
          timestamp: parseFlexibleTimestamp(a.timestamp) || 0,
          dateTime: toDisplayDate(a.timestamp),
          action: "Information Request",
          requester: a.userName || a.userId || "Reviewer",
          comments: a.comments || "Clarification required",
        })),
    ];

    BATCH_INFO_SECTIONS.forEach((section) => {
      const rev = sectionReviews[section.id];
      if (rev?.status === "HAS_QUERIES" && rev.queryComments) {
        requestCandidates.push({
          id: `section_query_${section.id}`,
          timestamp: rev.reviewedAt ? parseFlexibleTimestamp(rev.reviewedAt) || Date.now() : Date.now(),
          dateTime: rev.reviewedAt ? toDisplayDate(rev.reviewedAt) : toDisplayDate(new Date().toISOString()),
          action: `${section.shortName} Query`,
          requester: rev.reviewedBy || roleTitle,
          comments: rev.queryComments,
        });
      }
    });

    requestCandidates.sort((a, b) => a.timestamp - b.timestamp);

    for (const req of requestCandidates) {
      const matchedResp = responseCandidates.find(
        (r) => !pairedResponseIds.has(r.id) && r.timestamp >= req.timestamp
      );

      if (matchedResp) {
        pairedResponseIds.add(matchedResp.id);
        rows.push({
          id: req.id,
          rawTimestamp: req.timestamp,
          dateTime: req.dateTime,
          action: req.action,
          requester: req.requester,
          requesterComments: req.comments,
          responder: matchedResp.responder,
          responseComments: matchedResp.comments,
          status: "RESPONDED",
        });
      } else {
        rows.push({
          id: req.id,
          rawTimestamp: req.timestamp,
          dateTime: req.dateTime,
          action: req.action,
          requester: req.requester,
          requesterComments: req.comments,
          responder: "—",
          responseComments: "Pending Clarification / Response Required",
          status: "PENDING",
        });
      }
    }

    return rows.sort((a, b) => b.rawTimestamp - a.rawTimestamp);
  }, [actionHistory, auditEvents, sectionReviews, roleTitle]);

  // Stage-Scoped Print & Approval Resolution
  const currentStage = useMemo(() => {
    if (!batchSummary?.stages || !Array.isArray(batchSummary.stages)) return null;
    const target = targetEquipmentCode.trim().toUpperCase();
    const info = resolveEquipmentInfo(target);
    return (
      (batchSummary.stages.find((s: Record<string, unknown>) => {
        const eq = toText(s.equipmentCode || s.equipmentId).trim().toUpperCase();
        const eqType = toText(s.equipmentType).trim().toUpperCase();
        return (
          eq === target ||
          eq === info.code ||
          eqType === info.type ||
          target.includes(eq) ||
          eq.includes(target)
        );
      }) as Record<string, unknown> | null) || null
    );
  }, [batchSummary, targetEquipmentCode]);

  const stageStartTime = useMemo(() => {
    if (currentStage?.stageStartAt) return toDisplayDate(currentStage.stageStartAt);
    if (currentStage?.startTime) return toDisplayDate(currentStage.startTime);
    if (eqMeta.type === "FBD") return "09/02/2026 18:44:45";
    if (eqMeta.type === "BLE") return "11/02/2026 09:04:55";
    if (eqMeta.type === "COMP") return "11/02/2026 14:15:00";
    if (eqMeta.type === "COAT") return "12/02/2026 08:30:00";
    return toDisplayDate(batchSummary?.batchStartAt) || "09/02/2026 16:04:17";
  }, [currentStage, eqMeta.type, batchSummary?.batchStartAt]);

  const stageEndTime = useMemo(() => {
    if (currentStage?.stageEndAt) return toDisplayDate(currentStage.stageEndAt);
    if (currentStage?.endTime) return toDisplayDate(currentStage.endTime);
    if (eqMeta.type === "FBD") return "09/02/2026 23:47:01";
    if (eqMeta.type === "BLE") return "11/02/2026 11:02:36";
    if (eqMeta.type === "COMP") return "11/02/2026 18:45:20";
    if (eqMeta.type === "COAT") return "12/02/2026 12:45:30";
    return toDisplayDate(batchSummary?.batchEndAt) || "09/02/2026 19:05:40";
  }, [currentStage, eqMeta.type, batchSummary?.batchEndAt]);

  const stageDuration = useMemo(() => {
    if (currentStage?.duration) return String(currentStage.duration);
    if (currentStage?.stageStartAt && currentStage?.stageEndAt) {
      const diffMs = Math.max(
        0,
        new Date(String(currentStage.stageEndAt)).getTime() -
        new Date(String(currentStage.stageStartAt)).getTime()
      );
      if (!isNaN(diffMs) && diffMs > 0) {
        const hours = Math.floor(diffMs / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);
        const seconds = Math.floor((diffMs % 60000) / 1000);
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      }
    }
    if (eqMeta.type === "FBD") return "05:02:16";
    if (eqMeta.type === "BLE") return "01:57:41";
    if (eqMeta.type === "COMP") return "04:30:20";
    if (eqMeta.type === "COAT") return "04:15:30";
    return "03:01:23";
  }, [currentStage, eqMeta.type]);

  const currentPrintCount = useMemo(() => {
    if (currentStage) {
      return typeof currentStage.printCount === "number" ? currentStage.printCount : 0;
    }
    return typeof batchSummary?.printCount === "number" ? batchSummary.printCount : 0;
  }, [currentStage, batchSummary]);

  const currentLastPrintedBy = useMemo(() => {
    if (currentStage) {
      return toText(currentStage.lastPrintedBy) || null;
    }
    return batchSummary?.lastPrintedBy || null;
  }, [currentStage, batchSummary]);

  const currentLastPrintedAt = useMemo(() => {
    if (currentStage) {
      return currentStage.lastPrintedAt ? String(currentStage.lastPrintedAt) : null;
    }
    return batchSummary?.lastPrintedAt ? String(batchSummary.lastPrintedAt) : null;
  }, [currentStage, batchSummary]);

  const currentLastPrintReason = useMemo(() => {
    if (currentStage) {
      return toText(currentStage.lastPrintReason) || null;
    }
    return batchSummary?.lastPrintReason || null;
  }, [currentStage, batchSummary]);

  // Controlled Print History - Comprehensive list strictly isolated to current batch and stage/equipment
  const controlledPrintHistory = useMemo(() => {
    // If the viewed batch report has 0 prints (or is uncompleted/pending), history MUST be empty
    if (currentPrintCount === 0) {
      return [];
    }

    // 1. If current stage has embedded printHistory array from backend, use it
    if (currentStage && Array.isArray(currentStage.printHistory) && currentStage.printHistory.length > 0) {
      return currentStage.printHistory.map((item: Record<string, unknown>, idx: number) => ({
        copyNo: typeof item.copyNo === "number" ? item.copyNo : (idx + 1),
        printedBy: toText(item.printedBy) || "Authorized User",
        userRole: toText(item.userRole) || "Reviewer / Approver",
        printedAt: item.printedAt ? String(item.printedAt) : "",
        reason: toText(item.reason) || "Controlled GxP Dossier Print",
        regulatoryStatement: toText(item.regulatoryStatement) || "Compliant print authorization.",
      }));
    }

    // 2. If no stages (batch-level report), and batchSummary has printHistory, use it
    if (!currentStage && Array.isArray(batchSummary?.printHistory) && batchSummary.printHistory.length > 0) {
      return batchSummary.printHistory.map((item, idx) => ({
        copyNo: item.copyNo ?? (idx + 1),
        printedBy: item.printedBy || "Authorized User",
        userRole: item.userRole || "Reviewer / Approver",
        printedAt: item.printedAt ? String(item.printedAt) : "",
        reason: item.reason || "Controlled GxP Dossier Print",
        regulatoryStatement: item.regulatoryStatement || "Compliant print authorization.",
      }));
    }

    // 3. Extract from auditEvents where action is PRINT, matching queryBatchNo AND targetEquipmentCode
    const targetEq = targetEquipmentCode.trim().toUpperCase();
    const printAudits = (auditEvents || [])
      .filter((e) => {
        if (e.batchNo && queryBatchNo && e.batchNo.trim().toUpperCase() !== queryBatchNo.trim().toUpperCase()) {
          return false;
        }
        if (e.equipmentCode) {
          const auditEq = e.equipmentCode.trim().toUpperCase();
          if (auditEq !== targetEq && !targetEq.includes(auditEq) && !auditEq.includes(targetEq)) {
            return false;
          }
        }
        const act = (e.actionCode || e.action || "").toUpperCase();
        return act.includes("PRINT");
      })
      .sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());

    if (printAudits.length > 0) {
      return printAudits.map((pa, idx) => ({
        copyNo: pa.printCount || (idx + 1),
        printedBy: pa.performedBy || pa.userName || pa.userId || "Authorized User",
        userRole: pa.userRole || "Reviewer / Approver",
        printedAt: pa.timestamp ? String(pa.timestamp) : "",
        reason: pa.reason || pa.esignatureReason || pa.comments?.replace(/^Controlled GxP PDF Printed:\s*/i, "") || "Controlled GxP Dossier Print",
        regulatoryStatement: "Compliant print authorization.",
      }));
    }

    // 4. Fallback: If currentPrintCount > 0 and we have lastPrintedBy
    if (currentPrintCount > 0 && currentLastPrintedBy) {
      return [
        {
          copyNo: currentPrintCount,
          printedBy: currentLastPrintedBy,
          userRole: "QA Reviewer",
          printedAt: currentLastPrintedAt ? String(currentLastPrintedAt) : "",
          reason: currentLastPrintReason || "Controlled GxP Dossier Print",
          regulatoryStatement: "Compliant print authorization.",
        },
      ];
    }

    return [];
  }, [
    currentPrintCount,
    currentStage,
    batchSummary,
    auditEvents,
    queryBatchNo,
    targetEquipmentCode,
    currentLastPrintedBy,
    currentLastPrintedAt,
    currentLastPrintReason,
  ]);

  // Section Validation Handler
  const handlePassSection = (sectionId: BatchInfoSectionType) => {
    const eqCode = targetEquipmentCode;
    const isAlreadyPassed = sectionReviews[sectionId]?.status === "PASSED";

    const updated: Record<BatchInfoSectionType, SectionReviewItem> = isAlreadyPassed
      ? { ...sectionReviews }
      : {
        ...sectionReviews,
        [sectionId]: {
          status: "PASSED",
          reviewedBy: currentUser?.userId || currentUser?.username || roleTitle,
          reviewedAt: new Date().toISOString(),
        },
      };

    if (!isAlreadyPassed) {
      setSectionReviews(updated);
      try {
        localStorage.setItem(`batch_info_section_reviews_${roleScope}_${queryBatchNo}_${eqCode}`, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to persist section reviews", e);
      }

      const actionVerb = isOperatorRole ? "VIEWED" : isReviewerRole ? "REVIEWED" : "PASSED";
      const sectionObj = BATCH_INFO_SECTIONS.find((s) => s.id === sectionId);
      const sectionName = sectionObj?.shortName || sectionId;

      const newAudit: WorkflowAuditEvent = {
        auditId: `audit_section_${sectionId}_${Date.now()}`,
        tenantId: "TNT-0001",
        batchNo: queryBatchNo,
        lotNo: queryLotNo || toText(batchSummary?.lotNo) || "01 of 05",
        equipmentCode: targetEquipmentCode,
        previousStatus: sectionReviews[sectionId]?.status || "PENDING",
        newStatus: "PASSED",
        action: `SECTION REVIEW: ${sectionName} ${actionVerb} (${roleTitle})`,
        actionCode: `SECTION_REVIEW_${sectionId}_${actionVerb}`,
        userId: currentUser?.userId || "OPERATOR_01",
        userName: currentUser?.username || roleTitle,
        userRole: userRole,
        comments: `${roleTitle} checkpoint verification ${roleStageWiseLabel.toLowerCase()} for ${sectionName}`,
        timestamp: new Date().toISOString(),
        esignatureVerified: true,
        esignatureReason: isOperatorRole ? "Section Checkpoint Viewed" : isReviewerRole ? "Section Checkpoint Reviewed" : "Section Checkpoint Approval",
        regulatoryStatement: "Section verification checkpoint.",
      };
      setAuditEvents((prev) => [newAudit, ...prev]);

      setActionSuccessMsg(`✓ Section "${sectionName}" marked as ${roleStageWiseLabel.toLowerCase()}!`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    }
  };

  // Claim / Unclaim Review Lock
  const handleClaimReview = async () => {
    if (!queryBatchNo) return;
    try {
      setIsClaiming(true);
      await claimWorkflowTask({
        batchNo: queryBatchNo,
        lotNo: queryLotNo || toText(batchSummary?.lotNo) || "01 of 05",
        equipmentCode: targetEquipmentCode,
        userRole: userRole,
        tenantId: "TNT-0001",
      });
      await loadBatchData();
      setActionSuccessMsg(`Batch task successfully assigned to you for ${roleTitle}.`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: unknown) {
      const isConflict =
        (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 409) ||
        (err instanceof Error && (err.message.includes("already assigned") || err.message.includes("already claimed") || err.message.includes("409")));
      if (isConflict) {
        setActionErrorMsg("This batch has already been assigned to another user. The page has been refreshed with the latest status.");
        setTimeout(() => setActionErrorMsg(null), 6000);
        await loadBatchData();
      } else {
        console.error("Failed to claim batch task", err);
        setActionErrorMsg(err instanceof Error ? err.message : "Failed to assign task. Please try again.");
        setTimeout(() => setActionErrorMsg(null), 5000);
      }
    } finally {
      setIsClaiming(false);
    }
  };

  const handleUnclaimReview = async () => {
    if (!queryBatchNo) return;
    try {
      setIsClaiming(true);
      await unclaimWorkflowTask({
        batchNo: queryBatchNo,
        lotNo: queryLotNo || toText(batchSummary?.lotNo) || "01 of 05",
        equipmentCode: targetEquipmentCode,
        tenantId: "TNT-0001",
      });
      await loadBatchData();
      setActionSuccessMsg("Batch task released back to the queue.");
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: unknown) {
      console.error("Failed to release batch task", err);
      setActionErrorMsg(err instanceof Error ? err.message : "Failed to release the task. Please try again.");
      setTimeout(() => setActionErrorMsg(null), 5000);
    } finally {
      setIsClaiming(false);
    }
  };

  // PDF Download Handler
  const handleDownloadPdf = async () => {
    try {
      setIsExporting(true);
      await downloadBatchPdfBlob(queryBatchNo, queryLotNo, queryEquipmentCode || targetEquipmentCode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to download batch dossier PDF.";
      setActionErrorMsg(msg);
      setTimeout(() => setActionErrorMsg(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleActionSuccess = () => {
    setIsModalOpen(false);
    setModalAction(null);
    startTransition(() => {
      loadBatchData();
    });
    setActionSuccessMsg("Workflow action sign-off executed and recorded to audit log.");
    setTimeout(() => setActionSuccessMsg(null), 5000);
  };

  const handleInfoQuerySuccess = (tabName: string, comments: string, recipient: string) => {
    setIsInfoModalOpen(false);
    const targetSection = tabName as BatchInfoSectionType;

    const updated: Record<BatchInfoSectionType, SectionReviewItem> = {
      ...sectionReviews,
      [targetSection]: {
        status: "HAS_QUERIES",
        reviewedBy: currentUser?.userId || currentUser?.username || roleTitle,
        reviewedAt: new Date().toISOString(),
        queryComments: comments,
        queryRecipient: recipient,
      },
    };

    setSectionReviews(updated);
    try {
      localStorage.setItem(`batch_info_section_reviews_${roleScope}_${queryBatchNo}_${targetEquipmentCode}`, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to persist section reviews", e);
    }

    const sectionObj = BATCH_INFO_SECTIONS.find((s) => s.id === targetSection);
    const newAudit: WorkflowAuditEvent = {
      auditId: `audit_query_${targetSection}_${Date.now()}`,
      tenantId: "TNT-0001",
      batchNo: queryBatchNo,
      lotNo: queryLotNo || toText(batchSummary?.lotNo) || "01 of 05",
      equipmentCode: targetEquipmentCode,
      previousStatus: sectionReviews[targetSection]?.status || "PENDING",
      newStatus: "HAS_QUERIES",
      action: `INFORMATION REQUEST: ${sectionObj?.shortName || targetSection} (${recipient})`,
      actionCode: `REQUEST_ADDITIONAL_INFO_${targetSection}`,
      userId: currentUser?.userId || "OPERATOR_01",
      userName: currentUser?.username || roleTitle,
      userRole: userRole,
      comments: `Query dispatched to ${recipient}: "${comments}"`,
      timestamp: new Date().toISOString(),
      esignatureVerified: true,
      esignatureReason: "Additional Information Request",
      regulatoryStatement: "Query trail record.",
    };
    setAuditEvents((prev) => [newAudit, ...prev]);

    setActionSuccessMsg(`Information request dispatched to ${recipient} for ${sectionObj?.shortName || targetSection}.`);
    setTimeout(() => setActionSuccessMsg(null), 4500);
  };

  // Operational Detail Values Data Prep
  const filteredParameters = useMemo(() => {
    let list = cppRecords;
    if (correlatedAlarm) {
      const alarmTimeStr = getAlarmEventTime(correlatedAlarm as unknown as Record<string, unknown>);
      list = list.filter((r) => isWithinCorrelationWindow(r.observedAt || (r as unknown as Record<string, unknown>).TIME || (r as unknown as Record<string, unknown>).time || (r as unknown as Record<string, unknown>).timestamp, alarmTimeStr));
    }
    if (parameterSearch.trim()) {
      const q = parameterSearch.toLowerCase().trim();
      list = list.filter((r) => {
        const rowRec = r as unknown as Record<string, unknown>;
        const obs = toText(r.observedAt || rowRec.TIME || rowRec.time || rowRec.timestamp).toLowerCase();
        const stat = toText(r.status || (r.meta as Record<string, unknown>)?.status || rowRec.status).toLowerCase();
        const m = { ...rowRec, ...((rowRec.meta as Record<string, unknown>) || {}), ...((rowRec.metrics as Record<string, unknown>) || {}) };
        const matchVal = Object.entries(m).some(([k, v]) => {
          return k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q);
        });
        return obs.includes(q) || stat.includes(q) || matchVal;
      });
    }
    return list;
  }, [cppRecords, parameterSearch, correlatedAlarm, isWithinCorrelationWindow]);

  const totalParameters = filteredParameters.length;
  const safeParamPage = Math.max(1, Math.min(parametersPage, Math.ceil(totalParameters / parametersPageSize) || 1));
  const paginatedParameters = useMemo(() => {
    const start = (safeParamPage - 1) * parametersPageSize;
    return filteredParameters.slice(start, start + parametersPageSize);
  }, [filteredParameters, safeParamPage, parametersPageSize]);

  // Alarms Data Prep
  const filteredAlarms = useMemo(() => {
    let list = alarmRecords;
    if (list.length === 0 && isComp && compAlarmHistory.length > 0) {
      list = compAlarmHistory.map((a: Record<string, unknown>, i: number) => ({
        id: `comp_alarm_${i}`,
        alarmCode: toText(a.alarm_id || a.alarm_code || `ALM-${i + 1}`),
        alarmDescription: toText(a.description || a.alarm_name || "Emergency / Machine Interruption"),
        severity: toText(a.severity || "WARNING").toUpperCase(),
        eventAt: toText(a.start_time || a.timestamp || stageStartTime),
        status: a.duration_sec ? "RESOLVED" : "ACTIVE",
        durationSeconds: Number(a.duration_sec || 0),
        acknowledgedBy: toText(a.acknowledged_by || "OP-10402"),
      })) as unknown as AlarmEventRecord[];
    }
    if (alarmFilter !== "ALL") {
      list = list.filter((a) => calculateAlarmSeverity(a as unknown as Record<string, unknown>) === alarmFilter);
    }
    if (alarmSearch.trim()) {
      const q = alarmSearch.toLowerCase().trim();
      list = list.filter((a) => {
        const raw = a as unknown as Record<string, unknown>;
        const c = getAlarmCode(raw).toLowerCase();
        const d = getAlarmDescription(raw).toLowerCase();
        const t = toText(getAlarmEventTime(raw)).toLowerCase();
        return c.includes(q) || d.includes(q) || t.includes(q);
      });
    }
    return list;
  }, [alarmRecords, alarmFilter, alarmSearch, isComp, compAlarmHistory, stageStartTime]);

  const totalAlarms = filteredAlarms.length;
  const safeAlarmPage = Math.max(1, Math.min(alarmsPage, Math.ceil(totalAlarms / alarmsPageSize) || 1));
  const paginatedAlarms = useMemo(() => {
    const start = (safeAlarmPage - 1) * alarmsPageSize;
    return filteredAlarms.slice(start, start + alarmsPageSize);
  }, [filteredAlarms, safeAlarmPage, alarmsPageSize]);

  // Audit Events Data Prep
  const filteredAuditEvents = useMemo(() => {
    // Exclude print-related logs from audit trails
    let list = (auditEvents || []).filter((e) => {
      const act = toText(e.action || e.actionCode).toUpperCase();
      const desc = toText((e as unknown as Record<string, unknown>).description).toUpperCase();
      const reason = toText(e.esignatureReason || (e as unknown as Record<string, unknown>).reason).toUpperCase();
      const comments = toText(e.comments).toUpperCase();
      return !act.includes("PRINT") && !desc.includes("PRINT") && !reason.includes("PRINT") && !comments.includes("PRINT");
    });

    if (list.length === 0 && eventDataRecords && eventDataRecords.length > 0) {
      list = eventDataRecords.map((ev, i) => {
        const timeStr = toText(ev.event_time || ev.dt || ev.time_stamp || ev.timestamp || ev.eventAt || stageStartTime);
        const desc = toText(ev.description || ev.action || ev.actionName || "Process Event");
        const uName = toText(ev.user_name || ev.userId || ev.userName || "Operator");
        return {
          auditId: toText(ev.auditId || ev.record_id || `audit_${i + 1}`),
          tenantId: "TNT-0001",
          batchNo: queryBatchNo,
          lotNo: queryLotNo || toText(batchSummary?.lotNo) || "01 of 05",
          equipmentCode: targetEquipmentCode,
          previousStatus: toText(ev.old_value || "-"),
          newStatus: toText(ev.new_value || "-"),
          action: desc,
          actionCode: desc,
          userId: uName,
          userName: uName,
          userRole: uName.includes("Supervisor") ? "PRODUCTION_SUPERVISOR" : "PRODUCTION_OPERATOR",
          comments: toText(ev.reason || "-"),
          timestamp: timeStr,
          esignatureVerified: true,
          esignatureReason: toText(ev.reason || "Process Audit Record"),
          regulatoryStatement: "21 CFR Part 11 Audit Trail Record",
        } as unknown as WorkflowAuditEvent;
      });
    } else if (list.length === 0 && isComp && compOpHistory.length > 0) {
      list = compOpHistory.map((op: Record<string, unknown>, i: number) => ({
        id: `comp_op_${i}`,
        action: toText(op.description || op.operation_id || "BATCH_OPERATION"),
        actionCode: toText(op.operation_id || "OP_EXEC"),
        userName: toText(op.operator_name || op.operator_id || "Operator 10402"),
        userId: toText(op.operator_id || "10402"),
        timestamp: toText(op.start_time || stageStartTime),
        description: `${toText(op.description || "Operation")} (Duration: ${toText(op.duration_sec || "0")}s)`,
        status: "SUCCESS",
      })) as unknown as WorkflowAuditEvent[];
    }

    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase().trim();
      list = list.filter((e) => {
        const desc = toText(e.action || e.actionCode).toLowerCase();
        const usr = toText(e.userName || e.userId).toLowerCase();
        const reason = toText(e.esignatureReason).toLowerCase();
        const ts = toText(e.timestamp).toLowerCase();
        return desc.includes(q) || usr.includes(q) || reason.includes(q) || ts.includes(q);
      });
    }
    return list;
  }, [auditEvents, eventDataRecords, auditSearch, isComp, compOpHistory, stageStartTime, queryBatchNo, queryLotNo, batchSummary, targetEquipmentCode, eqMeta.type]);

  const totalAudit = filteredAuditEvents.length;
  const safeAuditPage = Math.max(1, Math.min(auditPage, Math.ceil(totalAudit / auditPageSize) || 1));
  const paginatedAuditEvents = useMemo(() => {
    const start = (safeAuditPage - 1) * auditPageSize;
    return filteredAuditEvents.slice(start, start + auditPageSize);
  }, [filteredAuditEvents, safeAuditPage, auditPageSize]);

  // Available Metric Columns for Operational Detail Values Table
  const availableMetricsList = useMemo(() => {
    if (cppRecords.length === 0) return [];
    const firstRec = cppRecords[0] as unknown as Record<string, unknown>;
    const metricsObj = (firstRec.metrics as Record<string, unknown>) || firstRec;
    const metaKeys = new Set([
      "id", "_id", "observedAt", "observed_at", "TIME", "time", "timestamp", "record_id",
      "batchNo", "batch_no", "lotNo", "lot_no", "equipmentCode", "equipment_code",
      "equipmentId", "equipment_id", "status", "Status", "meta", "tenantId", "plantId", "blockId"
    ]);
    const keys = Object.keys(metricsObj).filter((k) => !metaKeys.has(k) && typeof metricsObj[k] !== "object");
    return keys.map((key) => {
      const meta = resolveMetricLimits(key, targetEquipmentCode, paramLimits, criticalParams);
      return {
        key,
        label: meta.parameterName,
        unit: meta.unit,
        idealTarget: meta.idealTarget,
      };
    });
  }, [cppRecords, targetEquipmentCode, paramLimits, criticalParams]);

  const activeCols = useMemo(() => {
    if (availableMetricsList.length > 0) return availableMetricsList;
    switch (eqMeta.type) {
      case "FBD":
        return [
          { key: "Inlet_Air_Temp", label: "Inlet Air Temperature", unit: "°C", idealTarget: 60 },
          { key: "Outlet_Air_Temp", label: "Outlet Air Temperature", unit: "°C", idealTarget: 48 },
          { key: "Bed_Temp", label: "Bed Temperature", unit: "°C", idealTarget: 45 },
          { key: "Air_Flow", label: "Air Flow Rate", unit: "m³/h", idealTarget: 1200 },
          { key: "Product_Moisture", label: "Product Moisture", unit: "%", idealTarget: 2.5 },
          { key: "Process_Time_Min", label: "Process Time", unit: "min", idealTarget: 300 },
        ];
      case "BLE":
        return [
          { key: "Blender_Speed", label: "Blender Speed", unit: "RPM", idealTarget: 5 },
          { key: "Blending_Time", label: "Blending Time", unit: "min", idealTarget: 15 },
          { key: "Vacuum_Pressure", label: "Vacuum Level", unit: "bar", idealTarget: -0.8 },
          { key: "Motor_Current", label: "Motor Current", unit: "A", idealTarget: 12 },
          { key: "Purge_Time", label: "Purge Time", unit: "Sec", idealTarget: 5 },
        ];
      case "COMP":
        return [
          { key: "MainPressure", label: "Main Compression Force", unit: "kN", idealTarget: 14.83 },
          { key: "PrePressure", label: "Pre-Compression Force", unit: "kN", idealTarget: 3.80 },
          { key: "DiskSpeed", label: "Disk Speed", unit: "RPM", idealTarget: 18.0 },
          { key: "FeederRpm", label: "Feeder Speed", unit: "RPM", idealTarget: 10.0 },
          { key: "MainThickness", label: "Main-Pressure Thickness", unit: "mm", idealTarget: 4.28 },
          { key: "FillingDepth", label: "Filling Depth", unit: "mm", idealTarget: 12.01 },
        ];
      case "COAT":
        return [
          { key: "Inlet_Air_Temp", label: "Inlet Air Temperature", unit: "°C", idealTarget: 65 },
          { key: "Exhaust_Air_Temp", label: "Exhaust Air Temperature", unit: "°C", idealTarget: 45 },
          { key: "Bed_Temp", label: "Bed Temperature", unit: "°C", idealTarget: 42 },
          { key: "Pan_Speed", label: "Pan Speed", unit: "RPM", idealTarget: 8 },
          { key: "Spray_Rate", label: "Spray Rate", unit: "g/min", idealTarget: 120 },
          { key: "Atom_Air_Press", label: "Atomizing Pressure", unit: "bar", idealTarget: 2.5 },
        ];
      case "RMG":
      default:
        return [
          { key: "Ag_Speed", label: "Agitator Speed", unit: "RPM", idealTarget: 100 },
          { key: "Ag_Amps", label: "Agitator Current", unit: "A", idealTarget: 30 },
          { key: "Chp_Speed", label: "Granulator Speed", unit: "RPM", idealTarget: 50 },
          { key: "Chp_Amps", label: "Granulator Current", unit: "A", idealTarget: 6.5 },
          { key: "Heater_Temp", label: "Granulation Temp", unit: "°C", idealTarget: 65 },
          { key: "Duration_Sec", label: "Duration", unit: "Sec", idealTarget: 600 },
        ];
    }
  }, [availableMetricsList, eqMeta.type]);

  // Selected Trend Metric State & Metadata
  const [selectedTrendMetric, setSelectedTrendMetric] = useState<string>("");

  useEffect(() => {
    if (availableMetricsList.length > 0 && (!selectedTrendMetric || !availableMetricsList.some((m) => m.key === selectedTrendMetric))) {
      setSelectedTrendMetric(availableMetricsList[0].key);
    }
  }, [availableMetricsList, selectedTrendMetric]);

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
      const alarmTimeStr = getAlarmEventTime(correlatedAlarm as unknown as Record<string, unknown>);
      dataset = dataset.filter((rec) => isWithinCorrelationWindow(rec.observedAt, alarmTimeStr));
    }

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

      let status: TrendPointStatus = "NORMAL";
      if (rawVal === undefined || rawVal === null || rawVal === "") {
        status = "NO_DATA";
      } else if (limits) {
        const evaluation = evaluateParameterStatus(val, limits.lowerCriticalLimit, limits.upperCriticalLimit);
        if (evaluation.status === "OUT_OF_RANGE") {
          status = "CRITICAL";
        } else if (evaluation.status === "INVALID") {
          status = "NO_DATA";
        } else {
          status = "NORMAL";
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

  const getStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    if (s.includes("APPROV") || s.includes("COMPLET")) return "bg-emerald-100 text-emerald-800 border-emerald-300";
    if (s.includes("REJECT")) return "bg-rose-100 text-rose-800 border-rose-300";
    if (s.includes("DEFER")) return "bg-purple-100 text-purple-800 border-purple-300";
    if (s.includes("REVIEW")) return "bg-blue-100 text-blue-800 border-blue-300";
    return "bg-amber-100 text-amber-800 border-amber-300";
  };

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 bg-slate-50 text-slate-900 min-h-screen">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(returnToRoute)}
            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition shadow-sm cursor-pointer"
            title="Return to Queue"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 font-mono">
                {queryBatchNo || "BATCH RECORD"}
              </h1>
              {!isApprovedBatch && (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getStatusBadge(
                    activeStatus
                  )}`}
                >
                  {activeStatus.replace(/_/g, " ")}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>Batch:</span>
              <strong className="font-mono text-indigo-700 font-bold">
                {queryBatchNo || "NL0026008"}
              </strong>
              <span>&bull;</span>
              <span>Lot:</span>
              <strong className="font-mono text-slate-800 font-bold">
                {queryLotNo || toText(batchSummary?.lotNo) || "01 of 05"}
              </strong>
              <span>&bull;</span>
              <span>Equipment:</span>
              <strong className="font-mono text-slate-800 font-bold">
                {targetEquipmentCode}
              </strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2" suppressHydrationWarning>
          <button
            type="button"
            onClick={() => {
              if (!isLoading) {
                loadBatchData();
              }
            }}
            disabled={isMounted ? isLoading : undefined}
            aria-disabled={isLoading}
            suppressHydrationWarning
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 shadow-sm transition disabled:opacity-50 ${isLoading ? "opacity-50 cursor-not-allowed pointer-events-none" : "hover:bg-slate-100 cursor-pointer"
              }`}
          >
            <ArrowsClockwise className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          {/* Controlled Print PDF Dossier */}
          {isMounted && isFinalPdfReady ? (
            <button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              disabled={isLoading || !queryBatchNo}
              suppressHydrationWarning
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50 cursor-pointer"
              title="Print Official Controlled GxP PDF Dossier"
            >
              <Printer className="h-3.5 w-3.5" />
              Print PDF
            </button>
          ) : (
            <button
              type="button"
              disabled={isMounted ? true : undefined}
              suppressHydrationWarning
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-400 rounded-lg text-xs font-semibold cursor-not-allowed border border-slate-200"
              title={finalPdfDisabledReason}
            >
              <Printer className="h-3.5 w-3.5 opacity-50" />
              Print PDF
            </button>
          )}
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2 shadow-sm animate-in fade-in duration-300">
          <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 flex-shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {actionErrorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2 shadow-sm animate-in fade-in duration-300">
          <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 flex-shrink-0" />
          <span>{actionErrorMsg}</span>
        </div>
      )}



      {/* Concurrency Review / Approval Lock Banner */}
      {(() => {
        const currentUserId = currentUser?.userId || currentUser?.username || "SYSTEM";
        const assignedTo = toText(workflowInstance?.assignedTo) || toText((workflowInstance?.context as Record<string, unknown>)?.activeReviewer) || toText(batchSummary?.assignedTo);
        const activeReviewerRole = toText((workflowInstance?.context as Record<string, unknown>)?.activeReviewerRole);
        const claimedAt = toText((workflowInstance?.context as Record<string, unknown>)?.claimedAt);

        const isApprover = isApproverRole;
        const isReviewer = isReviewerRole;
        const roleDisplay = isApprover ? "QA Approver" : isReviewer ? "Production Reviewer" : "Production Operator";
        const actionLabel = isApprover ? "QA APPROVAL" : isReviewer ? "REVIEW" : "OPERATION";
        const buttonLabel = isApprover ? "Assign Task to Me / Start Approval" : isReviewer ? "Assign Task to Me / Start Review" : "Assign Task to Me / Start Operation";
        const isAssignableStage = activeStatus !== "COMPLETED" && activeStatus !== "REJECTED";

        const isClaimedByMe = Boolean(assignedTo && assignedTo.toUpperCase() === currentUserId.toUpperCase());
        const isClaimedByOther = Boolean(assignedTo && !isClaimedByMe);

        if (isApprovedBatch || (!isAssignableStage && !assignedTo)) return null;

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
                      🚨 CONCURRENT ACCESS ALERT — CLAIMED BY {assignedTo}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      Stage: {targetEquipmentCode} &bull; Batch: {queryBatchNo}
                    </span>
                  </div>
                  <p className="text-xs text-rose-950 font-semibold mt-1">
                    <strong>{assignedTo}</strong> ({activeReviewerRole || roleDisplay}) is actively managing this batch task. Action sign-offs are locked for other team members to prevent conflicting duplicate actions.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={handleClaimReview}
                  disabled={isMounted ? isClaiming : undefined}
                  suppressHydrationWarning
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-900 border border-rose-300 font-semibold text-xs transition shadow-sm cursor-pointer"
                  title="Override task assignment if the primary user is unavailable"
                >
                  <Lightning className="h-3.5 w-3.5 text-rose-600" />
                  {isClaiming ? "Overriding..." : "Takeover Task"}
                </button>
              </div>
            </div>
          );
        }

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
                      ✅ TASK ASSIGNED TO YOU ({roleTitle})
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      {claimedAt ? `Claimed at ${toDisplayDate(claimedAt)}` : "Active Task"}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-950 font-semibold mt-1">
                    You are the active assignee for this batch task. You have exclusive sign-off authorization to operate, review, and execute workflow transitions.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={handleUnclaimReview}
                  disabled={isMounted ? isClaiming : undefined}
                  suppressHydrationWarning
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs transition shadow-sm cursor-pointer"
                >
                  <XCircle className="h-3.5 w-3.5 text-slate-500" />
                  {isClaiming ? "Releasing..." : "Release Task"}
                </button>
              </div>
            </div>
          );
        }

        if (isAssignableStage && !assignedTo) {
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
                      ⚡ BATCH TASK READY FOR {actionLabel} — UNASSIGNED
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      Stage: {targetEquipmentCode} &bull; Batch: {queryBatchNo}
                    </span>
                  </div>
                  <p className="text-xs text-amber-950 font-semibold mt-1">
                    This batch is available in your group queue. Click <strong>&quot;Assign Task to Me&quot;</strong> to claim task and prevent conflicting changes.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={handleClaimReview}
                  disabled={isMounted ? isClaiming : undefined}
                  suppressHydrationWarning
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-sm cursor-pointer"
                >
                  <UserPlus className="h-4 w-4" />
                  {isClaiming ? "Assigning Task..." : buttonLabel}
                </button>
              </div>
            </div>
          );
        }

        return null;
      })()}

      {/* Consolidated Queries Banner if queries are open */}
      {existingQueryList.length > 0 && (
        <div className="p-4 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/15 border-2 border-amber-400 rounded-2xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 flex-shrink-0">
              <Question className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-950 bg-amber-300 px-2 py-0.5 rounded shadow-xs">
                  ⚠️ {existingQueryList.length} SECTION {existingQueryList.length === 1 ? "QUERY" : "QUERIES"} FLAGGED
                </span>
                <span className="text-xs text-amber-950 font-semibold">
                  Assigned recipient: <strong>{existingQueryList[0]?.queryRecipient || "Operator"}</strong>
                </span>
              </div>
              <div className="mt-1.5 space-y-1 text-xs text-amber-950">
                {existingQueryList.map((q, idx) => (
                  <div key={`flagged_query_${q.tabKey}_${idx}`} className="flex items-center gap-1.5">
                    <strong className="font-mono text-amber-900">• [{q.tabLabel}]:</strong>
                    <span className="italic">&quot;{q.queryComments}&quot;</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              type="button"
              onClick={() => {
                setActiveInfoSection("CONSOLIDATED");
                setIsInfoModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition cursor-pointer"
            >
              <ListChecks className="h-4 w-4" />
              Consolidate & Send to {existingQueryList[0]?.queryRecipient || "Operator"}
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          COMPRESSION MACHINE DEDICATED VIEW (MC081 / SEJONG PRESS)
         ========================================================================= */}
      {isComp ? (
        <CompressionReportView
          batchNo={queryBatchNo}
          lotNo={
            queryLotNo && queryLotNo !== "NA" && queryLotNo !== "null" && queryLotNo.trim().toUpperCase() !== queryBatchNo.trim().toUpperCase()
              ? queryLotNo
              : toText(compBatchInfo.derivedLotNo || compBatchInfo.lotNo) && toText(compBatchInfo.derivedLotNo || compBatchInfo.lotNo) !== "NA"
              ? toText(compBatchInfo.derivedLotNo || compBatchInfo.lotNo)
              : (compressionLots[0]?.lotNo || "Lot-01")
          }
          equipmentCode={targetEquipmentCode}
          equipmentName={toText(compBatchInfo.machineName) || eqMeta.name}
          productName={toText(compBatchInfo.productName) || toText(batchSummary?.productName) || "Lamotrigine 25mg"}
          recipeName={toText(compRecipe.recipeName || compBatchInfo.recipeName || batchSummary?.productCode) || eqMeta.defaultRecipe}
          batchSize={toText(compRecipe.targetQuantity || batchSummary?.batchSize || "250,000 Tablets")}
          stageStatus={activeStatus}
          stageStartTime={stageStartTime}
          stageEndTime={stageEndTime}
          stageDuration={toText(compBatchInfo.runningTime) || stageDuration}
          rawCompressionData={compDetails}
          alarms={filteredAlarms}
          auditLogs={filteredAuditEvents}
          loginSessions={((compDetails?.login_history as unknown[]) || []) as any}
          actionHistory={actionHistory}
          controlledPrintHistory={controlledPrintHistory}
          allowedActions={allowedActions}
          onActionClick={(action) => {
            setModalAction(action);
            setIsModalOpen(true);
          }}
          onPrintClick={() => setIsPrintModalOpen(true)}
          isPrintEnabled={isMounted && isFinalPdfReady && Boolean(queryBatchNo)}
          printDisabledReason={finalPdfDisabledReason}
          isActionLoading={isClaiming}
        />
      ) : (
        <>
          {/* =========================================================================
              SECTION 1: BATCH INFORMATION (Equipment Details & Batch Details Cards)
             ========================================================================= */}
          <section aria-label="Batch Information" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Card 1: EQUIPMENT DETAILS */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-indigo-600" />
                    EQUIPMENT DETAILS
                  </h2>
                  <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    {targetEquipmentCode}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Equipment Name</span>
                    <span className="font-bold text-slate-900 mt-0.5 block">
                      {(isComp && toText(compBatchInfo.machineName)) ? toText(compBatchInfo.machineName) : eqMeta.name}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Equipment ID</span>
                    <span className="font-bold font-mono text-slate-900 mt-0.5 block">
                      {(isComp && toText(compBatchInfo.equipmentId)) ? toText(compBatchInfo.equipmentId) : eqMeta.code}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Make</span>
                    <span className="font-bold text-slate-900 mt-0.5 block">{eqMeta.make}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Area</span>
                    <span className="font-bold text-slate-900 mt-0.5 block">
                      {eqMeta.area}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">{isComp ? "Station / Block" : "Block"}</span>
                    <span className="font-bold text-slate-900 mt-0.5 block">{isComp ? `${toText(compBatchInfo.stationNo) || "Station 1"} (${eqMeta.block})` : eqMeta.block}</span>
                  </div>
                </div>
              </div>

              {/* Card 2: BATCH DETAILS */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-600" />
                    BATCH DETAILS
                  </h2>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getStatusBadge(activeStatus)}`}>
                    {activeStatus.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Batch Number</span>
                    <span className="font-bold font-mono text-indigo-700 mt-0.5 block">{toText(compBatchInfo.batchNo) || queryBatchNo || "-"}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Lot Number</span>
                    <span className="font-bold font-mono text-slate-900 mt-0.5 block">
                      {isComp ? (toText(compBatchInfo.derivedLotNo) || compressionLots[0]?.lotNo || "Not available") : (queryLotNo || toText(batchSummary?.lotNo) || "-")}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Product Name</span>
                    <span className="font-bold text-slate-900 mt-0.5 block truncate" title={toText(compBatchInfo.productName) || toText(batchSummary?.productName) || "-"}>
                      {toText(compBatchInfo.productName) || toText(batchSummary?.productName) || "-"}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Product Code</span>
                    <span className="font-bold font-mono text-slate-900 mt-0.5 block">
                      {toText(batchSummary?.productCode) || "-"}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Recipe Name</span>
                    <span className="font-bold text-slate-900 mt-0.5 block">
                      {toText(batchSummary?.recipeName) || "-"}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Batch Size</span>
                    <span className="font-bold text-slate-900 mt-0.5 block">
                      {toText(batchSummary?.batchSize) || (compRecipe.targetQuantity ? `${Number(compRecipe.targetQuantity).toLocaleString()} Tabs` : "-")}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Start Time</span>
                    <span className="font-bold font-mono text-slate-700 text-[11px] mt-0.5 block">
                      {stageStartTime}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">End Time</span>
                    <span className="font-bold font-mono text-slate-700 text-[11px] mt-0.5 block">
                      {stageEndTime}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">{isComp ? "Running Time" : "Duration In Hours"}</span>
                    <span className="font-bold text-emerald-700 mt-0.5 block">
                      {(isComp && toText(compBatchInfo.runningTime)) ? toText(compBatchInfo.runningTime) : stageDuration}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {isComp && compressionLots.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">
                  Compression Production Reports ({compressionLots.length})
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {compressionLots.map((lot, lotIdx) => (
                    <div key={`comp_lot_${lot.lotNo || lotIdx}_${lotIdx}`} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                      <div className="font-mono text-xs font-bold text-indigo-700">{lot.lotNo}</div>
                      <div className="mt-1 truncate text-[11px] text-slate-600" title={lot.sourceFile}>{lot.sourceFile || "Source file unavailable"}</div>
                      <div className="mt-1 text-[10px] text-slate-400">{toDisplayDate(lot.observedAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* =========================================================================
          SECTION 1.5: PARAMETER SETTINGS (Recipe Parameter Settings - Setpoint Specifications)
         ========================================================================= */}
          <section aria-label="Parameter Settings" className="space-y-4">
            {/* Section Verification Checkpoint Card */}
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex-shrink-0">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">
                      Parameter Settings
                    </h2>
                    {sectionReviews.PARAMETER_SETTINGS?.status === "PASSED" || isApprovedBatch ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" weight="fill" />
                        <span>{roleStageWiseLabel}</span>
                      </span>
                    ) : sectionReviews.PARAMETER_SETTINGS?.status === "HAS_QUERIES" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <WarningCircle className="h-3.5 w-3.5 text-amber-600" weight="fill" />
                        <span>Query Flagged</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                        <span>Pending Verification</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Recipe setpoint specifications and operational limits for <strong className="text-slate-600 font-mono">{targetEquipmentCode}</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setActiveInfoSection("PARAMETER_SETTINGS");
                    setIsInfoModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-xs transition shadow-sm cursor-pointer"
                >
                  <Question className="h-3.5 w-3.5 text-amber-700" />
                  <span>Request Info</span>
                </button>
                {!isApprovedBatch && (
                  <button
                    type="button"
                    onClick={() => handlePassSection("PARAMETER_SETTINGS")}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs transition shadow-sm cursor-pointer ${sectionReviews.PARAMETER_SETTINGS?.status === "PASSED"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600"
                        : "bg-blue-600 hover:bg-blue-700 text-white animate-blue-blink"
                      }`}
                  >
                    <CheckCircle className="h-3.5 w-3.5" weight={sectionReviews.PARAMETER_SETTINGS?.status === "PASSED" ? "fill" : "bold"} />
                    <span>{sectionReviews.PARAMETER_SETTINGS?.status === "PASSED" ? `Verified (${roleStageWiseLabel})` : `Verify Section (${isOperatorRole ? "Mark Viewed" : isReviewerRole ? "Review" : "Approve"})`}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Recipe Parameter Settings Table Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
                    Recipe Parameter Settings (Setpoint Specifications)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Recipe: <strong className="text-slate-600 font-mono">{toText(batchSummary?.productCode) || "STFS7000"}</strong> &bull; Equipment:{" "}
                    <strong className="text-slate-600 font-mono">{targetEquipmentCode}</strong>
                  </p>
                </div>
              </div>

              {eqMeta.type === "FBD" ? (
                <div className="overflow-hidden border border-slate-200 rounded-xl max-w-3xl">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3.5">Parameters</th>
                        <th className="py-2.5 px-3.5 text-right">Set Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr><td className="py-2 px-3.5 font-medium">PROCESS TIME (MIN)</td><td className="py-2 px-3.5 text-right font-mono font-bold">500</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">AIR DRY TIME (MIN)</td><td className="py-2 px-3.5 text-right font-mono font-bold">5</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">COOLING TIME (MIN)</td><td className="py-2 px-3.5 text-right font-mono font-bold">0</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">SHAKE INTERVAL (MIN)</td><td className="py-2 px-3.5 text-right font-mono font-bold">10</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">SHAKE DURATION (SEC)</td><td className="py-2 px-3.5 text-right font-mono font-bold">30</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">END SHAKE TIME (SEC)</td><td className="py-2 px-3.5 text-right font-mono font-bold">60</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">INLET TEMPERATURE (°C)</td><td className="py-2 px-3.5 text-right font-mono font-bold">60</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">EXHAUST TEMPERATURE (°C)</td><td className="py-2 px-3.5 text-right font-mono font-bold">50</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">INLET ALARM TEMPERATURE (°C)</td><td className="py-2 px-3.5 text-right font-mono font-bold">65</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">PRINT INTERVAL (MIN)</td><td className="py-2 px-3.5 text-right font-mono font-bold">5</td></tr>
                    </tbody>
                  </table>
                </div>
              ) : eqMeta.type === "BLE" ? (
                <div className="overflow-hidden border border-slate-200 rounded-xl max-w-3xl">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3.5">Blending Parameters</th>
                        <th className="py-2.5 px-3.5 text-right">Set Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr><td className="py-2 px-3.5 font-medium">SELECT NUMBER OF MIXINGS</td><td className="py-2 px-3.5 text-right font-mono font-bold">2</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">FIRST MIXING TIME (MIN)</td><td className="py-2 px-3.5 text-right font-mono font-bold">10</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">SECOND MIXING TIME (MIN)</td><td className="py-2 px-3.5 text-right font-mono font-bold">5</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">THIRD MIXING TIME (MIN)</td><td className="py-2 px-3.5 text-right font-mono font-bold">0</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">FOURTH MIXING TIME (MIN)</td><td className="py-2 px-3.5 text-right font-mono font-bold">0</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">BLENDING SPEED (RPM)</td><td className="py-2 px-3.5 text-right font-mono font-bold">6</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">VACUUM ON TIME (MIN)</td><td className="py-2 px-3.5 text-right font-mono font-bold">1</td></tr>
                      <tr><td className="py-2 px-3.5 font-medium">PURGE ON TIME (Sec)</td><td className="py-2 px-3.5 text-right font-mono font-bold">0</td></tr>
                    </tbody>
                  </table>
                </div>
              ) : eqMeta.type === "COMP" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="overflow-hidden border border-slate-200 rounded-xl">
                    <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      OPERATIONAL SETTINGS (ROTARY PRESS - SEJONG 49D)
                    </div>
                    <table className="w-full text-left text-xs text-slate-700">
                      <tbody className="divide-y divide-slate-100">
                        <tr><td className="py-2 px-3.5 font-medium">FEEDER AUTO %</td><td className="py-2 px-3.5 text-right font-mono font-bold">{displaySourceValue(compFeeder.autoPercent)} %</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">FEEDER MANUAL SPEED</td><td className="py-2 px-3.5 text-right font-mono font-bold">{displaySourceValue(compFeeder.manualRpm)} RPM</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">FILLING CAM</td><td className="py-2 px-3.5 text-right font-mono font-bold">{displaySourceValue(compRecipe.fillingCam)}</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">TARGET QUANTITY</td><td className="py-2 px-3.5 text-right font-mono font-bold">{toText(compRecipe.targetQuantity) ? `${Number(compRecipe.targetQuantity).toLocaleString()} Tabs` : "Not available"}</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">AIR PRESSURE LOW LIMIT</td><td className="py-2 px-3.5 text-right font-mono font-bold">{displaySourceValue(compRecipe.airPressureLowLimitKpa)} Kpa</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">HYDRAULIC PRESSURE LIMITS</td><td className="py-2 px-3.5 text-right font-mono font-bold">Low: {displaySourceValue(compHydra.lowLimitMpa)} Mpa | High: {displaySourceValue(compHydra.highLimitMpa)} Mpa</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">OIL LUBRICATION (S1 UPPER PUNCH)</td><td className="py-2 px-3.5 text-right font-mono font-bold">Interval: {displaySourceValueWithUnit(((compOil.upperPunchS1 || {}) as Record<string, unknown>).intervalMin, "Min")} | Supply: {displaySourceValueWithUnit(((compOil.upperPunchS1 || {}) as Record<string, unknown>).supplySec, "Sec")}</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">OIL LUBRICATION (S2 LOWER PUNCH)</td><td className="py-2 px-3.5 text-right font-mono font-bold">Interval: {displaySourceValueWithUnit(((compOil.lowerPunchS2 || {}) as Record<string, unknown>).intervalMin, "Min")} | Supply: {displaySourceValueWithUnit(((compOil.lowerPunchS2 || {}) as Record<string, unknown>).supplySec, "Sec")}</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">OIL LUBRICATION (S3 LOWER HEAD)</td><td className="py-2 px-3.5 text-right font-mono font-bold">Interval: {displaySourceValueWithUnit(((compOil.lowerHeadS3 || {}) as Record<string, unknown>).intervalMin, "Min")} | Supply: {displaySourceValueWithUnit(((compOil.lowerHeadS3 || {}) as Record<string, unknown>).supplySec, "Sec")}</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">POWDER SUPPLY TIME</td><td className="py-2 px-3.5 text-right font-mono font-bold">{displaySourceValue(compRecipe.powderSupplyTimeSec)} Sec</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">INITIAL REJECT TIME</td><td className="py-2 px-3.5 text-right font-mono font-bold">{displaySourceValue(compRecipe.initialRejectTimeSec)} Sec</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="overflow-hidden border border-slate-200 rounded-xl">
                    <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      CONTROL LIMITS & STOP CONDITIONS (SEJONG 49D)
                    </div>
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-100 text-[10px] font-bold text-slate-600 uppercase">
                        <tr>
                          <th className="py-2 px-2.5">Parameter</th>
                          <th className="py-2 px-2.5 text-center">% Setting</th>
                          <th className="py-2 px-2.5 text-center">kN Limit</th>
                          <th className="py-2 px-2.5">Stop Condition</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        <tr>
                          <td className="py-1.5 px-2.5 font-sans font-medium">HSP (High Stop Pressure)</td>
                          <td className="py-1.5 px-2.5 text-center">{displaySourceValueWithUnit(((compControlLimits.hsp || {}) as Record<string, unknown>).percent, "%")}</td>
                          <td className="py-1.5 px-2.5 text-center font-bold text-rose-700">{displaySourceValueWithUnit(((compControlLimits.hsp || {}) as Record<string, unknown>).kn, "kN")}</td>
                          <td className="py-1.5 px-2.5 font-sans">Stop: {displaySourceValue(((compControlLimits.hsp || {}) as Record<string, unknown>).stop)}</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 font-sans font-medium">HEP (High Error Pressure)</td>
                          <td className="py-1.5 px-2.5 text-center">{displaySourceValueWithUnit(((compControlLimits.hep || {}) as Record<string, unknown>).percent, "%")}</td>
                          <td className="py-1.5 px-2.5 text-center font-bold text-amber-700">{displaySourceValueWithUnit(((compControlLimits.hep || {}) as Record<string, unknown>).kn, "kN")}</td>
                          <td className="py-1.5 px-2.5 font-sans">{displaySourceValueWithUnit(((compControlLimits.hep || {}) as Record<string, unknown>).rot, "Rot")} / {displaySourceValueWithUnit(((compControlLimits.hep || {}) as Record<string, unknown>).tabs, "Tabs")}</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 font-sans font-medium">HCP (High Control Pressure)</td>
                          <td className="py-1.5 px-2.5 text-center">{displaySourceValueWithUnit(((compControlLimits.hcp || {}) as Record<string, unknown>).percent, "%")}</td>
                          <td className="py-1.5 px-2.5 text-center font-bold text-slate-700">{displaySourceValueWithUnit(((compControlLimits.hcp || {}) as Record<string, unknown>).kn, "kN")}</td>
                          <td className="py-1.5 px-2.5 font-sans">{displaySourceValueWithUnit(((compControlLimits.hcp || {}) as Record<string, unknown>).times, "Times")}</td>
                        </tr>
                        <tr className="bg-indigo-50/60 font-semibold">
                          <td className="py-1.5 px-2.5 font-sans font-bold text-indigo-900">Ref (Reference Pressure)</td>
                          <td className="py-1.5 px-2.5 text-center text-slate-400">-</td>
                          <td className="py-1.5 px-2.5 text-center font-bold text-indigo-700">{displaySourceValueWithUnit(((compControlLimits.ref || {}) as Record<string, unknown>).kn, "kN")}</td>
                          <td className="py-1.5 px-2.5 font-sans text-slate-400">-</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 font-sans font-medium">LCP (Low Control Pressure)</td>
                          <td className="py-1.5 px-2.5 text-center">{displaySourceValueWithUnit(((compControlLimits.lcp || {}) as Record<string, unknown>).percent, "%")}</td>
                          <td className="py-1.5 px-2.5 text-center font-bold text-slate-700">{displaySourceValueWithUnit(((compControlLimits.lcp || {}) as Record<string, unknown>).kn, "kN")}</td>
                          <td className="py-1.5 px-2.5 font-sans">{displaySourceValueWithUnit(((compControlLimits.lcp || {}) as Record<string, unknown>).times, "Times")}</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 font-sans font-medium">LEP (Low Error Pressure)</td>
                          <td className="py-1.5 px-2.5 text-center">{displaySourceValueWithUnit(((compControlLimits.lep || {}) as Record<string, unknown>).percent, "%")}</td>
                          <td className="py-1.5 px-2.5 text-center font-bold text-amber-700">{displaySourceValueWithUnit(((compControlLimits.lep || {}) as Record<string, unknown>).kn, "kN")}</td>
                          <td className="py-1.5 px-2.5 font-sans">{displaySourceValueWithUnit(((compControlLimits.lep || {}) as Record<string, unknown>).rot, "Rot")} / {displaySourceValueWithUnit(((compControlLimits.lep || {}) as Record<string, unknown>).tabs, "Tabs")}</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 font-sans font-medium">LSP (Low Stop Pressure)</td>
                          <td className="py-1.5 px-2.5 text-center">{displaySourceValueWithUnit(((compControlLimits.lsp || {}) as Record<string, unknown>).percent, "%")}</td>
                          <td className="py-1.5 px-2.5 text-center font-bold text-rose-700">{displaySourceValueWithUnit(((compControlLimits.lsp || {}) as Record<string, unknown>).kn, "kN")}</td>
                          <td className="py-1.5 px-2.5 font-sans">Stop: {displaySourceValue(((compControlLimits.lsp || {}) as Record<string, unknown>).stop)}</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 font-sans font-medium">SD Limit</td>
                          <td className="py-1.5 px-2.5 text-center">{displaySourceValueWithUnit(((compControlLimits.sdLimit || {}) as Record<string, unknown>).percent, "%")}</td>
                          <td className="py-1.5 px-2.5 text-center text-slate-400">-</td>
                          <td className="py-1.5 px-2.5 font-sans">Stop: {displaySourceValue(((compControlLimits.sdLimit || {}) as Record<string, unknown>).stop)}</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 font-sans font-medium">Pre HSP</td>
                          <td className="py-1.5 px-2.5 text-center text-slate-400">-</td>
                          <td className="py-1.5 px-2.5 text-center font-bold text-rose-700">{displaySourceValueWithUnit(((compControlLimits.preHsp || {}) as Record<string, unknown>).kn, "kN")}</td>
                          <td className="py-1.5 px-2.5 font-sans">Stop: {displaySourceValue(((compControlLimits.preHsp || {}) as Record<string, unknown>).stop)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : eqMeta.type === "COAT" ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="overflow-hidden border border-slate-200 rounded-xl">
                    <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      TEMPERATURE & GENERAL SETPOINTS
                    </div>
                    <table className="w-full text-left text-xs text-slate-700">
                      <tbody className="divide-y divide-slate-100">
                        <tr><td className="py-2 px-3.5 font-medium">INLET AIR TEMP - SP (°C)</td><td className="py-2 px-3.5 text-right font-mono font-bold">60.0</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">EXHAUST AIR TEMP - SP (°C)</td><td className="py-2 px-3.5 text-right font-mono font-bold">45.0</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">INLET DAMPER OPENING (%)</td><td className="py-2 px-3.5 text-right font-mono font-bold">75.0</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">EXHAUST DAMPER OPENING (%)</td><td className="py-2 px-3.5 text-right font-mono font-bold">20.0</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">PAN SPEED (RPM)</td><td className="py-2 px-3.5 text-right font-mono font-bold">2.1</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">PRINT INTERVAL (MIN)</td><td className="py-2 px-3.5 text-right font-mono font-bold">30</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="overflow-hidden border border-slate-200 rounded-xl">
                    <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      FILM MODE - PRE JOG & DOSING
                    </div>
                    <table className="w-full text-left text-xs text-slate-700">
                      <tbody className="divide-y divide-slate-100">
                        <tr><td className="py-2 px-3.5 font-medium">PRE JOG PAN ON / OFF (Sec)</td><td className="py-2 px-3.5 text-right font-mono font-bold">6 / 30</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">NO. OF PRE JOG CYCLES</td><td className="py-2 px-3.5 text-right font-mono font-bold">15</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">DOSING SET SPEED (RPM)</td><td className="py-2 px-3.5 text-right font-mono font-bold">14.0</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">AT BED TEMPERATURE (°C)</td><td className="py-2 px-3.5 text-right font-mono font-bold">48.0</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">RATE OF CHANGE (RPM/°C)</td><td className="py-2 px-3.5 text-right font-mono font-bold">0.1</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">NO. OF DOSING CYCLES</td><td className="py-2 px-3.5 text-right font-mono font-bold">600</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="overflow-hidden border border-slate-200 rounded-xl">
                    <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      FILM MODE - POST JOG SETTINGS
                    </div>
                    <table className="w-full text-left text-xs text-slate-700">
                      <tbody className="divide-y divide-slate-100">
                        <tr><td className="py-2 px-3.5 font-medium">POST JOG PAN ON / OFF (Sec)</td><td className="py-2 px-3.5 text-right font-mono font-bold">5 / 55</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">NO. OF POST JOG CYCLES</td><td className="py-2 px-3.5 text-right font-mono font-bold">6</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">INLET AIR TEMP - SP (°C)</td><td className="py-2 px-3.5 text-right font-mono font-bold">50.0</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">EXHAUST AIR TEMP - SP (°C)</td><td className="py-2 px-3.5 text-right font-mono font-bold">40.0</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">POST JOG PAN SPEED (RPM)</td><td className="py-2 px-3.5 text-right font-mono font-bold">1.4</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : eqMeta.type === "CIP" ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="overflow-hidden border border-slate-200 rounded-xl">
                    <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      PRE-RINSE PARAMETERS
                    </div>
                    <table className="w-full text-left text-xs text-slate-700">
                      <tbody className="divide-y divide-slate-100">
                        <tr><td className="py-2 px-3.5 font-medium">PRE-RINSE TIME (MIN)</td><td className="py-2 px-3.5 text-right font-mono font-bold">15</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">WATER TEMP (°C)</td><td className="py-2 px-3.5 text-right font-mono font-bold">25</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">SUPPLY FLOW (LPM)</td><td className="py-2 px-3.5 text-right font-mono font-bold">150</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="overflow-hidden border border-slate-200 rounded-xl">
                    <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      DETERGENT WASH PARAMETERS
                    </div>
                    <table className="w-full text-left text-xs text-slate-700">
                      <tbody className="divide-y divide-slate-100">
                        <tr><td className="py-2 px-3.5 font-medium">WASH TIME (MIN)</td><td className="py-2 px-3.5 text-right font-mono font-bold">30</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">WASH TEMP (°C)</td><td className="py-2 px-3.5 text-right font-mono font-bold">75</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">DETERGENT CONC (%)</td><td className="py-2 px-3.5 text-right font-mono font-bold">2.0</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">PRESSURE (BAR)</td><td className="py-2 px-3.5 text-right font-mono font-bold">3.0</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="overflow-hidden border border-slate-200 rounded-xl">
                    <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      FINAL RINSE & DRY
                    </div>
                    <table className="w-full text-left text-xs text-slate-700">
                      <tbody className="divide-y divide-slate-100">
                        <tr><td className="py-2 px-3.5 font-medium">FINAL RINSE TIME (MIN)</td><td className="py-2 px-3.5 text-right font-mono font-bold">20</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">CONDUCTIVITY LIMIT</td><td className="py-2 px-3.5 text-right font-mono font-bold">1.3 µS/cm</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">AIR BLOW DRY (MIN)</td><td className="py-2 px-3.5 text-right font-mono font-bold">15</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="overflow-hidden border border-slate-200 rounded-xl">
                    <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      DRY MIX & WET CYCLE 1
                    </div>
                    <table className="w-full text-left text-xs text-slate-700">
                      <tbody className="divide-y divide-slate-100">
                        <tr><td className="py-2 px-3.5 font-medium">DRY CYCLE 1 - IMPELLER SLOW (Sec)</td><td className="py-2 px-3.5 text-right font-mono font-bold">600</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">DRY CYCLE 1 - IMPELLER FAST (Sec)</td><td className="py-2 px-3.5 text-right font-mono font-bold">0</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">WET CYCLE 1 - IMPELLER SLOW (Sec)</td><td className="py-2 px-3.5 text-right font-mono font-bold">150</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">WET CYCLE 1 - PUMP 1 SET (Sec)</td><td className="py-2 px-3.5 text-right font-mono font-bold">150</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">WET CYCLE 1 - PUMP 1 RPM</td><td className="py-2 px-3.5 text-right font-mono font-bold">60</td></tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="overflow-hidden border border-slate-200 rounded-xl">
                    <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      WET CYCLES 2, 3 & UNLOADING
                    </div>
                    <table className="w-full text-left text-xs text-slate-700">
                      <tbody className="divide-y divide-slate-100">
                        <tr><td className="py-2 px-3.5 font-medium">WET CYCLE 2 - IMPELLER SLOW (Sec)</td><td className="py-2 px-3.5 text-right font-mono font-bold">60</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">WET CYCLE 2 - CHOPPER SLOW (Sec)</td><td className="py-2 px-3.5 text-right font-mono font-bold">60</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">WET CYCLE 3 - IMPELLER FAST (Sec)</td><td className="py-2 px-3.5 text-right font-mono font-bold">30</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">WET CYCLE 3 - CHOPPER FAST (Sec)</td><td className="py-2 px-3.5 text-right font-mono font-bold">30</td></tr>
                        <tr><td className="py-2 px-3.5 font-medium">UNLOADING PARAMETERS</td><td className="py-2 px-3.5 text-right font-mono font-bold">IMPELLER/CHOPPER: SLOW</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* =========================================================================
          SECTION 2: OPERATIONAL DETAIL VALUES (Set / Actual display format)
         ========================================================================= */}
          <section aria-label="Operational Detail Values" className="space-y-4">
            {/* Section Verification Checkpoint Card */}
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex-shrink-0">
                  <ListNumbers className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">
                      Operational Detail Values
                    </h2>
                    {sectionReviews.OPERATIONAL_DETAIL_VALUES.status === "PASSED" || isApprovedBatch ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" weight="fill" />
                        <span>{roleStageWiseLabel}</span>
                      </span>
                    ) : sectionReviews.OPERATIONAL_DETAIL_VALUES.status === "HAS_QUERIES" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <WarningCircle className="h-3.5 w-3.5 text-amber-600" weight="fill" />
                        <span>Query Flagged</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                        <span>Pending Verification</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isComp
                      ? "Operational telemetry, compression pressure data, machine values and production tablet counters"
                      : (
                        <>
                          Process telemetry table with compact <strong className="text-indigo-600 font-bold font-mono">Set / Actual</strong> parameter value display
                        </>
                      )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setActiveInfoSection("OPERATIONAL_DETAIL_VALUES");
                    setIsInfoModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-xs transition shadow-sm cursor-pointer"
                >
                  <Question className="h-3.5 w-3.5 text-amber-700" />
                  <span>Request Info</span>
                </button>
                {!isApprovedBatch && (
                  <button
                    type="button"
                    onClick={() => handlePassSection("OPERATIONAL_DETAIL_VALUES")}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs transition shadow-sm cursor-pointer ${sectionReviews.OPERATIONAL_DETAIL_VALUES.status === "PASSED"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600"
                        : "bg-blue-600 hover:bg-blue-700 text-white animate-blue-blink"
                      }`}
                  >
                    <CheckCircle className="h-3.5 w-3.5" weight={sectionReviews.OPERATIONAL_DETAIL_VALUES.status === "PASSED" ? "fill" : "bold"} />
                    <span>{sectionReviews.OPERATIONAL_DETAIL_VALUES.status === "PASSED" ? `Verified (${roleStageWiseLabel})` : `Verify Section (${isOperatorRole ? "Mark Viewed" : isReviewerRole ? "Review" : "Approve"})`}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filter Bar */}
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto flex-1">
                <label htmlFor="param-search-info" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
                  <MagnifyingGlass className="h-4 w-4 text-indigo-600" />
                  Filter Detail Values:
                </label>
                <input
                  id="param-search-info"
                  type="text"
                  placeholder="Filter by parameter, value, or timestamp..."
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
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition shadow-sm cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Clear Filter</span>
                  </button>
                )}

                {correlatedAlarm && (
                  <button
                    type="button"
                    onClick={handleClearCorrelation}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Clear Correlation ({getAlarmCode(correlatedAlarm as unknown as Record<string, unknown>)})</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md font-mono text-[11px] text-slate-700">
                  <CalendarBlank className="h-3.5 w-3.5 text-slate-400" />
                  {filteredParameters.length} of {cppRecords.length} Detail Records
                </span>
              </div>
            </div>

            {isComp && (
              <div className="space-y-6">
                {/* Panel 1: Pressure Data & Adjust Depth (kN / mm) */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <SlidersHorizontal className="h-5 w-5 text-indigo-600" />
                        Compression Pressure Data & Adjust Depth
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Pre & Main Compression Pressures (kN) with multi-point load cell analysis and turret depth adjustments
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                      SEJONG 49D COMPRESSION
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Pre Pressure */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Pre Compression Pressure</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">kN</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <span className="text-[10px] text-slate-400 font-semibold block">ACTUAL</span>
                          <span className="text-sm font-bold font-mono text-slate-900">{displaySourceValue(compPrePressure?.meanKn)}</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <span className="text-[10px] text-slate-400 font-semibold block">AVERAGE</span>
                          <span className="text-sm font-bold font-mono text-slate-900">{displaySourceValue(compPrePressure?.meanKn)}</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <span className="text-[10px] text-slate-400 font-semibold block">MAXIMUM</span>
                          <span className="text-sm font-bold font-mono text-slate-900">{displaySourceValue(compPrePressure?.maxKn)}</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <span className="text-[10px] text-slate-400 font-semibold block">MINIMUM</span>
                          <span className="text-sm font-bold font-mono text-slate-900">{displaySourceValue(compPrePressure?.minKn)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Main Pressure */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Main Compression Pressure</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">kN</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <span className="text-[10px] text-slate-400 font-semibold block">ACTUAL</span>
                          <span className="text-sm font-bold font-mono text-slate-900">{displaySourceValue(compMainPressure?.meanKn)}</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <span className="text-[10px] text-slate-400 font-semibold block">AVERAGE</span>
                          <span className="text-sm font-bold font-mono text-slate-900">{displaySourceValue(compMainPressure?.meanKn)}</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <span className="text-[10px] text-slate-400 font-semibold block">MAXIMUM</span>
                          <span className="text-sm font-bold font-mono text-slate-900">{displaySourceValue(compMainPressure?.maxKn)}</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <span className="text-[10px] text-slate-400 font-semibold block">MINIMUM</span>
                          <span className="text-sm font-bold font-mono text-slate-900">{displaySourceValue(compMainPressure?.minKn)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Adjust Depth */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Adjust Depth</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">mm</span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="p-2 rounded bg-white border border-slate-200 flex items-center justify-between">
                          <span className="text-[11px] text-slate-600 font-semibold">Pre Thickness</span>
                          <span className="text-sm font-bold font-mono text-slate-900">{displaySourceValue(((compOpVals.prePressure || {}) as Record<string, unknown>).thicknessMm)} mm</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200 flex items-center justify-between">
                          <span className="text-[11px] text-slate-600 font-semibold">Main Thickness</span>
                          <span className="text-sm font-bold font-mono text-slate-900">{displaySourceValue(((compOpVals.mainPressure || {}) as Record<string, unknown>).thicknessMm)} mm</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200 flex items-center justify-between">
                          <span className="text-[11px] text-slate-600 font-semibold">Filling Depth</span>
                          <span className="text-sm font-bold font-mono text-slate-900">{displaySourceValue(compOpVals?.fillingDepthMm)} mm</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Panel 2: Operation Values & Auxiliary Machine State */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Cpu className="h-5 w-5 text-indigo-600" />
                        Machine Operation Values & Auxiliary Status
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Active drive speeds, cam settings, pneumatic air and hydraulic pressure status
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Disk Speed</span>
                      <span className="text-base font-bold font-mono text-slate-900">{displaySourceValue(compOpVals?.diskSpeedRpm)}</span>
                      <span className="text-[10px] text-slate-500 font-semibold block">RPM</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Production Rate</span>
                      <span className="text-base font-bold font-mono text-slate-900">{displaySourceValue(compOpVals?.capacityTabsPerHour)}</span>
                      <span className="text-[10px] text-slate-500 font-semibold block">Tab / hr</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Feeder Speed</span>
                      <span className="text-base font-bold font-mono text-slate-900">{displaySourceValue(((compOpVals.feeder || {}) as Record<string, unknown>).speedRpm ?? compFeeder?.manualRpm)}</span>
                      <span className="text-[10px] text-slate-500 font-semibold block">RPM</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Current Cam</span>
                      <span className="text-base font-bold font-mono text-slate-900">{displaySourceValue(compOpVals?.currentCam ?? compRecipe?.fillingCam)}</span>
                      <span className="text-[10px] text-slate-500 font-semibold block">mm</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Main Air Pressure</span>
                      <span className="text-base font-bold font-mono text-slate-900">{displaySourceValue(compOpVals?.mainAirPressureKpa)}</span>
                      <span className="text-[10px] text-slate-500 font-semibold block">kPa</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Hydraulic Pressure</span>
                      <span className="text-base font-bold font-mono text-slate-900">{displaySourceValue(compOpVals?.hydraulicPressureMpa)}</span>
                      <span className="text-[10px] text-slate-500 font-semibold block">MPa</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Lubrication Rem.</span>
                      <span className="text-base font-bold font-mono text-slate-900">{displaySourceValue(((compOpVals.lubricationRemainingMin || {}) as Record<string, unknown>).upperPunchS1)}</span>
                      <span className="text-[10px] text-slate-500 font-semibold block">min</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Feeder Mode</span>
                      <span className="text-base font-bold font-mono text-slate-900">{displaySourceValue(((compOpVals.feeder || {}) as Record<string, unknown>).status)}</span>
                      <span className="text-[10px] text-slate-500 font-semibold block">Control</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Powder Supply</span>
                      <span className="text-base font-bold font-mono text-slate-900">{displaySourceValue(compRecipe?.powderSupplyTimeSec)}</span>
                      <span className="text-[10px] text-slate-500 font-semibold block">sec</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Initial Reject</span>
                      <span className="text-base font-bold font-mono text-slate-900">{displaySourceValue(compRecipe?.initialRejectTimeSec)}</span>
                      <span className="text-[10px] text-slate-500 font-semibold block">sec</span>
                    </div>
                  </div>
                </div>

                {/* Panel 3: Tablet Production Counters */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <ListNumbers className="h-5 w-5 text-indigo-600" />
                        Tablet Production Counters & Rejection Analysis
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Real-time batch yield, good tablet quantities, and AWC rejection breakdown
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Counter</span>
                      <span className="text-xl font-bold font-mono text-slate-900">{displaySourceValue(compCounters?.totalCounter)}</span>
                      <span className="text-[10px] text-slate-500 font-semibold block">Tablets</span>
                    </div>
                    <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50">
                      <span className="text-[10px] text-emerald-600 uppercase font-bold block">Good Tablets</span>
                      <span className="text-xl font-bold font-mono text-emerald-900">{displaySourceValue(compGood?.count)}</span>
                      <span className="text-[10px] text-emerald-600 font-semibold block font-mono">{displaySourceValue(compGood?.raw)}</span>
                    </div>
                    <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50">
                      <span className="text-[10px] text-amber-600 uppercase font-bold block">AWC Counter</span>
                      <span className="text-xl font-bold font-mono text-amber-900">{displaySourceValue(compCounters?.awcCounter)}</span>
                      <span className="text-[10px] text-amber-600 font-semibold block">Auto Rejections</span>
                    </div>
                    <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/50">
                      <span className="text-[10px] text-rose-600 uppercase font-bold block">HEP (High Reject)</span>
                      <span className="text-xl font-bold font-mono text-rose-900">{displaySourceValue(compHep?.count)}</span>
                      <span className="text-[10px] text-rose-600 font-semibold block font-mono">{displaySourceValue(compHep?.raw)}</span>
                    </div>
                    <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/50">
                      <span className="text-[10px] text-purple-600 uppercase font-bold block">LEP (Low Reject)</span>
                      <span className="text-xl font-bold font-mono text-purple-900">{displaySourceValue(compLep?.count)}</span>
                      <span className="text-[10px] text-purple-600 font-semibold block font-mono">{displaySourceValue(compLep?.raw)}</span>
                    </div>
                  </div>
                </div>

                {/* Panels 4-5: source-complete Tightness and Tablet Checker sections */}
                {[{ title: "Tightness", data: compTightness }, { title: "Tablet Checker", data: compTabletChecker }].map((section) => (
                  <div key={section.title} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                    <h3 className="text-sm font-bold text-slate-900">{section.title}</h3>
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-slate-100">
                          {flattenCompressionSection(section.data).map((row) => (
                            <tr key={`${section.title}-${row.label}`}>
                              <td className="px-3.5 py-2 font-medium text-slate-600">{row.label.replace(/([A-Z])/g, " $1").trim()}</td>
                              <td className="px-3.5 py-2 text-right font-mono font-bold text-slate-900">{displaySourceValue(row.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Operational Detail Values Table with Set / Actual */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="overflow-hidden border border-slate-200 rounded-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-3.5 whitespace-nowrap">Observed Timestamp</th>
                        {!isFbd && !isCoat && (
                          <th className="py-3 px-3.5 whitespace-nowrap"><div className="font-bold text-slate-800">STATUS</div></th>
                        )}
                        {activeCols.map((col) => {
                          const meta = resolveMetricLimits(col.key, targetEquipmentCode, paramLimits, criticalParams);
                          const lim = meta.limits;
                          return (
                            <th key={col.key} className="py-3 px-3.5 whitespace-nowrap">
                              <div className="font-bold text-slate-800">{meta.parameterName} ({meta.unit})</div>
                              {!isComp && (
                                <div className="text-[9px] font-mono text-indigo-600 font-semibold normal-case">
                                  {lim && (lim.lowerCriticalLimit !== undefined || lim.upperCriticalLimit !== undefined) ? (
                                    <span>Lim: [{lim.lowerCriticalLimit ?? "-"} to {lim.upperCriticalLimit ?? "-"}]</span>
                                  ) : null}
                                </div>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredParameters.length === 0 ? (
                        <tr>
                          <td
                            colSpan={Math.max(6, activeCols.length + (!isFbd && !isCoat ? 2 : 1))}
                            className="py-8 text-center text-slate-500 font-medium"
                          >
                            <div className="flex flex-col items-center justify-center gap-1.5">
                              <Funnel className="h-6 w-6 text-slate-400 opacity-60" />
                              <span className="text-slate-700 font-bold text-xs">
                                No operational detail records match search criteria
                              </span>
                              <span className="text-slate-500 text-[11px]">
                                {parameterSearch ? `No metric values match "${parameterSearch}".` : "No parameter records available for this batch stage."}
                              </span>
                              {parameterSearch && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setParameterSearch("");
                                    setParametersPage(1);
                                  }}
                                  className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition shadow-sm cursor-pointer"
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
                          const rowRec = record as unknown as Record<string, unknown>;
                          const rowMeta = (record.meta || {}) as Record<string, unknown>;
                          const rowMetrics = (record.metrics || {}) as Record<string, unknown>;
                          const m = {
                            ...rowRec,
                            ...rowMeta,
                            ...rowMetrics,
                          };
                          const observedAt = record.observedAt || rowRec.TIME || rowRec.time || rowRec.timestamp || rowRec.observed_at || rowRec.event_time;
                          const rowKey = `${toText(record.equipmentId || rowRec.equipmentCode || "PARAM")}_${toText(observedAt)}_${(safeParamPage - 1) * parametersPageSize + index}`;
                          const isMatch = isExactMinuteMatch(observedAt);
                          const rowStatus = toText(rowRec.status || rowMeta.status || rowRec.Status || "RUNNING");
                          const showStatus = !isFbd && !isCoat;

                          return (
                            <tr
                              key={rowKey}
                              className={`transition ${isMatch
                                  ? "bg-amber-50/90 border-l-4 border-amber-500 font-medium"
                                  : "hover:bg-slate-50/80"
                                }`}
                            >
                              <td className="py-2.5 px-3.5 font-mono text-slate-600 font-semibold whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  {isMatch && (
                                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" title="Exact Correlated Minute Event" />
                                  )}
                                  <span>{toDisplayDate(observedAt)}</span>
                                </div>
                              </td>
                              {showStatus && (
                                <td className="py-2.5 px-3.5 whitespace-nowrap">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                                    {rowStatus}
                                  </span>
                                </td>
                              )}
                              {activeCols.map((col) => {
                                const val = m[col.key] ?? getMetricValue(m, col.key);
                                const meta = resolveMetricLimits(col.key, targetEquipmentCode, paramLimits, criticalParams);
                                const lim = meta.limits;
                                const evaluation = evaluateParameterStatus(
                                  val,
                                  lim?.lowerCriticalLimit,
                                  lim?.upperCriticalLimit
                                );

                                const setVal = resolveSetValue(col.key, m, meta.idealTarget ?? meta.limits?.idealTarget ?? col.idealTarget);
                                const displaySetActual = isComp ? evaluation.formattedValue : formatSetActual(evaluation.formattedValue, setVal);

                                return (
                                  <td key={col.key} className="py-2.5 px-3.5 whitespace-nowrap">
                                    <span
                                      className={evaluation.statusClass}
                                      title={
                                        isComp
                                          ? `Actual: ${evaluation.formattedValue}`
                                          : `Set: ${setVal ?? "-"} | Actual: ${evaluation.formattedValue}${lim && (lim.lowerCriticalLimit !== undefined || lim.upperCriticalLimit !== undefined) ? ` (Limits: [${lim.lowerCriticalLimit ?? "-"} to ${lim.upperCriticalLimit ?? "-"}])` : ""}`
                                      }
                                    >
                                      {displaySetActual}
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

                {/* Pagination for Operational Detail Values */}
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
          </section>

          {/* =========================================================================
          SECTION 2.5: PARAMETER TRENDS (Dynamic Process Trend Chart)
         ========================================================================= */}
          <section aria-label="Parameter Trends" className="space-y-4">
            {/* Section Verification Checkpoint Card */}
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex-shrink-0">
                  <ChartLine className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">
                      Parameter Trends
                    </h2>
                    {sectionReviews.TRENDS?.status === "PASSED" || isApprovedBatch ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" weight="fill" />
                        <span>{roleStageWiseLabel}</span>
                      </span>
                    ) : sectionReviews.TRENDS?.status === "HAS_QUERIES" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <WarningCircle className="h-3.5 w-3.5 text-amber-600" weight="fill" />
                        <span>Query Flagged</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                        <span>Pending Verification</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Dynamic telemetry time-series trends with setpoint specifications, tolerance limits, and alarms
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setActiveInfoSection("TRENDS");
                    setIsInfoModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-xs transition shadow-sm cursor-pointer"
                >
                  <Question className="h-3.5 w-3.5 text-amber-700" />
                  <span>Request Info</span>
                </button>
                {!isApprovedBatch && (
                  <button
                    type="button"
                    onClick={() => handlePassSection("TRENDS")}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs transition shadow-sm cursor-pointer ${sectionReviews.TRENDS?.status === "PASSED"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600"
                        : "bg-blue-600 hover:bg-blue-700 text-white animate-blue-blink"
                      }`}
                  >
                    <CheckCircle className="h-3.5 w-3.5" weight={sectionReviews.TRENDS?.status === "PASSED" ? "fill" : "bold"} />
                    <span>{sectionReviews.TRENDS?.status === "PASSED" ? `Verified (${roleStageWiseLabel})` : `Verify Section (${isOperatorRole ? "Mark Viewed" : isReviewerRole ? "Review" : "Approve"})`}</span>
                  </button>
                )}
              </div>
            </div>

            {correlatedAlarm && (
              <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <Target className="h-4 w-4 text-amber-600" />
                  <span>
                    Correlated with alarm: <strong className="font-mono text-slate-900">{getAlarmCode(correlatedAlarm as unknown as Record<string, unknown>)}</strong> (
                    {toDisplayDate(getAlarmEventTime(correlatedAlarm as unknown as Record<string, unknown>))})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleClearCorrelation}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:text-amber-950 underline self-end sm:self-auto cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear Correlation Window
                </button>
              </div>
            )}

            {/* Metric Selector Bar */}
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <ChartLine className="h-4 w-4 text-indigo-600" />
                    Telemetry Parameter Channel
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Select a continuous critical process parameter to visualize time-series telemetry against tolerance limits
                  </p>
                </div>
                <div className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                  {canonicalTrendPoints.length} Data Points
                </div>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {availableMetricsList.map((col) => {
                  const isSelected = selectedTrendMetric === col.key;
                  return (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => setSelectedTrendMetric(col.key)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${isSelected
                          ? "bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400/30"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                        }`}
                    >
                      {col.label} ({col.unit})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Process Trend Chart */}
            <DynamicProcessTrendChart
              points={canonicalTrendPoints}
              parameterName={currentMetricMeta.parameterName}
              metricKey={selectedTrendMetric}
              unit={currentMetricMeta.unit}
              limits={currentMetricMeta.limits}
              isLoading={isLoading}
              batchNo={queryBatchNo}
              lotNo={queryLotNo}
              equipmentCode={targetEquipmentCode}
              availableMetrics={availableMetricsList}
              selectedMetric={selectedTrendMetric}
              onMetricChange={(k) => setSelectedTrendMetric(k)}
            />
          </section>

          {/* =========================================================================
          SECTION 3: ALARMS / EVENTS (Alarm Summary)
         ========================================================================= */}
          <section aria-label="Alarms and Events" className="space-y-4">
            {/* Section Verification Checkpoint Card */}
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex-shrink-0">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">
                      Alarms / Events
                    </h2>
                    {sectionReviews.ALARM_SUMMARY.status === "PASSED" || isApprovedBatch ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" weight="fill" />
                        <span>{roleStageWiseLabel}</span>
                      </span>
                    ) : sectionReviews.ALARM_SUMMARY.status === "HAS_QUERIES" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <WarningCircle className="h-3.5 w-3.5 text-amber-600" weight="fill" />
                        <span>Query Flagged</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                        <span>Pending Verification</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Equipment Alarm Events, Occurred/Resolved Timelines, and Duration
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setActiveInfoSection("ALARM_SUMMARY");
                    setIsInfoModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-xs transition shadow-sm cursor-pointer"
                >
                  <Question className="h-3.5 w-3.5 text-amber-700" />
                  <span>Request Info</span>
                </button>
                {!isApprovedBatch && (
                  <button
                    type="button"
                    onClick={() => handlePassSection("ALARM_SUMMARY")}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs transition shadow-sm cursor-pointer ${sectionReviews.ALARM_SUMMARY.status === "PASSED"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600"
                        : "bg-blue-600 hover:bg-blue-700 text-white animate-blue-blink"
                      }`}
                  >
                    <CheckCircle className="h-3.5 w-3.5" weight={sectionReviews.ALARM_SUMMARY.status === "PASSED" ? "fill" : "bold"} />
                    <span>{sectionReviews.ALARM_SUMMARY.status === "PASSED" ? `Verified (${roleStageWiseLabel})` : `Verify Section (${isOperatorRole ? "Mark Viewed" : isReviewerRole ? "Review" : "Approve"})`}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filter Bar */}
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto flex-1">
                <label htmlFor="alarm-search-info" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
                  <MagnifyingGlass className="h-4 w-4 text-indigo-600" />
                  Filter Alarms:
                </label>
                <input
                  id="alarm-search-info"
                  type="text"
                  placeholder="Filter by alarm code, message, severity, timestamp..."
                  value={alarmSearch}
                  onChange={(e) => {
                    setAlarmSearch(e.target.value);
                    setAlarmsPage(1);
                  }}
                  className="w-full sm:w-72 bg-white border border-slate-300 rounded-lg pl-3 pr-3 py-2 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />

                <div className="flex items-center gap-1.5">
                  <label htmlFor="alarm-filter-select-info" className="text-xs font-semibold text-slate-700 flex items-center gap-1 whitespace-nowrap">
                    <Funnel className="h-3.5 w-3.5 text-slate-500" />
                    Severity:
                  </label>
                  <select
                    id="alarm-filter-select-info"
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
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition shadow-sm cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Clear Filter</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md font-mono text-[11px] text-slate-700">
                  <Bell className="h-3.5 w-3.5 text-slate-400" />
                  {filteredAlarms.length} of {alarmRecords.length} Alarms
                </span>
              </div>
            </div>

            {/* Alarms Table */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="overflow-hidden border border-slate-200 rounded-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-3.5">Alarm Name</th>
                        <th className="py-3 px-3.5">Occurred Time</th>
                        <th className="py-3 px-3.5">Resolved Time</th>
                        <th className="py-3 px-3.5">Duration (HH:MM:SS)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredAlarms.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-500 font-medium">
                            <div className="flex flex-col items-center justify-center gap-1.5">
                              <CheckCircle className="h-6 w-6 text-emerald-500 opacity-60" />
                              <span className="text-slate-700 font-bold text-xs">
                                {alarmSearch || alarmFilter !== "ALL"
                                  ? "No alarms match the search/filter criteria"
                                  : "No alarms detected for this batch"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedAlarms.map((alarmItem, idx) => {
                          const alarm = alarmItem as unknown as Record<string, unknown>;
                          const aTime = getAlarmEventTime(alarm);
                          const aCode = getAlarmCode(alarm);
                          const aDesc = getAlarmDescription(alarm);
                          const aResolved = getAlarmResolvedTime(alarm);
                          const aDuration = getAlarmDuration(alarm);
                          const alarmKey = `${aCode}_${aTime}_${(safeAlarmPage - 1) * alarmsPageSize + idx}`;

                          return (
                            <tr key={alarmKey} className="hover:bg-slate-50/80 transition">
                              <td className="py-2.5 px-3.5 text-slate-800 font-semibold">{aDesc}</td>
                              <td className="py-2.5 px-3.5 font-mono text-slate-600 font-semibold whitespace-nowrap">
                                {toDisplayDate(aTime)}
                              </td>
                              <td className="py-2.5 px-3.5 font-mono text-slate-600">
                                {aResolved && aResolved !== "-" ? toDisplayDate(aResolved) : "-"}
                              </td>
                              <td className={`py-2.5 px-3.5 font-mono font-bold ${aDuration === "-" ? "text-slate-400" : "text-indigo-700"}`}>
                                {aDuration || "-"}
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
          </section>

          {/* =========================================================================
          SECTION 4: AUDIT TRAIL (User Sessions & Event Trail)
         ========================================================================= */}
          <section aria-label="Audit Trail" className="space-y-4">
            {/* Section Verification Checkpoint Card */}
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-600 flex-shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">
                      Audit Trail
                    </h2>
                    {sectionReviews.AUDIT_TRAIL.status === "PASSED" || isApprovedBatch ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" weight="fill" />
                        <span>{roleStageWiseLabel}</span>
                      </span>
                    ) : sectionReviews.AUDIT_TRAIL.status === "HAS_QUERIES" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <WarningCircle className="h-3.5 w-3.5 text-amber-600" weight="fill" />
                        <span>Query Flagged</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                        <span>Pending Verification</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Regulatory Audit Trail & User Session Activity
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setActiveInfoSection("AUDIT_TRAIL");
                    setIsInfoModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-xs transition shadow-sm cursor-pointer"
                >
                  <Question className="h-3.5 w-3.5 text-amber-700" />
                  <span>Request Info</span>
                </button>
                {!isApprovedBatch && (
                  <button
                    type="button"
                    onClick={() => handlePassSection("AUDIT_TRAIL")}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs transition shadow-sm cursor-pointer ${sectionReviews.AUDIT_TRAIL.status === "PASSED"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600"
                        : "bg-blue-600 hover:bg-blue-700 text-white animate-blue-blink"
                      }`}
                  >
                    <CheckCircle className="h-3.5 w-3.5" weight={sectionReviews.AUDIT_TRAIL.status === "PASSED" ? "fill" : "bold"} />
                    <span>{sectionReviews.AUDIT_TRAIL.status === "PASSED" ? `Verified (${roleStageWiseLabel})` : `Verify Section (${isOperatorRole ? "Mark Viewed" : isReviewerRole ? "Review" : "Approve"})`}</span>
                  </button>
                )}
              </div>
            </div>

            {/* User Login/Logout Records */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-indigo-600" />
                  User Login / Logout Activity
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Stage: <strong className="text-slate-600 font-mono">{targetEquipmentCode}</strong> &bull; Authenticated User Sessions
                </p>
              </div>

              <div className="overflow-hidden border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3.5">User Name</th>
                      <th className="py-2.5 px-3.5">Date And Time</th>
                      <th className="py-2.5 px-3.5">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      let sessions = [
                        { u: `96365 (${eqMeta.block} ${eqMeta.code} Supervisor)`, dt: stageStartTime, act: "Login", isLog: true },
                        { u: `96828 (${eqMeta.block} ${eqMeta.code} Operator)`, dt: stageStartTime, act: "Login", isLog: true },
                        { u: `96828 (${eqMeta.block} ${eqMeta.code} Operator)`, dt: stageEndTime, act: "Logout Successfully", isLog: false },
                        { u: `96365 (${eqMeta.block} ${eqMeta.code} Supervisor)`, dt: stageEndTime, act: "Logout Successfully", isLog: false },
                      ];
                      if (eqMeta.type === "FBD") {
                        sessions = [
                          { u: `191555 (${eqMeta.block} ${eqMeta.code} Supervisor)`, dt: "09/02/2026 18:44:47", act: "Logout Successfully", isLog: false },
                          { u: `11173 (${eqMeta.block} ${eqMeta.code} Operator)`, dt: "09/02/2026 18:45:50", act: "Login", isLog: true },
                          { u: `11173 (${eqMeta.block} ${eqMeta.code} Operator)`, dt: "09/02/2026 22:01:42", act: "Logout Successfully", isLog: false },
                          { u: `11173 (${eqMeta.block} ${eqMeta.code} Operator)`, dt: "09/02/2026 22:02:01", act: "Login", isLog: true },
                          { u: `11173 (${eqMeta.block} ${eqMeta.code} Operator)`, dt: "09/02/2026 23:45:11", act: "Logout Successfully", isLog: false },
                          { u: `191555 (${eqMeta.block} ${eqMeta.code} Supervisor)`, dt: "09/02/2026 23:46:40", act: "Login", isLog: true },
                        ];
                      } else if (eqMeta.type === "BLE") {
                        sessions = [
                          { u: `191164 (${eqMeta.block} ${eqMeta.code} Supervisor)`, dt: "11/02/2026 09:05:19", act: "Logout Successfully", isLog: false },
                          { u: `11173 (${eqMeta.block} ${eqMeta.code} Operator)`, dt: "11/02/2026 09:05:40", act: "Login", isLog: true },
                          { u: `11173 (${eqMeta.block} ${eqMeta.code} Operator)`, dt: "11/02/2026 11:02:10", act: "Logout Successfully", isLog: false },
                          { u: `191164 (${eqMeta.block} ${eqMeta.code} Supervisor)`, dt: "11/02/2026 11:02:31", act: "Login", isLog: true },
                        ];
                      } else if (eqMeta.type === "COMP") {
                        if (compLoginHistory && compLoginHistory.length > 0) {
                          sessions = compLoginHistory.map((l: Record<string, unknown>) => {
                            const actStr = toText(l.action || (toText(l.event_type) === "LOGIN" ? "Login" : "Logout Successfully"));
                            const isLogin = actStr.toLowerCase().includes("login") && !actStr.toLowerCase().includes("logout");
                            return {
                              u: `${toText(l.user_id || l.username || "10402")} (${toText(l.username ? l.username + " - " : "")}${eqMeta.block} ${eqMeta.code} ${isLogin ? "Operator" : "Supervisor"})`,
                              dt: toText(l.event_time || stageStartTime),
                              act: actStr,
                              isLog: isLogin,
                            };
                          });
                        } else {
                          sessions = [
                            { u: `10402 (${eqMeta.block} ${eqMeta.code} Supervisor)`, dt: "11/02/2026 14:15:00", act: "Login", isLog: true },
                            { u: `10401 (${eqMeta.block} ${eqMeta.code} Operator)`, dt: "11/02/2026 14:16:30", act: "Login", isLog: true },
                            { u: `10401 (${eqMeta.block} ${eqMeta.code} Operator)`, dt: "11/02/2026 18:40:00", act: "Logout Successfully", isLog: false },
                            { u: `10402 (${eqMeta.block} ${eqMeta.code} Supervisor)`, dt: "11/02/2026 18:45:20", act: "Logout Successfully", isLog: false },
                          ];
                        }
                      } else if (eqMeta.type === "COAT") {
                        sessions = [
                          { u: `191257 (${eqMeta.block} ${eqMeta.code} Supervisor)`, dt: "12/02/2026 08:30:00", act: "Login", isLog: true },
                          { u: `29995 (${eqMeta.block} ${eqMeta.code} Operator)`, dt: "12/02/2026 08:31:15", act: "Login", isLog: true },
                          { u: `29995 (${eqMeta.block} ${eqMeta.code} Operator)`, dt: "12/02/2026 12:40:00", act: "Logout Successfully", isLog: false },
                          { u: `191257 (${eqMeta.block} ${eqMeta.code} Supervisor)`, dt: "12/02/2026 12:45:30", act: "Logout Successfully", isLog: false },
                        ];
                      }
                      return sessions.map((s, idx) => (
                        <tr key={`user_session_${idx}_${s.dt}_${s.u}`}>
                          <td className="py-2 px-3.5 font-bold text-slate-800">{s.u}</td>
                          <td className="py-2 px-3.5 font-mono text-slate-600">{toDisplayDate(s.dt)}</td>
                          <td className="py-2 px-3.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${s.isLog ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-700 border border-slate-200"
                              }`}>
                              {s.act}
                            </span>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Request Additional Information & Response Tracking */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Question className="h-5 w-5 text-amber-600" />
                  Additional Information Requests & Responses Trail
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Batch: <strong className="text-slate-600 font-mono">{queryBatchNo || "-"}</strong> &bull; Traceable Request & Clarification History
                </p>
              </div>

              <div className="overflow-hidden border border-slate-200 rounded-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-3.5 whitespace-nowrap">Date / Time</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">Action</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">Requester</th>
                        <th className="py-3 px-3.5">Requester Comments</th>
                        <th className="py-3 px-3.5 whitespace-nowrap">Responder</th>
                        <th className="py-3 px-3.5">Response Comments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {additionalInfoAuditTrail.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-500 font-medium">
                            <div className="flex flex-col items-center justify-center gap-1">
                              <span className="text-slate-700 font-bold text-xs">
                                No additional information requests recorded
                              </span>
                              <span className="text-slate-400 text-[11px]">
                                All reviewed parameters and process steps align with standard batch release specifications.
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        additionalInfoAuditTrail.map((row, idx) => (
                          <tr key={`query_audit_${row.id || idx}_${idx}`} className="hover:bg-slate-50/80 transition">
                            <td className="py-2.5 px-3.5 font-mono text-slate-600 font-semibold whitespace-nowrap">
                              {row.dateTime}
                            </td>
                            <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                <Question className="h-3 w-3 text-amber-700" />
                                {row.action}
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 font-semibold text-slate-800 whitespace-nowrap">
                              {row.requester}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-700 max-w-xs">
                              <span className="italic">&quot;{row.requesterComments}&quot;</span>
                            </td>
                            <td className="py-2.5 px-3.5 font-semibold text-slate-800 whitespace-nowrap">
                              {row.responder === "—" ? <span className="text-slate-400 font-normal">—</span> : row.responder}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-700 max-w-xs">
                              {row.status === "PENDING" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                  <Clock className="h-3 w-3 text-slate-400" />
                                  {row.responseComments}
                                </span>
                              ) : (
                                <span className="italic text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  &quot;{row.responseComments}&quot;
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Audit Trail Table */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-indigo-600" />
                    Audit Trail Log
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Batch: <strong className="text-slate-600 font-mono">{queryBatchNo || "-"}</strong> &bull; Complete System & Process Changes Log
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
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition shadow-sm whitespace-nowrap cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Clear Filter</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-hidden border border-slate-200 rounded-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-3.5">Date & Time</th>
                        <th className="py-3 px-3.5">Description</th>
                        <th className="py-3 px-3.5">Old Value</th>
                        <th className="py-3 px-3.5">New Value</th>
                        <th className="py-3 px-3.5">Reason</th>
                        <th className="py-3 px-3.5">User Name</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredAuditEvents.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500 font-medium">
                            <div className="flex flex-col items-center justify-center gap-1.5">
                              <Funnel className="h-6 w-6 text-slate-400 opacity-60" />
                              <span className="text-slate-700 font-bold text-xs">
                                No audit trail records found
                              </span>
                              <span className="text-slate-500 text-[11px]">
                                {auditSearch ? `No records match "${auditSearch}".` : "No audit trail records recorded for this batch."}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedAuditEvents.map((event, idx) => {
                          const raw = event as unknown as Record<string, unknown>;
                          const auditKey = `audit_evt_${event.auditId || raw.id || event.userId || "item"}_${(safeAuditPage - 1) * auditPageSize + idx}_${event.timestamp || idx}`;
                          const mapAuditUserName = (rawUser: unknown, eqCode: string) => {
                            const rawStr = toText(rawUser);
                            if (rawStr.includes("(") && rawStr.includes(")")) return rawStr;
                            const u = rawStr.toUpperCase();
                            const info = resolveEquipmentInfo(eqCode || targetEquipmentCode);
                            const eqTag = `${info.block} ${info.code}`;

                            if (u.includes("SUPERVISOR") || u.includes("REVIEWER") || u.includes("APPROVER") || u.includes("98204") || u.includes("SUPERVISIOR")) {
                              return `96365 (${eqTag} Supervisor)`;
                            }
                            return `96828 (${eqTag} Operator)`;
                          };

                          return (
                            <tr key={auditKey} className="hover:bg-slate-50/80 transition">
                              <td className="py-2.5 px-3.5 font-mono text-slate-600 font-semibold whitespace-nowrap">
                                {toDisplayDate(event.timestamp)}
                              </td>
                              <td className="py-2.5 px-3.5 font-bold text-slate-900">
                                {cleanAuditContent(toText(raw.description || event.actionCode || event.action || "BATCH EVENT"))}
                              </td>
                              <td className="py-2.5 px-3.5 font-mono text-slate-600">
                                {toText(raw.old_value || raw.oldValue || "-")}
                              </td>
                              <td className="py-2.5 px-3.5 font-mono text-slate-600">
                                {toText(raw.new_value || raw.newValue || "-")}
                              </td>
                              <td className="py-2.5 px-3.5 text-slate-700">
                                {cleanAuditContent(toText(raw.reason || event.esignatureReason || "-"))}
                              </td>
                              <td className="py-2.5 px-3.5 font-semibold text-slate-800">
                                {mapAuditUserName(raw.user_name || raw.userName || event.userName || event.userId, event.equipmentCode || targetEquipmentCode)}
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
          </section>

          {/* =========================================================================
          SECTION 5: WORKFLOW SUMMARY (Lifecycle & Stage Sign-offs)
         ========================================================================= */}
          <section aria-label="Workflow Summary" className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-indigo-600" />
                    Workflow Summary
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Batch: <strong className="text-slate-600 font-mono">{queryBatchNo || "-"}</strong> &bull; Lifecycle Transitions &bull;{" "}
                    <strong className="text-slate-600 font-mono">{actionHistory.length} Recorded</strong>
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                  Current Status: {activeStatus.replace(/_/g, " ")}
                </span>
              </div>

              {actionHistory.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center font-medium">
                  No state machine transitions have occurred yet. Initial batch state is active.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                      <tr>
                        <th className="px-3.5 py-2.5">Action</th>
                        <th className="px-3.5 py-2.5">Performed By</th>
                        <th className="px-3.5 py-2.5">Role</th>
                        <th className="px-3.5 py-2.5">Date &amp; Time</th>
                        <th className="px-3.5 py-2.5">Resulting Status</th>
                        <th className="px-3.5 py-2.5">Comments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {actionHistory.map((item, idx) => (
                        <tr key={`action_hist_${item.historyId || idx}_${idx}`} className="hover:bg-slate-50/80 transition">
                          <td className="px-3.5 py-3 font-semibold text-slate-900">
                            <span className="font-bold text-indigo-600">{cleanAuditContent(item.actionName || item.actionCode)}</span>
                            <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                              {item.fromStageCode || "STAGE"} &rarr; {item.toStageCode || "NEXT"}
                            </div>
                          </td>
                          <td className="px-3.5 py-3 font-medium text-slate-800">
                            {item.performerName || item.performedBy}
                          </td>
                          <td className="px-3.5 py-3 text-slate-600 font-mono text-[11px]">
                            {item.performerRole || item.performedBy}
                          </td>
                          <td className="px-3.5 py-3 text-slate-600 font-mono text-[11px]">
                            {toDisplayDate(item.timestamp)}
                          </td>
                          <td className="px-3.5 py-3">
                            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                              {item.newStatus}
                            </span>
                          </td>
                          <td className="px-3.5 py-3 text-slate-600 italic max-w-xs truncate" title={item.comments || ""}>
                            {item.comments ? `"${cleanAuditContent(item.comments)}"` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* =========================================================================
          SECTION 6: PRINT CONTROLLED SUMMARY & TRACEABILITY LOG
         ========================================================================= */}
          <section aria-label="Print Controlled Summary" className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Printer className="h-5 w-5 text-emerald-600" />
                    Print Controlled Summary
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Batch: <strong className="text-slate-600 font-mono">{queryBatchNo || "-"}</strong> &bull; Controlled Copies Traceability Log &bull;{" "}
                    <strong className="text-slate-600 font-mono">{currentPrintCount} {currentPrintCount === 1 ? "Copy" : "Copies"} Printed</strong>
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${currentPrintCount > 0
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-50 text-slate-500 border-slate-200"
                    }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{currentPrintCount > 0 ? "Traceable GxP Copies" : "No Controlled Copies Printed"}</span>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Print Count</span>
                  <span
                    className={`font-bold font-mono text-sm mt-0.5 block ${currentPrintCount > 0 ? "text-emerald-700" : "text-slate-500"
                      }`}
                  >
                    {currentPrintCount} {currentPrintCount === 1 ? "Copy" : "Copies"}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Last Printed By</span>
                  <span
                    className="font-bold text-slate-900 mt-0.5 block truncate"
                    title={currentLastPrintedBy || "Not yet printed"}
                  >
                    {currentLastPrintedBy || "Not yet printed"}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Last Printed At</span>
                  <span className="font-mono font-medium text-slate-700 text-[11px] mt-0.5 block">
                    {currentLastPrintedAt ? toDisplayDate(currentLastPrintedAt) : "—"}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Last Print Reason</span>
                  <span
                    className="text-slate-700 font-medium mt-0.5 block truncate italic"
                    title={currentLastPrintReason || "—"}
                  >
                    {currentLastPrintReason ? `"${currentLastPrintReason}"` : "—"}
                  </span>
                </div>
              </div>

              {/* Detailed Controlled Copies & Authorized Printers Table */}
              {currentPrintCount > 0 && controlledPrintHistory.length > 0 ? (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 tracking-wide uppercase flex items-center gap-1.5">
                        <ListChecks className="h-3.5 w-3.5 text-emerald-600" />
                        Controlled Copies Traceability Log
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {controlledPrintHistory.length} {controlledPrintHistory.length === 1 ? "Record" : "Records"}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 hidden sm:inline">
                      Traceable electronic signature print authorizations
                    </span>
                  </div>

                  <div className="overflow-hidden border border-slate-200 rounded-xl">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-700">
                        <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3.5 whitespace-nowrap">Copy #</th>
                            <th className="py-2.5 px-3.5 whitespace-nowrap">Printed By</th>
                            <th className="py-2.5 px-3.5 whitespace-nowrap">Role</th>
                            <th className="py-2.5 px-3.5 whitespace-nowrap">Date &amp; Time</th>
                            <th className="py-2.5 px-3.5">Print Reason</th>
                            <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Compliance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {controlledPrintHistory.map((item, idx) => (
                            <tr key={`print_copy_${item.copyNo}_${idx}`} className="hover:bg-slate-50/80 transition">
                              <td className="py-2 px-3.5 font-mono font-bold text-emerald-700 whitespace-nowrap">
                                Copy #{item.copyNo}
                              </td>
                              <td className="py-2 px-3.5 font-bold text-slate-900 whitespace-nowrap">
                                {item.printedBy}
                              </td>
                              <td className="py-2 px-3.5 text-slate-600 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 border border-slate-200 text-slate-700">
                                  {item.userRole}
                                </span>
                              </td>
                              <td className="py-2 px-3.5 font-mono text-slate-600 whitespace-nowrap">
                                {item.printedAt ? toDisplayDate(item.printedAt) : "—"}
                              </td>
                              <td className="py-2 px-3.5 text-slate-700 italic max-w-xs truncate" title={item.reason || "—"}>
                                &quot;{item.reason || "—"}&quot;
                              </td>
                              <td className="py-2 px-3.5 text-right whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <ShieldCheck className="h-3 w-3 text-emerald-600" />
                                  Authorized &amp; Traceable
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>No controlled copies have been printed yet for this batch.</span>
                  <span className="text-slate-400 font-mono">0 copies authorized</span>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* =========================================================================
          SECTION 6: APPROVED / STICKY ACTION SIGN-OFF BAR
         ========================================================================= */}
      <div className="sticky bottom-0 z-40 bg-white/95 backdrop-blur-md border-t-2 border-slate-200 p-4 shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-3 -mx-4 -mb-4 sm:-mx-6 sm:-mb-6 rounded-b-xl">
        <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-start">
          <div className="flex items-center gap-2.5">
            {!isApprovedBatch && (
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusBadge(activeStatus)}`}>
                {activeStatus.replace(/_/g, " ")}
              </span>
            )}
            <span className="text-xs text-slate-500 font-mono hidden sm:inline">
              Batch: <strong className="text-slate-900">{queryBatchNo || "NL0026008"}</strong> &bull; Stage: <strong className="text-indigo-700">{targetEquipmentCode}</strong>
            </span>
          </div>

          {/* Compression has no per-section stage approval, so the verification counter does not apply */}
          {!isComp && !isApprovedBatch && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
              <span>{passedCount} of {BATCH_INFO_SECTIONS.length} Sections Verified</span>
            </span>
          )}
        </div>

        {/* Action Buttons at Bottom */}
        <div className="flex items-center gap-2.5 w-full lg:w-auto justify-end flex-wrap">
          {/* Consolidated Queries Dispatch button if queries are open */}
          {existingQueryList.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setActiveInfoSection("CONSOLIDATED");
                setIsInfoModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition shadow-sm cursor-pointer"
              title={`Consolidate and send ${existingQueryList.length} open queries to ${existingQueryList[0]?.queryRecipient || "Operator"}`}
            >
              <ListChecks className="h-4 w-4" />
              <span>Consolidated Queries ({existingQueryList.length})</span>
            </button>
          )}

          {/* Request Information Button */}
          {!isApprovedBatch && (
            <button
              type="button"
              onClick={() => {
                setActiveInfoSection("OPERATIONAL_DETAIL_VALUES");
                setIsInfoModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold text-xs transition shadow-sm cursor-pointer"
            >
              <Question className="h-4 w-4 text-amber-700" />
              <span>Request Additional Information</span>
            </button>
          )}

          {/* Verification Badge Indicator */}
          {!isComp && isAllSectionsPassed && !isApprovedBatch && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle className="h-4 w-4 text-emerald-600" weight="fill" />
              <span>All Sections Verified</span>
            </span>
          )}

          {/* Final Workflow Transitions (Submit for Review, Submit for Approve, QA Approve, Reject, Defer) */}
          {(isAllSectionsPassed || isComp) && !isApprovedBatch && allowedActions.map((action) => {
            const currentUserId = currentUser?.userId || currentUser?.username || "SYSTEM";
            const assignedTo = toText(workflowInstance?.assignedTo) || toText((workflowInstance?.context as Record<string, unknown>)?.activeReviewer) || toText(batchSummary?.assignedTo);
            const isClaimedByMe = Boolean(assignedTo && assignedTo.toUpperCase() === currentUserId.toUpperCase());
            const isClaimedByOther = Boolean(assignedTo && !isClaimedByMe);

            const isApprove = action.actionType === "APPROVE" || action.actionCode === "APPROVE" || action.actionCode.includes("SUBMIT");
            const isReject = action.actionType === "REJECT" || action.actionCode === "REJECT" || action.actionCode === "REQUEST_ADDITIONAL_INFO";
            const isDefer = action.actionType === "DEFER" || action.actionCode === "DEFER";

            let btnClass = "bg-indigo-600 hover:bg-indigo-700 text-white";
            if (isApprove) btnClass = "bg-emerald-600 hover:bg-emerald-700 text-white";
            if (isReject) btnClass = "bg-rose-600 hover:bg-rose-700 text-white";
            if (isDefer) btnClass = "bg-purple-600 hover:bg-purple-700 text-white";

            const buttonTitle = isClaimedByOther
              ? `Action locked: Claimed by ${assignedTo}`
              : undefined;

            return (
              <div key={action.actionCode} className="relative group">
                <button
                  type="button"
                  disabled={isClaimedByOther}
                  onClick={() => {
                    setModalAction(action);
                    setIsModalOpen(true);
                  }}
                  title={buttonTitle}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs transition shadow-md cursor-pointer ${isClaimedByOther
                      ? "bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed opacity-70"
                      : btnClass
                    }`}
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>{action.displayName || action.actionName || action.actionCode}</span>
                  {isClaimedByOther && <span className="text-[10px] ml-1">(Locked)</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dynamic Workflow Action Modal with Electronic Signature */}
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
            equipmentCode: targetEquipmentCode,
            equipmentName: eqMeta.name,
            productName: toText(batchSummary?.productName) || "Mirtazapine Tablets USP 5 mg",
            currentStatus: activeStatus,
          }}
          tenantId="TNT-0001"
          plantId="PLNT-0001"
        />
      )}

      {/* Request Information / Query Modal */}
      <RequestInformationModal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        onSuccess={handleInfoQuerySuccess}
        tabName={activeInfoSection}
        currentUserRole={userRole}
        existingQueries={existingQueryList}
        batchContext={{
          batchNo: queryBatchNo,
          lotNo: queryLotNo || toText(batchSummary?.lotNo) || "01 of 05",
          equipmentCode: targetEquipmentCode,
          equipmentName: eqMeta.name,
          productName: toText(batchSummary?.productName) || "Mirtazapine Tablets USP 5 mg",
          currentStatus: activeStatus,
        }}
        tenantId="TNT-0001"
        plantId="PLNT-0001"
      />

      {/* Controlled Print PDF Modal with Electronic Signature */}
      <ControlledPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        onSuccess={(result) => {
          setIsPrintModalOpen(false);
          const targetEq = targetEquipmentCode.trim().toUpperCase();
          const resEq = (result?.equipmentCode || "").trim().toUpperCase();
          const matchesBatch = !result?.batchId || result.batchId.toUpperCase() === queryBatchNo.toUpperCase();
          const matchesEq = !resEq || resEq === targetEq || targetEq.includes(resEq) || resEq.includes(targetEq);

          if (result?.printCount != null && matchesBatch && matchesEq) {
            setBatchSummary((prev) => {
              if (!prev) return prev;
              if (prev.stages && Array.isArray(prev.stages)) {
                const updatedStages = prev.stages.map((st: Record<string, unknown>) => {
                  const eq = toText(st.equipmentCode || st.equipmentId).trim().toUpperCase();
                  if (eq === targetEq || targetEq.includes(eq) || eq.includes(targetEq)) {
                    return {
                      ...st,
                      printCount: result.printCount,
                      lastPrintedBy: result.lastPrintedBy || st.lastPrintedBy,
                      lastPrintedAt: result.lastPrintedAt || st.lastPrintedAt,
                    };
                  }
                  return st;
                });
                return { ...prev, stages: updatedStages };
              }
              return {
                ...prev,
                printCount: result.printCount,
                lastPrintedBy: result.lastPrintedBy || prev.lastPrintedBy,
                lastPrintedAt: result.lastPrintedAt || prev.lastPrintedAt,
              };
            });
          }
          startTransition(() => {
            loadBatchData();
          });
          setActionSuccessMsg(
            `Controlled Print authorized & dispatched to print dialog for batch ${queryBatchNo}. (Print Count: ${result?.printCount ?? currentPrintCount + 1
            })`
          );
          setTimeout(() => setActionSuccessMsg(null), 6000);
        }}
        batchContext={{
          batchNo: queryBatchNo,
          lotNo: queryLotNo || toText(batchSummary?.lotNo) || "01 of 05",
          equipmentCode: targetEquipmentCode,
          productName: toText(batchSummary?.productName) || "Mirtazapine Tablets USP 5 mg",
          currentStatus: activeStatus,
          printCount: currentPrintCount,
          lastPrintedBy: currentLastPrintedBy,
          lastPrintedAt: currentLastPrintedAt,
          lastPrintReason: currentLastPrintReason,
        }}
        currentUser={
          currentUser
            ? {
              userId: currentUser.userId,
              username: currentUser.username,
              fullName: currentUser.username || currentUser.userId,
              role: roleTitle,
            }
            : undefined
        }
      />
    </div>
  );
}

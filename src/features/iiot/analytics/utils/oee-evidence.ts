import type { CppRecord, CriticalParameterLimit } from "@/features/iiot/equipment/schemas/reports.schema";
import type { OeeBatch, OeeEquipment } from "./oee-engine";

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown): number | undefined => {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const observedTime = (value: unknown) => {
  const timestamp = text(value).replace(" ", "T");
  return Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(timestamp) ? `${timestamp}Z` : timestamp);
};
const normalizedLot = (value: unknown) => text(value).toUpperCase().replace(/^LOT-/, "").replace(/^0+(?=\d)/, "");
const metricCodes: Record<string, string> = {
  "CURRENT (AMP)": "IMP_AMP", "INLET TEMPARATURE": "INLET_TEMP", "ACTUAL RPM": "BLD_SPD",
  "INLET AIR TEMP": "INLET_AIR_TEMP", "EXHAUST AIR TEMP": "EXHAUST_TEMP", "PAN SPEED (RPM)": "PAN_SPEED",
};

export function reportRuntimeHours(value: unknown): number | undefined {
  const match = text(value).match(/^(\d+)\s*Hour\s+(\d+)\s*Min\s*(?:(\d+)\s*Sec)?$/i);
  if (!match || Number(match[2]) >= 60 || Number(match[3] || 0) >= 60) return undefined;
  const hours = Number(match[1]) + Number(match[2]) / 60 + Number(match[3] || 0) / 3600;
  return hours > 0 ? hours : undefined;
}

// Estimates are attached to executions, never persisted as approved standards or QA outcomes.
export function attachOeeEvidence(
  batches: OeeBatch[], equipment: OeeEquipment[], cpp: CppRecord[], limits: CriticalParameterLimit[],
): OeeBatch[] {
  const withReports = batches.map(batch => {
    const eq = equipment.find(e => e.id === batch.equipmentId);
    if (!eq) return batch;
    const start = Date.parse(batch.startAt || ""), end = Date.parse(batch.endAt || "");
    const rows = cpp.filter(row => {
      const meta = object(row.meta);
      const code = text(meta.equipmentCode || meta.equipmentId).toUpperCase();
      if (!eq.aliases?.includes(code) && code !== eq.code) return false;
      if (text(meta.tenantId || row.tenantId) !== eq.tenantId || text(meta.plantId || row.plantId) !== eq.plantId) return false;
      if (text(meta.batchNo) !== batch.batchNo || normalizedLot(meta.derivedLotNo || meta.lotNo) !== normalizedLot(batch.lotNo)) return false;
      const timestamp = observedTime(row.observedAt);
      return Number.isFinite(timestamp) && timestamp >= start && timestamp <= end;
    });
    const evidence: NonNullable<OeeBatch["evidence"]> = {};
    const reports = rows.filter(row => Object.keys(object(row.compression_details)).length > 0);
    if (reports.length === 1) {
      const details = object(reports[0].compression_details);
      const counters = object(details.tabletCounters);
      const total = number(counters.totalCounter), good = number(object(counters.good).count);
      const runtime = reportRuntimeHours(object(details.batchInfo).runningTime);
      const capacity = number(object(details.operationValues).capacityTabsPerHour);
      if (total !== undefined && total > 0 && good !== undefined && good >= 0 && good <= total) {
        evidence.qualityPercent = good / total * 100;
        evidence.qualityBasis = "Report tablet yield (good / total), not QA release";
      }
      if (runtime) evidence.runtimeHours = runtime;
      if (runtime && capacity && capacity > 0 && total !== undefined && total > 0) {
        evidence.idealHours = total / capacity;
        evidence.performanceBasis = "Report output / reported capacity / running hours (not rated ideal speed)";
      }
    } else {
      let assessed = 0, compliant = 0;
      for (const row of rows) {
        for (const [key, raw] of Object.entries(object(row.metrics))) {
          const code = metricCodes[key.toUpperCase()];
          const value = number(raw);
          if (!code || value === undefined) continue;
          if (code === "IMP_AMP" && !text(object(row.meta).status).toUpperCase().includes("IMPELLER")) continue;
          const timestamp = observedTime(row.observedAt);
          const matching = limits.filter(limit => limit.isActive !== false && limit.parameterCode === code
            && (limit.equipmentId === eq.code || limit.equipmentId === eq.aliases?.[1])
            && text(limit.tenantId) === eq.tenantId && text(limit.plantId) === eq.plantId
            && Number.isFinite(Date.parse(text(limit.effectiveFrom))) && Date.parse(text(limit.effectiveFrom)) <= timestamp
            && (!limit.effectiveTo || Date.parse(text(limit.effectiveTo)) >= timestamp))
            .sort((a, b) => Date.parse(text(b.effectiveFrom)) - Date.parse(text(a.effectiveFrom)));
          const limit = matching[0];
          const low = number(limit?.lowerLimitCritical), high = number(limit?.upperLimitCritical);
          if (low === undefined || high === undefined || low > high) continue;
          assessed++;
          if (value >= low && value <= high) compliant++;
        }
      }
      if (assessed) {
        evidence.qualityPercent = compliant / assessed * 100;
        evidence.qualityBasis = `Recorded CPP compliance (${compliant}/${assessed} readings); not product yield/QA`;
      }
    }
    return { ...batch, evidence };
  });
  const median = (values: number[]) => {
    const sorted = values.slice().sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  return withReports.map(batch => {
    const evidence = batch.evidence;
    if (!evidence || evidence.idealHours) return batch;
    const start = Date.parse(batch.startAt || ""), end = Date.parse(batch.endAt || "");
    if (evidence.runtimeHours) {
      // Report runtime is known but capacity is missing: use other same-product report ideals.
      const ideals = withReports.filter(b => b !== batch && b.equipmentId === batch.equipmentId
        && b.productCode.toUpperCase() === batch.productCode.toUpperCase()
        && b.evidence?.runtimeHours && b.evidence.idealHours).map(b => b.evidence!.idealHours!);
      if (ideals.length) {
        evidence.idealHours = median(ideals);
        evidence.performanceBasis = `Report capacity missing; median report ideal of ${ideals.length} other same-product lots (not rated ideal speed)`;
      }
    } else if (end > start) {
      // Collapse same-time lot aliases so replayed summaries cannot manufacture a baseline.
      const peers = Array.from(new Map(batches.filter(b => b.equipmentId === batch.equipmentId
        && b.batchNo !== batch.batchNo && Date.parse(b.endAt || "") > Date.parse(b.startAt || "")
        && !(b.startAt === batch.startAt && b.endAt === batch.endAt)).map(b => [
          `${b.batchNo}|${b.startAt}|${b.endAt}`, b,
        ])).values());
      const sameProduct = peers.filter(b => b.productCode.toUpperCase() === batch.productCode.toUpperCase());
      const baseline = sameProduct.length ? sameProduct : peers;
      const durations = baseline.map(b => (Date.parse(b.endAt!) - Date.parse(b.startAt!)) / 3600000).sort((a, b) => a - b);
      if (durations.length) {
        const middle = Math.floor(durations.length / 2);
        evidence.idealHours = durations.length % 2 ? durations[middle] : (durations[middle - 1] + durations[middle]) / 2;
        evidence.performanceBasis = `Ingested-history median (${durations.length} other ${sameProduct.length ? "same-product" : "equipment, mixed-product"} executions); not validated ideal`;
      }
    }
    return { ...batch, evidence };
  });
}

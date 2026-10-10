import assert from "node:assert/strict";
import { test } from "node:test";
import { attachOeeEvidence, reportRuntimeHours } from "./oee-evidence";
import { calculatePharmaOee, scopeKey, type OeeBatch, type OeeEquipment } from "./oee-engine";
import type { CppRecord, CriticalParameterLimit } from "@/features/iiot/equipment/schemas/reports.schema";

const equipment: OeeEquipment = { id: scopeKey("T1", "P1", "MB005"), code: "MB005",
  name: "Blender", status: "Idle", tenantId: "T1", plantId: "P1", aliases: ["MB005"] };
const batch: OeeBatch = { batchNo: "B1", lotNo: "NA", equipmentId: equipment.id, productCode: "PROD",
  status: "UNKNOWN", startAt: "2026-10-01T06:00:00Z", endAt: "2026-10-01T08:00:00Z" };
const row: CppRecord = { meta: { equipmentCode: "MB005", tenantId: "T1", plantId: "P1", batchNo: "B1", lotNo: "NA" },
  observedAt: "2026-10-01T07:00:00Z", metrics: { "ACTUAL RPM": 12, "UNMAPPED": 999 } };
const limit: CriticalParameterLimit = { equipmentId: "MB005", tenantId: "T1", plantId: "P1",
  parameterCode: "BLD_SPD", effectiveFrom: "2026-01-01T00:00:00Z", lowerLimitCritical: 4, upperLimitCritical: 20 };
const peer = { ...batch, batchNo: "B2", startAt: "2026-09-30T06:00:00Z", endAt: "2026-09-30T07:00:00Z" };
const attach = (records = [row], limits = [limit]) => attachOeeEvidence([batch, peer], [equipment], records, limits);

test("calculates duration efficiency and CPP compliance without approving product", () => {
  const enriched = attach([row, { ...row, observedAt: "2026-10-01T07:30:00Z", metrics: { "ACTUAL RPM": 24 } }]);
  assert.equal(enriched[0].status, "UNKNOWN");
  assert.equal(enriched[0].evidence?.qualityPercent, 50);
  assert.equal(enriched[0].evidence?.idealHours, 1);
  const result = calculatePharmaOee({ equipmentList: [equipment], batchList: enriched, downtimeRecords: [],
    settings: [{ tenantId: "T1", plantId: "P1", equipmentId: "MB005", fromDate: "2026-10-01", toDate: "2026-10-01",
      scheduledShifts: ["Shift 1"], scheduledWeekdays: [4], timeZone: "UTC", downtimeComplete: true, idealBatchHours: {} }],
    fromDate: "2026-10-01", toDate: "2026-10-01", now: new Date("2026-10-02T06:00:00Z") });
  assert.equal(result.performancePercent, 50);
  assert.equal(result.qualityPercent, 50);
  assert.equal(result.overallOeePercent, 25);
  assert.equal(result.estimated, true);
  assert.equal(result.totalGoodReleasedBatches, 0);
});

test("respects scope, lot, observation window and effective limit dates", () => {
  assert.equal(attach([{ ...row, meta: { ...row.meta, tenantId: "T2" } }])[0].evidence?.qualityPercent, undefined);
  assert.equal(attach([{ ...row, meta: { ...row.meta, lotNo: "02" } }])[0].evidence?.qualityPercent, undefined);
  assert.equal(attach([{ ...row, observedAt: "2026-10-01T09:00:00Z" }])[0].evidence?.qualityPercent, undefined);
  assert.equal(attach([row], [{ ...limit, effectiveFrom: "2026-10-02T00:00:00Z" }])[0].evidence?.qualityPercent, undefined);
  assert.equal(attach([{ ...row, metrics: { "ACTUAL RPM": "" } }])[0].evidence?.qualityPercent, undefined);
});

test("does not invent a baseline from a single batch, replay or same-time aliases", () => {
  const aliases = [batch, { ...batch, lotNo: "01" }, { ...batch, batchNo: "ALIAS" }];
  assert.equal(attachOeeEvidence(aliases, [equipment], [row], [limit])[0].evidence?.idealHours, undefined);
  const result = attachOeeEvidence([batch, peer, peer], [equipment], [], []);
  assert.match(result[0].evidence?.performanceBasis || "", /1 other same-product/);
  const mixed = attachOeeEvidence([batch, { ...peer, productCode: "OTHER" }], [equipment], [], []);
  assert.match(mixed[0].evidence?.performanceBasis || "", /mixed-product/);
});

test("uses source report running duration, tablet counters and capacity with timezone-less source dates", () => {
  const compression = { ...equipment, code: "MC081", aliases: ["MC081"], id: scopeKey("T1", "P1", "MC081") };
  const report: CppRecord = { ...row, observedAt: "2026-10-01 08:00:00",
    meta: { ...row.meta, equipmentCode: "MC081", lotNo: "Lot-01" },
    compression_details: { batchInfo: { runningTime: "01 Hour 00 Min00 Sec" },
      operationValues: { capacityTabsPerHour: 200 }, tabletCounters: { totalCounter: 100, good: { count: 90 } } } };
  const result = attachOeeEvidence([{ ...batch, lotNo: "Lot-01", equipmentId: compression.id }], [compression], [report], []);
  assert.equal(result[0].evidence?.qualityPercent, 90);
  assert.equal(result[0].evidence?.idealHours, 0.5);
  assert.equal(result[0].evidence?.runtimeHours, 1);
  assert.equal(reportRuntimeHours("04 Hour   35 Min05 Sec"), 4 + 35 / 60 + 5 / 3600);
  assert.equal(reportRuntimeHours("00 Hour 00 Min00 Sec"), undefined);
  assert.equal(reportRuntimeHours("01 Hour 99 Min"), undefined);
});

test("keeps report runtime when capacity is missing and uses same-product report ideals", () => {
  const compression = { ...equipment, code: "MC081", aliases: ["MC081"], id: scopeKey("T1", "P1", "MC081") };
  const lot = (batchNo: string, at: string, capacity: number): [OeeBatch, CppRecord] => [
    { ...batch, batchNo, lotNo: "Lot-01", equipmentId: compression.id, startAt: at, endAt: at },
    { ...row, observedAt: at, meta: { ...row.meta, equipmentCode: "MC081", batchNo, lotNo: "Lot-01" },
      compression_details: { batchInfo: { runningTime: "02 Hour 00 Min00 Sec" },
        operationValues: { capacityTabsPerHour: capacity }, tabletCounters: { totalCounter: 100, good: { count: 100 } } } }];
  const lots = [lot("B1", "2026-10-01T08:00:00Z", 0), lot("B2", "2026-10-02T08:00:00Z", 100), lot("B3", "2026-10-03T08:00:00Z", 50)];
  const result = attachOeeEvidence(lots.map(l => l[0]), [compression], lots.map(l => l[1]), []);
  assert.equal(result[0].evidence?.runtimeHours, 2);
  assert.equal(result[0].evidence?.idealHours, 1.5);
  assert.match(result[0].evidence?.performanceBasis || "", /capacity missing; median report ideal of 2/);
});

test("configured ideals and final QA outcomes override estimates", () => {
  const result = calculatePharmaOee({ equipmentList: [equipment],
    batchList: [{ ...batch, status: "APPROVED", evidence: { idealHours: 0.1, qualityPercent: 20,
      performanceBasis: "Estimated", qualityBasis: "CPP" } }], downtimeRecords: [],
    settings: [{ tenantId: "T1", plantId: "P1", equipmentId: "MB005", fromDate: "2026-10-01", toDate: "2026-10-01",
      scheduledShifts: ["Shift 1"], scheduledWeekdays: [4], timeZone: "UTC", downtimeComplete: true, idealBatchHours: { PROD: 1 } }],
    fromDate: "2026-10-01", toDate: "2026-10-01", now: new Date("2026-10-02T06:00:00Z") });
  assert.equal(result.performancePercent, 50);
  assert.equal(result.qualityPercent, 100);
  assert.equal(result.estimated, false);
});

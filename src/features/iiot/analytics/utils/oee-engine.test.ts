import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculatePharmaOee, mergeIntervals, scopeKey, productionDate, zonedTimestamp,
  type DowntimeRecord, type OeeSettings, type OeeEquipment, type OeeBatch, type OeeCalculationParams,
} from "./oee-engine";

const equipment: OeeEquipment = { id: scopeKey("T1", "P1", "MC081"), code: "MC081", name: "Compression", status: "Idle", tenantId: "T1", plantId: "P1" };
const settings: OeeSettings = {
  equipmentId: "MC081", tenantId: "T1", plantId: "P1", fromDate: "2026-10-01", toDate: "2026-10-01",
  scheduledShifts: ["Shift 1", "Shift 2", "Shift 3"], scheduledWeekdays: [0, 1, 2, 3, 4, 5, 6],
  idealBatchHours: { PROD: 1 }, downtimeComplete: true, timeZone: "UTC",
};
const batch = (lotNo = "Lot-01", hours = 1, status = "APPROVED"): OeeBatch => ({
  equipmentId: equipment.id, batchNo: "B1", lotNo, productCode: "PROD", status,
  startAt: "2026-10-01T06:00:00Z", endAt: `2026-10-01T${String(6 + hours).padStart(2, "0")}:00:00Z`,
});
const downtime = (startTime: string, endTime: string, classification: "PLANNED" | "UNPLANNED" = "PLANNED"): DowntimeRecord => ({
  id: `${startTime}-${classification}`, equipmentId: "MC081", tenantId: "T1", plantId: "P1",
  date: "2026-10-01", startTime, endTime, durationHours: 999, classification,
  category: classification === "PLANNED" ? "Cleaning" : "Equipment Failure", reason: "Validated log",
  createdAt: "2026-10-02T06:00:00Z", timeZone: "UTC",
});
const calculate = (changes: Partial<OeeCalculationParams> = {}) => calculatePharmaOee({
  equipmentList: [equipment], batchList: [batch()], downtimeRecords: [], settings: [settings],
  fromDate: "2026-10-01", toDate: "2026-10-01", now: new Date("2026-10-02T06:00:00Z"), ...changes,
});

test("calculates A x P x Q from actual inputs, preserving individual lots", () => {
  const result = calculate({ batchList: [batch("Lot-01"), batch("Lot-02", 2), batch("Lot-03", 3, "FAILED")],
    downtimeRecords: [downtime("08:00", "10:00"), downtime("10:00", "11:00", "UNPLANNED")] });
  assert.equal(result.totalCompletedBatches, 3);
  assert.equal(result.totalGoodReleasedBatches, 2);
  assert.equal(result.totalRejectedFailedBatches, 1);
  assert.equal(result.totalScheduledHours, 24);
  assert.equal(result.totalOperatingHours, 21);
  assert.equal(result.availabilityPercent, 95.45);
  assert.equal(result.performancePercent, 50);
  assert.equal(result.qualityPercent, 66.67);
  assert.equal(result.overallOeePercent, 31.82);
});

test("empty data never invents batches or trend inputs", () => {
  const result = calculate({ equipmentList: [], batchList: [], settings: [] });
  assert.equal(result.totalCompletedBatches, 0);
  assert.equal(result.overallOeePercent, null);
  assert.equal(result.availabilityPercent, null);
  assert(result.shiftWise.every(s => s.completedBatches === 0 && s.oeePercent === null));
});

test("daily trend fast path preserves metrics while omitting unused shift calculations", () => {
  const full = calculate({ downtimeRecords: [downtime("08:00", "10:00")] });
  const fast = calculate({ downtimeRecords: [downtime("08:00", "10:00")], includeShiftBreakdown: false });
  assert.deepEqual(fast, { ...full, shiftWise: [] });
});

test("schedule and complete downtime coverage are required", () => {
  assert.equal(calculate({ settings: [] }).availabilityPercent, null);
  const result = calculate({ settings: [{ ...settings, downtimeComplete: false }] });
  assert.equal(result.totalOperatingHours, null);
  assert.equal(result.equipmentUtilizationPercent, null);
  assert.equal(result.performancePercent, 100);
  assert.equal(result.overallOeePercent, null);
});

test("COMPLETED and pending approvals are not good batches or known QA outcomes", () => {
  const result = calculate({ batchList: [batch("Lot-01", 1, "COMPLETED")] });
  assert.equal(result.totalCompletedBatches, 1);
  assert.equal(result.totalGoodReleasedBatches, 0);
  assert.equal(result.qualityPercent, null);
  assert.equal(result.overallOeePercent, null);
});

test("all completed batches need known outcomes, including zero quality", () => {
  assert.equal(calculate({ batchList: [batch("1"), batch("2", 1, "PENDING")] }).qualityPercent, null);
  assert.equal(calculate({ batchList: [batch("1", 1, "FAILED")] }).qualityPercent, 0);
  assert.equal(calculate({ batchList: [batch("1", 1, "FAILED")] }).overallOeePercent, 0);
});

test("performance is weighted by actual duration rather than averaged percentages", () => {
  const second = { ...equipment, code: "G5RMG", id: scopeKey("T1", "P1", "G5RMG") };
  const result = calculate({
    equipmentList: [equipment, second],
    settings: [settings, { ...settings, equipmentId: "G5RMG", idealBatchHours: { PROD: 1 } }],
    batchList: [batch(), { ...batch("2", 4), equipmentId: second.id }],
  });
  assert.equal(result.equipmentWise[0].performancePercent, 100);
  assert.equal(result.equipmentWise[1].performancePercent, 25);
  assert.equal(result.performancePercent, 40);
});

test("missing ideal or invalid runtime prevents success-shaped performance", () => {
  assert.equal(calculate({ batchList: [{ ...batch(), productCode: "UNKNOWN" }] }).performancePercent, null);
  assert.equal(calculate({ batchList: [{ ...batch(), startAt: null }] }).performancePercent, null);
  assert.equal(calculate({ batchList: [{ ...batch(), startAt: batch().endAt }] }).performancePercent, null);
});

test("filters by inclusive production dates and completion shift, not by synthetic thirds", () => {
  const result = calculate({ batchList: [batch(), {
    ...batch("2"), startAt: "2026-10-01T23:00:00Z", endAt: "2026-10-02T03:00:00Z",
  }, { ...batch("3"), startAt: "2026-09-30T06:00:00Z", endAt: "2026-09-30T07:00:00Z" }] });
  assert.equal(result.totalCompletedBatches, 2);
  assert.deepEqual(result.shiftWise.map(s => s.completedBatches), [1, 0, 1]);
  assert.equal(calculate({ selectedShift: "Shift 2" }).totalCompletedBatches, 0);
});

test("clips current-day schedules at now, never includes future completions", () => {
  const result = calculate({ now: new Date("2026-10-01T08:00:00Z"), batchList: [batch(), batch("2", 3)] });
  assert.equal(result.totalScheduledHours, 2);
  assert.equal(result.totalCompletedBatches, 1);
  assert.equal(result.shiftWise[2].scheduledHours, 0);
});

test("overlap union and planned precedence prevent duplicate downtime", () => {
  const result = calculate({ downtimeRecords: [
    downtime("08:00", "10:00"), downtime("09:00", "11:00"),
    downtime("10:00", "12:00", "UNPLANNED"), downtime("11:30", "12:00", "UNPLANNED"),
  ] });
  assert.equal(result.totalPlannedDowntimeHours, 3);
  assert.equal(result.totalUnplannedDowntimeHours, 1);
  assert.equal(result.totalOperatingHours, 20);
  assert.equal(result.downtimeSegments.reduce((sum, s) => sum + s.hours, 0), 4);
});

test("ignores other dates, equipment, tenants and plants in downtime totals", () => {
  const result = calculate({ downtimeRecords: [
    { ...downtime("08:00", "10:00"), tenantId: "T2" },
    { ...downtime("08:00", "10:00"), plantId: "P2" },
    { ...downtime("08:00", "10:00"), equipmentId: "OTHER" },
    { ...downtime("08:00", "10:00"), date: "2026-09-01" },
  ] });
  assert.equal(result.totalPlannedDowntimeHours, 0);
  assert.equal(result.downtimeSegments.length, 0);
});

test("overnight downtime is clipped into the correct shift", () => {
  const result = calculate({ selectedShift: "Shift 3", downtimeRecords: [downtime("21:00", "01:00")] });
  assert.equal(result.totalScheduledHours, 8);
  assert.equal(result.totalPlannedDowntimeHours, 3);
});

test("plant timezone is independent of the browser or process timezone", () => {
  assert.equal(zonedTimestamp("2026-10-01", 6, 0, "Asia/Kolkata"), Date.parse("2026-10-01T00:30:00Z"));
  assert.equal(productionDate(new Date("2026-10-01T00:29:00Z"), "Asia/Kolkata"), "2026-09-30");
  const result = calculate({ settings: [{ ...settings, timeZone: "Asia/Kolkata" }],
    now: new Date("2026-10-02T00:30:00Z"),
    downtimeRecords: [{ ...downtime("08:00", "10:00"), timeZone: "Asia/Kolkata" }] });
  assert.equal(result.totalScheduledHours, 24);
  assert.equal(result.totalPlannedDowntimeHours, 2);
});

test("DST shifts use real elapsed hours", () => {
  const result = calculate({ fromDate: "2026-10-31", toDate: "2026-10-31", selectedShift: "Shift 3",
    settings: [{ ...settings, fromDate: "2026-10-31", toDate: "2026-10-31", timeZone: "America/New_York" }],
    now: new Date("2026-11-02T00:00:00Z") });
  assert.equal(result.totalScheduledHours, 9);
});

test("partial schedule coverage scores only the covered days and reports coverage", () => {
  const result = calculate({ toDate: "2026-10-03", now: new Date("2026-10-04T06:00:00Z") });
  assert.equal(result.totalScheduledHours, 24);
  assert.equal(result.availabilityPercent, 100);
  assert.deepEqual(result.scheduleCoverage, { coveredDays: 1, rangeDays: 3, scheduledEquipment: 1, availabilityEquipment: 1, totalEquipment: 1 });
  assert.equal(result.equipmentWise[0].scheduleCoveredDays, 1);
  assert.equal(result.equipmentWise[0].rangeDays, 3);
});

test("no schedule overlap or no scheduled weekday leaves availability unavailable", () => {
  assert.equal(calculate({ fromDate: "2026-10-05", toDate: "2026-10-06" }).totalScheduledHours, null);
  assert.equal(calculate({ settings: [{ ...settings, scheduledWeekdays: [0] }] }).availabilityPercent, null);
});

test("plant availability uses equipment with schedules when others have none", () => {
  const other: OeeEquipment = { ...equipment, id: scopeKey("T1", "P1", "MB041"), code: "MB041" };
  const result = calculate({ equipmentList: [equipment, other] });
  assert.equal(result.availabilityPercent, 100);
  assert.equal(result.scheduleCoverage.availabilityEquipment, 1);
  assert.equal(result.scheduleCoverage.totalEquipment, 2);
  assert.equal(result.equipmentWise[1].availabilityPercent, null);
});

test("interval merging does not mutate its caller's data", () => {
  const input = [{ start: 1, end: 3 }, { start: 2, end: 4 }];
  assert.deepEqual(mergeIntervals(input), [{ start: 1, end: 4 }]);
  assert.equal(input[0].end, 3);
});

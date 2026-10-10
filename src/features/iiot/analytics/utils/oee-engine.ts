export type ShiftId = "Shift 1" | "Shift 2" | "Shift 3";
export type Interval = { start: number; end: number };

export interface DowntimeRecord {
  id: string;
  equipmentId: string;
  tenantId: string;
  plantId: string;
  date: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  reason: string;
  classification: "PLANNED" | "UNPLANNED";
  category: string;
  comments?: string;
  createdAt: string;
  timeZone: string;
  isTestData?: boolean;
}

export interface OeeSettings {
  equipmentId: string;
  tenantId: string;
  plantId: string;
  fromDate: string;
  toDate: string;
  scheduledShifts: ShiftId[];
  scheduledWeekdays: number[];
  idealBatchHours: Record<string, number>;
  downtimeComplete: boolean;
  timeZone: string;
  isTestData?: boolean;
}

export interface OeeEquipment {
  id: string;
  code: string;
  name: string;
  status: string;
  tenantId: string;
  plantId: string;
  aliases?: string[];
}

export interface OeeBatch {
  batchNo: string;
  lotNo: string;
  equipmentId: string;
  productCode: string;
  status: string;
  startAt?: string | null;
  endAt?: string | null;
  evidence?: {
    runtimeHours?: number;
    idealHours?: number;
    qualityPercent?: number;
    performanceBasis?: string;
    qualityBasis?: string;
  };
}

export const DEFAULT_SHIFTS: { id: ShiftId; name: string; startHour: number; endHour: number }[] = [
  { id: "Shift 1", name: "Shift 1 (06:00 - 14:00)", startHour: 6, endHour: 14 },
  { id: "Shift 2", name: "Shift 2 (14:00 - 22:00)", startHour: 14, endHour: 22 },
  { id: "Shift 3", name: "Shift 3 (22:00 - 06:00)", startHour: 22, endHour: 30 },
];

export const PLANNED_DOWNTIME_CATEGORIES = [
  "Preventive Maintenance", "Cleaning", "Changeover", "Calibration",
  "Planned Shutdown", "Break", "Other Planned Downtime",
] as const;
export const UNPLANNED_DOWNTIME_CATEGORIES = [
  "Equipment Failure", "Minor Stoppage", "Process Deviation", "Utility Failure", "Unplanned Breakdown",
] as const;

export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseLocalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) && localDate(date) === value ? date : null;
}

export function getShiftForDate(date: Date): ShiftId {
  const hour = date.getHours();
  return hour >= 6 && hour < 14 ? "Shift 1" : hour >= 14 && hour < 22 ? "Shift 2" : "Shift 3";
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();
const zonedTimestamps = new Map<string, number>();

function zoneParts(date: Date, timeZone: string) {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    zoneFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

export function productionDate(date: Date, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const parts = zoneParts(date, timeZone);
  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (parts.hour < 6) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

export function zonedTimestamp(date: string, hour: number, minute: number, timeZone: string): number {
  const key = `${timeZone}|${date}|${hour}|${minute}`;
  const cached = zonedTimestamps.get(key);
  if (cached !== undefined) return cached;
  const day = new Date(`${date}T00:00:00Z`);
  const desired = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute);
  let timestamp = desired;
  for (let i = 0; i < 4; i++) {
    const p = zoneParts(new Date(timestamp), timeZone);
    const delta = desired - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    if (!delta) {
      if (zonedTimestamps.size >= 4096) zonedTimestamps.clear();
      zonedTimestamps.set(key, timestamp);
      return timestamp;
    }
    timestamp += delta;
  }
  throw new Error(`Time ${date} ${hour}:${minute} does not exist in timezone ${timeZone}.`);
}

export function scopeKey(tenantId: string, plantId: string, equipmentId: string): string {
  return `${tenantId}|${plantId}|${equipmentId.trim().toUpperCase()}`;
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter(i => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .map(i => ({ ...i })).sort((a, b) => a.start - b.start);
  const result: Interval[] = [];
  for (const current of sorted) {
    const previous = result[result.length - 1];
    if (previous && current.start <= previous.end) previous.end = Math.max(previous.end, current.end);
    else result.push(current);
  }
  return result;
}

function intersect(left: Interval[], right: Interval[]): Interval[] {
  return mergeIntervals(left.flatMap(a => right.map(b => ({
    start: Math.max(a.start, b.start), end: Math.min(a.end, b.end),
  }))));
}

function subtract(intervals: Interval[], removed: Interval[]): Interval[] {
  return removed.reduce((current, cut) => current.flatMap(i => {
    if (cut.end <= i.start || cut.start >= i.end) return [i];
    return [
      { start: i.start, end: Math.min(i.end, cut.start) },
      { start: Math.max(i.start, cut.end), end: i.end },
    ].filter(part => part.end > part.start);
  }), intervals);
}

const hours = (intervals: Interval[]) => intervals.reduce((sum, i) => sum + (i.end - i.start) / 3_600_000, 0);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
const round = (n: number) => Number(n.toFixed(2));
const percent = (part: number, total: number): number | null => total > 0 ? Math.min(100, Math.max(0, part / total * 100)) : null;
const rounded = (n: number | null) => n === null ? null : round(n);
const goodStatuses = new Set(["APPROVED", "QA_APPROVED", "RELEASED", "GOOD"]);
const badStatuses = new Set(["REJECTED", "FAILED", "DEVIATION_REJECTED"]);

export interface EquipmentOeeResult {
  estimated: boolean;
  calculationBasis: string;
  scopeKey: string;
  equipmentId: string;
  equipmentName: string;
  status: string;
  scheduledTimeHours: number | null;
  plannedDowntimeHours: number;
  plannedProductionTimeHours: number | null;
  unplannedDowntimeHours: number;
  operatingTimeHours: number | null;
  availabilityPercent: number | null;
  performancePercent: number | null;
  performanceStatus: "AVAILABLE" | "CONFIG_REQUIRED";
  qualityPercent: number | null;
  qualityStatus: "AVAILABLE" | "DATA_UNAVAILABLE";
  oeePercent: number | null;
  oeeStatus: "AVAILABLE" | "INCOMPLETE_DATA";
  equipmentUtilizationPercent: number | null;
  totalCompletedBatches: number;
  goodReleasedBatches: number;
  rejectedFailedBatches: number;
  /** Days of the selected range covered by this equipment's saved schedule. */
  scheduleCoveredDays: number;
  rangeDays: number;
}

export interface ShiftOeeResult {
  shiftId: ShiftId;
  shiftName: string;
  scheduledHours: number | null;
  plannedDowntimeHours: number;
  unplannedDowntimeHours: number;
  operatingHours: number | null;
  availabilityPercent: number | null;
  completedBatches: number;
  goodReleasedBatches: number;
  rejectedBatches: number;
  qualityPercent: number | null;
  performancePercent: number | null;
  oeePercent: number | null;
}

export interface OverallOeeCalculation {
  estimated: boolean;
  overallOeePercent: number | null;
  oeeStatus: "AVAILABLE" | "INCOMPLETE_DATA";
  availabilityPercent: number | null;
  performancePercent: number | null;
  performanceStatus: "AVAILABLE" | "CONFIG_REQUIRED";
  qualityPercent: number | null;
  qualityStatus: "AVAILABLE" | "DATA_UNAVAILABLE";
  equipmentUtilizationPercent: number | null;
  scheduleCoverage: { coveredDays: number; rangeDays: number; scheduledEquipment: number; availabilityEquipment: number; totalEquipment: number };
  totalOperatingHours: number | null;
  totalPlannedDowntimeHours: number;
  totalUnplannedDowntimeHours: number;
  totalScheduledHours: number | null;
  totalCompletedBatches: number;
  totalGoodReleasedBatches: number;
  totalRejectedFailedBatches: number;
  equipmentWise: EquipmentOeeResult[];
  shiftWise: ShiftOeeResult[];
  downtimeSegments: { label: string; hours: number; percent: number; color: string; gradientTo: string; classification: "PLANNED" | "UNPLANNED" }[];
}

export interface OeeCalculationParams {
  equipmentList: OeeEquipment[];
  batchList: OeeBatch[];
  downtimeRecords: DowntimeRecord[];
  settings: OeeSettings[];
  fromDate: string;
  toDate: string;
  selectedShift?: "ALL" | ShiftId;
  now?: Date;
  includeShiftBreakdown?: boolean;
}

export function productionWindows(from: string, to: string, shifts: ShiftId[], now: Date, timeZone: string, weekdays?: number[]): Interval[] {
  const first = parseLocalDate(from);
  const last = parseLocalDate(to);
  if (!first || !last || first > last) return [];
  const result: Interval[] = [];
  for (const day = new Date(first); day <= last; day.setDate(day.getDate() + 1)) {
    const date = localDate(day);
    if (weekdays && !weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue;
    for (const shift of DEFAULT_SHIFTS.filter(s => shifts.includes(s.id))) {
      const interval = { start: zonedTimestamp(date, shift.startHour, 0, timeZone),
        end: Math.min(zonedTimestamp(date, shift.endHour, 0, timeZone), now.getTime()) };
      if (interval.end > interval.start) result.push(interval);
    }
  }
  return mergeIntervals(result);
}

export function downtimeInterval(record: DowntimeRecord): Interval[] {
  const [startHour, startMinute] = record.startTime.split(":").map(Number);
  const [endHour, endMinute] = record.endTime.split(":").map(Number);
  if (record.startTime === record.endTime) return [];
  const overnight = endHour * 60 + endMinute < startHour * 60 + startMinute;
  return [{ start: zonedTimestamp(record.date, startHour, startMinute, record.timeZone),
    end: zonedTimestamp(record.date, endHour + (overnight ? 24 : 0), endMinute, record.timeZone) }];
}

function aggregate(params: OeeCalculationParams, shift: "ALL" | ShiftId) {
  const { equipmentList, batchList, downtimeRecords, settings, fromDate, toDate, now = new Date() } = params;
  const selectedShifts = shift === "ALL" ? DEFAULT_SHIFTS.map(s => s.id) : [shift];
  let scheduled = 0, planned = 0, unplanned = 0, operating = 0, actual = 0, ideal = 0;
  let completed = 0, good = 0, rejected = 0, qualitySum = 0;
  let scheduledEquipment = 0, availEquipment = 0, availScheduled = 0, availPlanned = 0, maxCoveredDays = 0;
  const rangeDays = parseLocalDate(fromDate) && parseLocalDate(toDate) && fromDate <= toDate ? daysBetween(fromDate, toDate) : 0;
  let performanceKnown = true, qualityKnown = true;
  const segments = new Map<string, { hours: number; classification: "PLANNED" | "UNPLANNED"; label: string }>();
  const equipmentWise: EquipmentOeeResult[] = equipmentList.map(eq => {
    const config = settings.find(s => scopeKey(s.tenantId, s.plantId, s.equipmentId) === eq.id);
    const timeZone = config?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const scope = productionWindows(fromDate, toDate, selectedShifts, now, timeZone);
    // Schedule only the part of the selected range that the saved configuration covers;
    // days outside it are treated as not scheduled (excluded from availability), not as zero output.
    const coveredFrom = config && config.fromDate > fromDate ? config.fromDate : fromDate;
    const coveredTo = config && config.toDate < toDate ? config.toDate : toDate;
    const covered = Boolean(config && parseLocalDate(fromDate) && parseLocalDate(toDate)
      && fromDate <= toDate && coveredFrom <= coveredTo);
    const coveredDays = covered ? daysBetween(coveredFrom, coveredTo) : 0;
    const scheduledWindows = covered && config
      ? productionWindows(coveredFrom, coveredTo, config.scheduledShifts.filter(s => selectedShifts.includes(s)), now, timeZone, config.scheduledWeekdays) : [];
    const downtimeScope = covered ? scheduledWindows : scope;
    const records = downtimeRecords.filter(d => scopeKey(d.tenantId, d.plantId, d.equipmentId) === eq.id);
    const plannedWindows = intersect(records.filter(d => d.classification === "PLANNED").flatMap(downtimeInterval), downtimeScope);
    // Planned downtime takes precedence where classifications overlap.
    const unplannedWindows = subtract(intersect(records.filter(d => d.classification === "UNPLANNED").flatMap(downtimeInterval), downtimeScope), plannedWindows);
    const eqScheduled = covered ? hours(scheduledWindows) : null;
    const eqPlanned = hours(plannedWindows), eqUnplanned = hours(unplannedWindows);
    const eqProduction = eqScheduled === null ? null : Math.max(0, eqScheduled - eqPlanned);
    const eqOperating = config?.downtimeComplete && eqProduction !== null ? Math.max(0, eqProduction - eqUnplanned) : null;
    const eqAvailability = eqOperating !== null && eqProduction !== null ? percent(eqOperating, eqProduction) : null;
    let attributed: Interval[] = [];
    for (const record of [...records.filter(r => r.classification === "PLANNED"), ...records.filter(r => r.classification === "UNPLANNED")]) {
      const pieces = subtract(intersect(downtimeInterval(record), downtimeScope), attributed);
      attributed = mergeIntervals([...attributed, ...pieces]);
      const value = hours(pieces);
      if (!value) continue;
      const key = `${record.classification}|${record.category}`;
      const previous = segments.get(key);
      segments.set(key, { hours: (previous?.hours ?? 0) + value, classification: record.classification, label: record.category });
    }
    // Count complete batch/lot executions once, in the shift containing completion.
    const eqCompleted = batchList.filter(b => {
      const end = b.endAt ? new Date(b.endAt).getTime() : NaN;
      return b.equipmentId === eq.id && Number.isFinite(end) && scope.some(w => end > w.start && end <= w.end);
    });
    const eqGood = eqCompleted.filter(b => goodStatuses.has(b.status.toUpperCase())).length;
    const eqRejected = eqCompleted.filter(b => badStatuses.has(b.status.toUpperCase())).length;
    let eqActual = 0, eqIdeal = 0;
    const bases = new Set<string>();
    const eqPerformanceKnown = eqCompleted.every(b => {
      const start = b.startAt ? new Date(b.startAt).getTime() : NaN;
      const end = b.endAt ? new Date(b.endAt).getTime() : NaN;
      const duration = b.evidence?.runtimeHours ?? (end - start) / 3_600_000;
      const configuredIdeal = config?.idealBatchHours[b.productCode.toUpperCase()];
      const date = productionDate(new Date(end - 1), timeZone);
      const validConfig = config && date >= config.fromDate && date <= config.toDate;
      const idealHours = validConfig && configuredIdeal ? configuredIdeal : b.evidence?.idealHours;
      if (!Number.isFinite(duration) || duration <= 0 || !idealHours || !Number.isFinite(idealHours) || idealHours <= 0) return false;
      if (!(validConfig && configuredIdeal) && b.evidence?.performanceBasis) bases.add(b.evidence.performanceBasis);
      eqActual += duration;
      eqIdeal += idealHours;
      return true;
    });
    let eqQualitySum = 0;
    const eqQualityKnown = eqCompleted.every(b => {
      if (goodStatuses.has(b.status.toUpperCase())) { eqQualitySum += 100; return true; }
      if (badStatuses.has(b.status.toUpperCase())) return true;
      const value = b.evidence?.qualityPercent;
      if (value === undefined || !Number.isFinite(value) || value < 0 || value > 100) return false;
      eqQualitySum += value;
      if (b.evidence?.qualityBasis) bases.add(b.evidence.qualityBasis);
      return true;
    });
    const performance = eqPerformanceKnown && eqCompleted.length ? percent(eqIdeal, eqActual) : null;
    const quality = eqQualityKnown && eqCompleted.length ? eqQualitySum / eqCompleted.length : null;
    const oee = eqAvailability !== null && performance !== null && quality !== null ? eqAvailability * performance * quality / 10_000 : null;
    planned += eqPlanned; unplanned += eqUnplanned;
    if (eqScheduled !== null) { scheduled += eqScheduled; scheduledEquipment++; }
    if (eqOperating !== null && eqScheduled !== null) {
      operating += eqOperating; availScheduled += eqScheduled; availPlanned += eqPlanned; availEquipment++;
    }
    maxCoveredDays = Math.max(maxCoveredDays, coveredDays);
    performanceKnown &&= eqPerformanceKnown; qualityKnown &&= eqQualityKnown;
    actual += eqActual; ideal += eqIdeal;
    completed += eqCompleted.length; good += eqGood; rejected += eqRejected;
    qualitySum += eqQualitySum;
    return {
      estimated: bases.size > 0, calculationBasis: Array.from(bases).join("; ") || "Validated ideal duration / final manufacturing outcome",
      scopeKey: eq.id, equipmentId: eq.code, equipmentName: eq.name, status: eq.status,
      scheduledTimeHours: rounded(eqScheduled), plannedDowntimeHours: round(eqPlanned),
      plannedProductionTimeHours: rounded(eqProduction), unplannedDowntimeHours: round(eqUnplanned),
      operatingTimeHours: rounded(eqOperating), availabilityPercent: rounded(eqAvailability),
      performancePercent: rounded(performance), performanceStatus: performance === null ? "CONFIG_REQUIRED" : "AVAILABLE",
      qualityPercent: rounded(quality), qualityStatus: quality === null ? "DATA_UNAVAILABLE" : "AVAILABLE",
      oeePercent: rounded(oee), oeeStatus: oee === null ? "INCOMPLETE_DATA" : "AVAILABLE",
      equipmentUtilizationPercent: rounded(eqOperating !== null && eqScheduled !== null ? percent(eqOperating, eqScheduled) : null),
      totalCompletedBatches: eqCompleted.length, goodReleasedBatches: eqGood, rejectedFailedBatches: eqRejected,
      scheduleCoveredDays: coveredDays, rangeDays,
    } satisfies EquipmentOeeResult;
  });
  const scheduleKnown = scheduledEquipment > 0, downtimeKnown = availEquipment > 0;
  const availability = downtimeKnown ? percent(operating, availScheduled - availPlanned) : null;
  const performance = performanceKnown && completed > 0 ? percent(ideal, actual) : null;
  const quality = qualityKnown && completed ? qualitySum / completed : null;
  const oee = availability !== null && performance !== null && quality !== null ? availability * performance * quality / 10_000 : null;
  const totalDt = planned + unplanned;
  return {
    estimated: equipmentWise.some(eq => eq.estimated),
    overallOeePercent: rounded(oee), oeeStatus: oee === null ? "INCOMPLETE_DATA" as const : "AVAILABLE" as const,
    availabilityPercent: rounded(availability), performancePercent: rounded(performance),
    performanceStatus: performance === null ? "CONFIG_REQUIRED" as const : "AVAILABLE" as const,
    qualityPercent: rounded(quality), qualityStatus: quality === null ? "DATA_UNAVAILABLE" as const : "AVAILABLE" as const,
    equipmentUtilizationPercent: rounded(downtimeKnown ? percent(operating, availScheduled) : null),
    scheduleCoverage: { coveredDays: maxCoveredDays, rangeDays, scheduledEquipment, availabilityEquipment: availEquipment,
      totalEquipment: equipmentList.length },
    totalOperatingHours: downtimeKnown ? round(operating) : null, totalScheduledHours: scheduleKnown ? round(scheduled) : null,
    totalPlannedDowntimeHours: round(planned), totalUnplannedDowntimeHours: round(unplanned),
    totalCompletedBatches: completed, totalGoodReleasedBatches: good, totalRejectedFailedBatches: rejected,
    equipmentWise,
    downtimeSegments: Array.from(segments.values()).map((s, i) => ({
      ...s, hours: round(s.hours), percent: round(totalDt > 0 ? s.hours / totalDt * 100 : 0),
      color: ["#806BDF", "#EF646E", "#2FB1A6", "#3F7ED4", "#f59e0b"][i % 5],
      gradientTo: "#94a3b8",
    })),
  };
}

export function calculatePharmaOee(params: OeeCalculationParams): OverallOeeCalculation {
  const overall = aggregate(params, params.selectedShift ?? "ALL");
  return {
    ...overall,
    shiftWise: (params.includeShiftBreakdown === false ? [] : DEFAULT_SHIFTS)
      .filter(s => !params.selectedShift || params.selectedShift === "ALL" || params.selectedShift === s.id).map(shift => {
      const result = aggregate(params, shift.id);
      return {
        shiftId: shift.id, shiftName: shift.name, scheduledHours: result.totalScheduledHours,
        plannedDowntimeHours: result.totalPlannedDowntimeHours, unplannedDowntimeHours: result.totalUnplannedDowntimeHours,
        operatingHours: result.totalOperatingHours, availabilityPercent: result.availabilityPercent,
        completedBatches: result.totalCompletedBatches, goodReleasedBatches: result.totalGoodReleasedBatches,
        rejectedBatches: result.totalRejectedFailedBatches, qualityPercent: result.qualityPercent,
        performancePercent: result.performancePercent, oeePercent: result.overallOeePercent,
      };
    }),
  };
}

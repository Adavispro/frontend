import {
  calculatePharmaOee, DEFAULT_SHIFTS, downtimeInterval, localDate, parseLocalDate,
  productionWindows, scopeKey, type OeeCalculationParams, type OverallOeeCalculation,
  type DowntimeRecord,
} from "./oee-engine";

export interface OeeWorkerRequest {
  id: number;
  params: OeeCalculationParams;
}

export type OeeWorkerResponse = {
  id: number;
  calculation: OverallOeeCalculation;
  trendPoints: { label: string; oee: number | null }[];
  visibleDowntime: DowntimeRecord[];
} | { id: number; error: string };

const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

self.onmessage = (event: MessageEvent<OeeWorkerRequest>) => {
  const { id, params: input } = event.data;
  try {
    const params = { ...input, now: new Date(input.now || Date.now()) };
    const calculation = calculatePharmaOee(params);
    const trendPoints: { label: string; oee: number | null }[] = [];
    const start = parseLocalDate(params.fromDate), end = parseLocalDate(params.toDate);
    if (start && end) {
      for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
        const date = localDate(day);
        const point = calculatePharmaOee({ ...params, fromDate: date, toDate: date, includeShiftBreakdown: false });
        trendPoints.push({ label: formatter.format(day), oee: point.overallOeePercent });
      }
    }
    const windowsByEquipment = new Map(params.equipmentList.map(eq => {
      const config = params.settings.find(s => scopeKey(s.tenantId, s.plantId, s.equipmentId) === eq.id
        && s.fromDate <= params.fromDate && s.toDate >= params.toDate);
      const shifts = !params.selectedShift || params.selectedShift === "ALL"
        ? DEFAULT_SHIFTS.map(s => s.id) : [params.selectedShift];
      const timeZone = config?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      return [eq.id, productionWindows(params.fromDate, params.toDate,
        config ? config.scheduledShifts.filter(s => shifts.includes(s)) : shifts,
        params.now, timeZone, config?.scheduledWeekdays)] as const;
    }));
    const visibleDowntime = params.downtimeRecords.filter(record => {
      const windows = windowsByEquipment.get(scopeKey(record.tenantId, record.plantId, record.equipmentId));
      return windows && downtimeInterval(record).some(i => windows.some(w => i.start < w.end && i.end > w.start));
    });
    self.postMessage({ id, calculation, trendPoints, visibleDowntime } satisfies OeeWorkerResponse);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "OEE calculation failed." } satisfies OeeWorkerResponse);
  }
};

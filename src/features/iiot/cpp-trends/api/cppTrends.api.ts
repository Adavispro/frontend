import { z } from "zod";
import { apiClient, parseApiData } from "@/api";
import type { BackendApiResponse } from "@/api/types";

const num = z.number().nullable().optional();
const limitsSchema = z.object({
  setpoint: num, lowerWarning: num, upperWarning: num, lowerCritical: num, upperCritical: num,
  source: z.string().nullable().optional(),
});
const statusSchema = z.enum(["OK", "WARNING", "CRITICAL", "NO_LIMITS"]);
const pointSchema = z.object({
  t: z.number(), elapsedMin: z.number(), value: z.number(), min: num, max: num,
  status: statusSchema, label: z.string().nullable().optional(), limits: limitsSchema.optional(),
});
const statsSchema = z.object({
  count: z.number(), min: num, max: num, mean: num, sd: num,
  warningCount: z.number(), criticalCount: z.number(), inLimitPct: num, cpk: num,
});
const seriesSchema = z.object({
  key: z.string(), batchNo: z.string(), lotNo: z.string().nullable().optional(),
  productCode: z.string().nullable().optional(), productName: z.string().nullable().optional(),
  startAt: z.string(), endAt: z.string(), limits: limitsSchema.nullable().optional(),
  points: z.array(pointSchema), stats: statsSchema,
});
const responseSchema = z.object({
  equipment: z.array(z.object({
    id: z.string(), name: z.string(), type: z.string().optional(),
    stageName: z.string().optional(), stageOrder: z.number().optional(),
  })).default([]),
  selectedEquipmentId: z.string().nullable().optional(),
  fromDate: z.string().nullable().optional(),
  toDate: z.string().nullable().optional(),
  dataRange: z.object({
    fromDate: z.string(), toDate: z.string(), recordCount: z.number(), label: z.string(),
  }).nullable().optional(),
  productOptions: z.array(z.object({ code: z.string(), name: z.string() })).default([]),
  parameters: z.array(z.object({
    code: z.string(), name: z.string(), unit: z.string(), configured: z.boolean(), hasRange: z.boolean(),
  })).default([]),
  unavailableParameters: z.array(z.object({ code: z.string(), name: z.string() })).default([]),
  selectedParameter: z.string().nullable().optional(),
  limits: limitsSchema.nullable().optional(),
  limitsVary: z.boolean().default(false),
  series: z.array(seriesSchema).default([]),
  defaultSelection: z.array(z.string()).default([]),
  summary: z.object({
    batchCount: z.number(), seriesCount: z.number(), pointCount: z.number(),
    warningCount: z.number(), criticalCount: z.number(),
  }).optional(),
  message: z.string().nullable().optional(),
});

export type CppLimits = z.infer<typeof limitsSchema>;
export type CppPoint = z.infer<typeof pointSchema>;
export type CppSeries = z.infer<typeof seriesSchema>;
export type CppTrendsResponse = z.infer<typeof responseSchema>;

export interface CppTrendsQuery {
  equipmentId?: string;
  productCode?: string;
  parameter?: string;
  fromDate?: string;
  toDate?: string;
  days?: number;
}

export async function getCppTrends(query: CppTrendsQuery, signal?: AbortSignal) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const suffix = params.toString() ? `?${params}` : "";
  const response = await apiClient<BackendApiResponse<unknown>>(`/api/iiot/reports/cpp-trends${suffix}`, {
    signal, skipPlantSelection: true,
  });
  return parseApiData(response, responseSchema, "Unable to load CPP trends.", "Invalid CPP trends response.");
}

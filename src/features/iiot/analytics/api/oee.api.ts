import { z } from "zod";
import { apiClient, parseApiData } from "@/api";
import type { BackendApiResponse } from "@/api/types";

const shiftSchema = z.enum(["Shift 1", "Shift 2", "Shift 3"]);
const settingsSchema = z.object({
  equipmentId: z.string(), tenantId: z.string(), plantId: z.string(),
  fromDate: z.string(), toDate: z.string(), scheduledShifts: z.array(shiftSchema),
  scheduledWeekdays: z.array(z.number().int().min(0).max(6)),
  idealBatchHours: z.record(z.string(), z.number().positive()),
  downtimeComplete: z.boolean(),
  timeZone: z.string(),
  isTestData: z.boolean().optional(),
});
const downtimeSchema = z.object({
  id: z.string(), equipmentId: z.string(), tenantId: z.string(), plantId: z.string(),
  date: z.string(), startTime: z.string(), endTime: z.string(),
  durationHours: z.number(), classification: z.enum(["PLANNED", "UNPLANNED"]),
  category: z.string(), reason: z.string(), comments: z.string().optional(), createdAt: z.string(),
  timeZone: z.string(),
  isTestData: z.boolean().optional(),
});
const inputsSchema = z.object({ settings: z.array(settingsSchema), downtime: z.array(downtimeSchema) });
const root = "/api/iiot/reports/oee-inputs";

export async function getOeeInputs(signal?: AbortSignal) {
  const response = await apiClient<BackendApiResponse<unknown>>(root, { signal, skipPlantSelection: true });
  return parseApiData(response, inputsSchema, "Unable to load OEE inputs.", "Invalid OEE input response.");
}

export async function saveOeeSettings(input: z.infer<typeof settingsSchema>) {
  const response = await apiClient<BackendApiResponse<unknown>>(`${root}/settings`, {
    method: "PUT", body: input, skipPlantSelection: true,
  });
  return parseApiData(response, settingsSchema, "Unable to save OEE inputs.", "Invalid OEE settings response.");
}

export async function deleteOeeSettings(scope: { tenantId: string; plantId: string; equipmentId: string }) {
  const query = new URLSearchParams(scope).toString();
  await apiClient<BackendApiResponse<unknown>>(`${root}/settings?${query}`, {
    method: "DELETE", skipPlantSelection: true,
  });
}

export type OeeDowntimeInput = Omit<z.infer<typeof downtimeSchema>, "id" | "createdAt" | "durationHours">;

export async function addOeeDowntime(input: OeeDowntimeInput) {
  const response = await apiClient<BackendApiResponse<unknown>>(`${root}/downtime`, {
    method: "POST", body: input, skipPlantSelection: true,
  });
  return parseApiData(response, downtimeSchema, "Unable to save downtime.", "Invalid downtime response.");
}

export async function updateOeeDowntime(id: string, input: OeeDowntimeInput) {
  const response = await apiClient<BackendApiResponse<unknown>>(`${root}/downtime/${encodeURIComponent(id)}`, {
    method: "PUT", body: input, skipPlantSelection: true,
  });
  return parseApiData(response, downtimeSchema, "Unable to update downtime.", "Invalid downtime response.");
}

export async function deleteOeeDowntime(id: string) {
  await apiClient<BackendApiResponse<unknown>>(`${root}/downtime/${encodeURIComponent(id)}`, {
    method: "DELETE", skipPlantSelection: true,
  });
}

const importSchema = z.object({ imported: z.number(), downtime: z.array(downtimeSchema) });

export async function importOeeDowntime(rows: OeeDowntimeInput[]) {
  const response = await apiClient<BackendApiResponse<unknown>>(`${root}/downtime/import`, {
    method: "POST", body: rows, skipPlantSelection: true,
  });
  return parseApiData(response, importSchema, "Unable to import downtime.", "Invalid downtime import response.");
}

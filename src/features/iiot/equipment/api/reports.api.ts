import { apiClient, parseApiData, withQuery } from "@/api";
import type { QueryParams } from "@/api/query";
import type { BackendApiResponse } from "@/api/types";
import type { z } from "zod";
import {
  alarmEventRecordListSchema,
  batchSummaryListSchema,
  criticalParameterLimitListSchema,
  criticalParameterListSchema,
  cppRecordListSchema,
  equipmentLiveStatusListSchema,
  equipmentLiveStatusSchema,
  oeeAnalyticsPayloadSchema,
} from "../schemas/reports.schema";

const IIOT_PROXY_ROOT = "/api/iiot";

interface PagedFetchOptions {
  limit?: number;
  maxPages?: number;
  cursorField?: string;
  cursorQueryParam?: string;
}

const resourcePath = (path: string) =>
  `${IIOT_PROXY_ROOT}/${path.replace(/^\/+/, "")}`;

async function getIiotResource<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  query?: QueryParams,
  signal?: AbortSignal,
): Promise<z.infer<TSchema>> {
  const response = await apiClient<BackendApiResponse<unknown>>(
    withQuery(resourcePath(path), query),
    { signal },
  );

  return parseApiData(
    response,
    schema,
    "The IIOT request failed.",
    "The IIOT service returned an invalid response.",
  );
}

async function getPagedIiotResource<TSchema extends z.ZodArray<z.ZodTypeAny>>(
  path: string,
  schema: TSchema,
  query: QueryParams = {},
  signal?: AbortSignal,
  options: PagedFetchOptions = {},
): Promise<z.infer<TSchema>> {
  const pageSize = Math.max(1, options.limit ?? 500);
  const maxPages = Math.max(1, options.maxPages ?? 30);
  const cursorField = options.cursorField;
  const cursorQueryParam = options.cursorQueryParam ?? "toDate";
  const mergedQuery = query as Record<string, unknown>;
  let offset =
    typeof mergedQuery.offset === "number" && Number.isFinite(mergedQuery.offset)
      ? Math.max(0, mergedQuery.offset)
      : 0;
  const rows: unknown[] = [];
  let previousPageSignature = "";

  let cursorValue: string | null =
    typeof mergedQuery[cursorQueryParam] === "string"
      ? String(mergedQuery[cursorQueryParam])
      : null;

  for (let index = 0; index < maxPages; index += 1) {
    if (signal?.aborted) break;

    const page = await getIiotResource(
      path,
      schema,
      {
        ...mergedQuery,
        limit: pageSize,
        ...(cursorField ? {} : { offset }),
        ...(cursorField && cursorValue ? { [cursorQueryParam]: cursorValue } : {}),
      },
      signal,
    );

    const first = page[0] ?? null;
    const last = page[page.length - 1] ?? null;
    const pageSignature = `${page.length}:${JSON.stringify(first)}:${JSON.stringify(last)}`;

    if (index > 0 && pageSignature === previousPageSignature) {
      break;
    }
    previousPageSignature = pageSignature;

    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }

    if (!cursorField) {
      offset += pageSize;
      continue;
    }

    const lastRow = page[page.length - 1] as Record<string, unknown> | undefined;
    const lastCursorRaw = lastRow?.[cursorField];
    const lastCursorTime = new Date(String(lastCursorRaw ?? "")).getTime();
    if (!Number.isFinite(lastCursorTime)) {
      break;
    }

    const nextCursor = new Date(lastCursorTime - 1).toISOString();
    if (nextCursor === cursorValue) {
      break;
    }
    cursorValue = nextCursor;
  }

  return rows as z.infer<TSchema>;
}

export const getEquipmentLiveStatuses = (
  query: QueryParams = {},
  signal?: AbortSignal,
) =>
  getIiotResource(
    "equipment-live-status",
    equipmentLiveStatusListSchema,
    query,
    signal,
  );

export const getEquipmentLiveStatus = (
  equipmentId: string,
  signal?: AbortSignal,
) =>
  getIiotResource(
    `equipment-live-status/${encodeURIComponent(equipmentId)}`,
    equipmentLiveStatusSchema,
    undefined,
    signal,
  );

export const getBatchSummary = (
  query: QueryParams = {},
  signal?: AbortSignal,
) => getIiotResource("reports/batch-summary", batchSummaryListSchema, query, signal);

export const getBatchSummaryPaginated = (
  query: QueryParams = {},
  signal?: AbortSignal,
  options: PagedFetchOptions = {},
) =>
  getPagedIiotResource(
    "reports/batch-summary",
    batchSummaryListSchema,
    query,
    signal,
    {
      cursorField: "batchStartAt",
      cursorQueryParam: "toDate",
      ...options,
    },
  );

export const getOeeAnalytics = (
  query: QueryParams = {},
  signal?: AbortSignal,
) =>
  getIiotResource(
    "analytics/oee",
    oeeAnalyticsPayloadSchema,
    query,
    signal,
  );

export const getCppData = (
  equipmentId: string,
  query: QueryParams = {},
  signal?: AbortSignal,
) =>
  getIiotResource(
    "reports/cpp",
    cppRecordListSchema,
    { equipmentId, ...query },
    signal,
  );

export const getCppDataPaginated = (
  equipmentId: string,
  query: QueryParams = {},
  signal?: AbortSignal,
  options: PagedFetchOptions = {},
) =>
  getPagedIiotResource(
    "reports/cpp",
    cppRecordListSchema,
    { equipmentId, ...query },
    signal,
    {
      cursorField: "observedAt",
      cursorQueryParam: "toDate",
      ...options,
    },
  );

export const getAlarmEventData = (
  equipmentId: string,
  query: QueryParams = {},
  signal?: AbortSignal,
) =>
  getIiotResource(
    "reports/alarm-events",
    alarmEventRecordListSchema,
    { equipmentId, ...query },
    signal,
  );

export const getAlarmEventDataPaginated = (
  equipmentId: string,
  query: QueryParams = {},
  signal?: AbortSignal,
  options: PagedFetchOptions = {},
) =>
  getPagedIiotResource(
    "reports/alarm-events",
    alarmEventRecordListSchema,
    { equipmentId, ...query },
    signal,
    {
      cursorField: "eventAt",
      cursorQueryParam: "toDate",
      ...options,
    },
  );

export const getCriticalParameters = (
  query: QueryParams = {},
  signal?: AbortSignal,
) =>
  getIiotResource(
    "critical-parameters",
    criticalParameterListSchema,
    query,
    signal,
  );

export const getCriticalParameterLimits = (
  query: QueryParams = {},
  signal?: AbortSignal,
) =>
  getIiotResource(
    "critical-parameter-limits",
    criticalParameterLimitListSchema,
    query,
    signal,
  );

export const acknowledgeAlarmEvent = (
  equipmentId: string,
  eventId: string,
  payload: { acknowledgedBy?: string; reason?: string; comment?: string } = {},
) =>
  apiClient<BackendApiResponse<unknown>>(
    resourcePath(
      `reports/alarm-events/${encodeURIComponent(equipmentId)}/${encodeURIComponent(eventId)}/acknowledge`,
    ),
    {
      method: "POST",
      body: payload,
    },
  );

export interface BatchStageApprovalPayload {
  tenantId?: string;
  batchNo: string;
  lotNo: string;
  equipmentCode: string;
  status: "UNDER_REVIEW" | "REVIEWER_REVIEWED" | "APPROVED" | "REJECTED";
  approvedBy?: string;
  supervisorName?: string;
  comments?: string;
}

export const updateBatchStageApproval = (
  payload: BatchStageApprovalPayload,
) =>
  apiClient<BackendApiResponse<unknown>>(
    resourcePath("reports/batch-summary/approval"),
    {
      method: "POST",
      body: payload,
    },
  );

export interface WorkflowAssignee {
  userId: string;
  userTrackId?: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  email?: string;
  title?: string;
  roleName?: string;
}

export const getWorkflowAssignees = async (
  params: { targetStatus?: string; tenantId?: string; plantId?: string } = {},
  signal?: AbortSignal,
): Promise<WorkflowAssignee[]> => {
  try {
    const response = await apiClient<BackendApiResponse<WorkflowAssignee[]>>(
      withQuery(resourcePath("workflow/assignees"), params),
      { signal },
    );
    return response.data || [];
  } catch {
    return [];
  }
};

export interface BulkApprovalItem {
  batchNo: string;
  lotNo: string;
  equipmentCode: string;
}

export interface BulkApprovalPayload {
  items: BulkApprovalItem[];
  status: "UNDER_REVIEW" | "REVIEWER_REVIEWED" | "APPROVED" | "REJECTED";
  supervisorName?: string;
  comments?: string;
  tenantId?: string;
  approvedBy?: string;
}

export interface BulkApprovalResult {
  total: number;
  succeededCount: number;
  failedCount: number;
  succeeded: Array<{ batchNo: string; lotNo: string; equipmentCode: string; status: string }>;
  failed: Array<{ batchNo: string; lotNo: string; equipmentCode: string; reason: string }>;
}

export const updateBatchSummaryBulkApproval = async (
  payload: BulkApprovalPayload,
): Promise<BulkApprovalResult> => {
  const response = await apiClient<BackendApiResponse<BulkApprovalResult>>(
    resourcePath("reports/batch-summary/bulk-approval"),
    {
      method: "POST",
      body: payload,
    },
  );
  if (!response.data) {
    throw new Error(response.message || "Bulk approval request failed.");
  }
  return response.data;
};

export interface WorkflowAuditEvent {
  _id?: string;
  auditId?: string;
  tenantId?: string;
  plantId?: string;
  batchNo: string;
  lotNo: string;
  equipmentCode: string;
  previousStatus: string;
  newStatus: string;
  action?: string;
  actionCode?: string;
  userId: string;
  userName?: string;
  userRole?: string;
  comments?: string;
  esignatureVerified?: boolean;
  esignatureReason?: string;
  regulatoryStatement?: string;
  timestamp: string;
  createdAt?: string;
}

export interface AllowedWorkflowAction {
  actionCode: string;
  actionName: string;
  displayName: string;
  actionType: string;
  applicableRole?: string;
  requiresEsign: boolean;
  requiresComment: boolean;
  requiresJustification: boolean;
  requiresAdditionalInfo?: boolean;
  requiresResponse?: boolean;
  requiresUserSelection: boolean;
  requiresConfirmation: boolean;
  fromStageCode: string;
  toStageCode: string;
  resultingStatus: string;
  returnStageCode?: string;
}

export interface ExecuteWorkflowActionPayload {
  batchNo: string;
  lotNo: string;
  equipmentCode: string;
  actionCode: string;
  password?: string;
  comments?: string;
  justification?: string;
  additionalInformation?: string;
  responseNotes?: string;
  supervisorName?: string;
  esignatureReason?: string;
  tenantId?: string;
}

export interface WorkflowDashboardCounts {
  pendingMyAction: number;
  pendingReview: number;
  pendingApproval: number;
  completedActions: number;
  userRole?: string;
  userId?: string;
}

export interface WorkflowActionHistoryItem {
  historyId: string;
  instanceId?: string;
  workflowCode?: string;
  workflowVersion?: string;
  entityId?: string;
  batchNo: string;
  lotNo: string;
  equipmentCode: string;
  fromStageCode?: string;
  toStageCode?: string;
  actionCode: string;
  actionName: string;
  previousStatus: string;
  newStatus: string;
  performedBy: string;
  performerName?: string;
  performerRole?: string;
  comments?: string;
  justification?: string;
  additionalInformation?: string;
  responseNotes?: string;
  esignatureVerified?: boolean;
  esignatureReason?: string;
  tenantId?: string;
  plantId?: string;
  timestamp: string;
}

export const CANONICAL_ACTION_MAPPING: Record<string, string> = {
  SEND_FOR_REVIEW: "SUBMIT_FOR_REVIEW",
  SEND_FOR_APPROVAL: "SUBMIT_FOR_APPROVAL",
  SUBMIT_JUSTIFICATION: "SUBMIT_RESPONSE",
  REJECT: "REQUEST_ADDITIONAL_INFO",
};

export const deduplicateAllowedActions = (
  actions: AllowedWorkflowAction[]
): AllowedWorkflowAction[] => {
  if (!actions || !actions.length) return [];

  const map = new Map<string, AllowedWorkflowAction>();

  for (const action of actions) {
    const rawCode = (action.actionCode || "").toUpperCase().trim();
    const canonicalCode = CANONICAL_ACTION_MAPPING[rawCode] || rawCode;
    const transitionKey = `${canonicalCode}:${action.fromStageCode || ""}:${action.toStageCode || ""}:${action.resultingStatus || ""}`;

    if (map.has(transitionKey)) {
      const existing = map.get(transitionKey)!;
      const isExistingCanonical = !CANONICAL_ACTION_MAPPING[existing.actionCode?.toUpperCase()];
      const isCurrentCanonical = !CANONICAL_ACTION_MAPPING[rawCode];
      if (isCurrentCanonical && !isExistingCanonical) {
        map.set(transitionKey, action);
      }
    } else {
      map.set(transitionKey, action);
    }
  }

  return Array.from(map.values());
};

export const getAllowedActions = async (
  params: { batchNo: string; lotNo: string; equipmentCode: string; tenantId?: string; plantId?: string },
  signal?: AbortSignal,
): Promise<AllowedWorkflowAction[]> => {
  try {
    const response = await apiClient<BackendApiResponse<AllowedWorkflowAction[]>>(
      withQuery(resourcePath("workflow/allowed-actions"), params),
      { signal },
    );
    return deduplicateAllowedActions(response.data || []);
  } catch {
    return [];
  }
};

export interface WorkflowTaskItemResponse {
  id: string;
  batchNo: string;
  lotNo: string;
  productCode: string;
  productName: string;
  equipmentCode: string;
  equipmentType: string;
  workflowStage: string;
  stageSequence: number;
  rawStatus: string;
  displayStatus: string;
  lastAction?: string;
  lastActionAt?: string;
  pendingSince?: string;
  allowedActions?: AllowedWorkflowAction[];
  summaryRef?: Record<string, unknown>;
}

export const getMyActions = async (
  query: {
    status?: string;
    equipmentType?: string;
    search?: string;
    tenantId?: string;
    plantId?: string;
  } = {},
  signal?: AbortSignal,
): Promise<WorkflowTaskItemResponse[]> => {
  try {
    const response = await apiClient<BackendApiResponse<WorkflowTaskItemResponse[]>>(
      withQuery(resourcePath("workflow/my-actions"), query),
      { signal },
    );
    return response.data || [];
  } catch {
    return [];
  }
};

export const getPendingBatches = async (
  query: {
    productCode?: string;
    batchNo?: string;
    equipmentType?: string;
    lotNo?: string;
    status?: string;
    search?: string;
    tenantId?: string;
    plantId?: string;
  } = {},
  signal?: AbortSignal,
): Promise<WorkflowTaskItemResponse[]> => {
  try {
    const response = await apiClient<BackendApiResponse<WorkflowTaskItemResponse[]>>(
      withQuery(resourcePath("workflow/pending-batches"), query),
      { signal },
    );
    return response.data || [];
  } catch {
    return [];
  }
};

export interface BulkActionTaskItem {
  batchNo: string;
  lotNo?: string;
  equipmentCode?: string;
  productName?: string;
}

export interface BulkWorkflowActionPayload {
  actionCode: string;
  items: BulkActionTaskItem[];
  password?: string;
  comments?: string;
  justification?: string;
  additionalInformation?: string;
  responseNotes?: string;
  supervisorName?: string;
  esignatureReason?: string;
  tenantId?: string;
  plantId?: string;
}

export interface BulkSuccessItem {
  batchNo: string;
  lotNo?: string;
  equipmentCode?: string;
  newStatus?: string;
  message?: string;
}

export interface BulkFailureItem {
  batchNo: string;
  lotNo?: string;
  equipmentCode?: string;
  reason: string;
  errorCode?: string;
}

export interface BulkExecutionResult {
  totalRequested: number;
  successCount: number;
  failureCount: number;
  successfulItems: BulkSuccessItem[];
  failedItems: BulkFailureItem[];
}

export const executeBulkWorkflowAction = async (
  payload: BulkWorkflowActionPayload,
): Promise<BulkExecutionResult> => {
  const response = await apiClient<BackendApiResponse<BulkExecutionResult>>(
    resourcePath("workflow/bulk-action"),
    {
      method: "POST",
      body: payload,
    },
  );
  if (!response.data && !response.success) {
    throw new Error(response.message || "Failed to execute bulk workflow action.");
  }
  return response.data || {
    totalRequested: payload.items.length,
    successCount: 0,
    failureCount: payload.items.length,
    successfulItems: [],
    failedItems: payload.items.map((i) => ({
      batchNo: i.batchNo,
      lotNo: i.lotNo,
      equipmentCode: i.equipmentCode,
      reason: response.message || "Bulk execution failed.",
    })),
  };
};

export const executeWorkflowAction = async (
  payload: ExecuteWorkflowActionPayload,
): Promise<unknown> => {
  const response = await apiClient<BackendApiResponse<unknown>>(
    resourcePath("workflow/execute-action"),
    {
      method: "POST",
      body: payload,
    },
  );
  if (!response.data && !response.success) {
    throw new Error(response.message || "Failed to execute workflow action.");
  }
  return response.data;
};

export const downloadBatchPdfBlob = async (
  batchNo: string,
  lotNo?: string,
  equipmentCode?: string,
): Promise<void> => {
  const query = new URLSearchParams();
  if (lotNo) query.set("lotNo", lotNo);
  if (equipmentCode) query.set("equipmentCode", equipmentCode);

  const url = `${resourcePath(`batch-reports/${encodeURIComponent(batchNo)}/pdf`)}?${query.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/pdf, application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let msg = "Failed to download batch PDF report.";
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.message) msg = parsed.message;
    } catch {}
    throw new Error(msg);
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `Batch_Dossier_${batchNo}${lotNo ? `_${lotNo}` : ""}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
};

export const getWorkflowDashboardCounts = async (
  params: { tenantId?: string; plantId?: string } = {},
  signal?: AbortSignal,
): Promise<WorkflowDashboardCounts> => {
  try {
    const response = await apiClient<BackendApiResponse<WorkflowDashboardCounts>>(
      withQuery(resourcePath("workflow/dashboard-counts"), params),
      { signal },
    );
    return response.data || {
      pendingMyAction: 0,
      pendingReview: 0,
      pendingApproval: 0,
      completedActions: 0,
    };
  } catch {
    return {
      pendingMyAction: 0,
      pendingReview: 0,
      pendingApproval: 0,
      completedActions: 0,
    };
  }
};

export const getWorkflowAuditTrail = async (
  params: { batchNo?: string; lotNo?: string; equipmentCode?: string; tenantId?: string } = {},
  signal?: AbortSignal,
): Promise<WorkflowAuditEvent[]> => {
  try {
    const response = await apiClient<BackendApiResponse<WorkflowAuditEvent[]>>(
      withQuery(resourcePath("workflow/audit-trail"), params),
      { signal },
    );
    return response.data || [];
  } catch {
    return [];
  }
};

export const getWorkflowInstanceAndHistory = async (
  params: { batchNo: string; lotNo: string; equipmentCode: string; tenantId?: string; plantId?: string },
  signal?: AbortSignal,
): Promise<{ instance: Record<string, unknown> | null; history: WorkflowActionHistoryItem[] }> => {
  try {
    const response = await apiClient<BackendApiResponse<{ instance: Record<string, unknown> | null; history: WorkflowActionHistoryItem[] }>>(
      withQuery(resourcePath("workflow/instance"), params),
      { signal },
    );
    return response.data || { instance: null, history: [] };
  } catch {
    return { instance: null, history: [] };
  }
};

export const claimWorkflowTask = async (
  payload: { batchNo: string; lotNo: string; equipmentCode: string; userRole?: string; tenantId?: string; plantId?: string },
): Promise<{ success: boolean; message: string; assignedTo?: string; activeReviewer?: string; activeReviewerRole?: string; claimedAt?: string }> => {
  const response = await apiClient<BackendApiResponse<{ success: boolean; message: string; assignedTo?: string; activeReviewer?: string; activeReviewerRole?: string; claimedAt?: string }>>(
    resourcePath("workflow/claim-task"),
    {
      method: "POST",
      body: payload,
    },
  );
  return response.data || { success: false, message: "Failed to claim task" };
};

export const unclaimWorkflowTask = async (
  payload: { batchNo: string; lotNo: string; equipmentCode: string; tenantId?: string },
): Promise<{ success: boolean; message: string }> => {
  const response = await apiClient<BackendApiResponse<{ success: boolean; message: string }>>(
    resourcePath("workflow/unclaim-task"),
    {
      method: "POST",
      body: payload,
    },
  );
  return response.data || { success: false, message: "Failed to release task" };
};

export async function getIiotTopology(signal?: AbortSignal) {
  try {
    const response = await apiClient<BackendApiResponse<{
      plants?: Array<{ plantId: string; plantName: string; tenantId?: string }>;
      blocks?: Array<{ blockId: string; blockName: string; plantId?: string; tenantId?: string }>;
      areas?: Array<{ areaId: string; areaName: string; plantId?: string; blockId?: string; tenantId?: string }>;
      rooms?: Array<{ roomId: string; roomName: string; plantId?: string; areaId?: string; tenantId?: string }>;
    }>>(resourcePath("topology"), { signal });
    if (response.success && response.data) {
      return {
        plants: response.data.plants ?? [],
        blocks: response.data.blocks ?? [],
        areas: response.data.areas ?? [],
        rooms: response.data.rooms ?? [],
      };
    }
  } catch {
    // Graceful fallback
  }
  return { plants: [], blocks: [], areas: [], rooms: [] };
}


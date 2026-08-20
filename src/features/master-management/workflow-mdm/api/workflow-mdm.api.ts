import { apiClient, withQuery } from "@/api";
import type { BackendApiResponse } from "@/api/types";

const MDM_WORKFLOWS_ROOT = "/api/master-management/mdm/workflows";

export interface WorkflowDefinitionItem {
  id?: string;
  workflowId: string;
  workflowCode: string;
  workflowName: string;
  module: string;
  entity: string;
  description?: string;
  version: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  effectiveFrom?: string;
  effectiveTo?: string;
  tenantId?: string;
  plantId?: string;
  stageCodes?: string[];
  isActive?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowStageItem {
  id?: string;
  stageId: string;
  workflowCode: string;
  workflowVersion?: string;
  stageCode: string;
  stageName: string;
  sequence: number;
  assignedRole: string;
  stageType: "INITIAL" | "INTERMEDIATE" | "FINAL";
  entryStatus: string;
  exitStatus: string;
  assignmentRule?: string;
  isMandatory?: boolean;
  allowedActionCodes?: string[];
  tenantId?: string;
  plantId?: string;
  isActive?: boolean;
}

export interface WorkflowActionItem {
  id?: string;
  actionId: string;
  actionCode: string;
  actionName: string;
  displayName: string;
  actionType: string;
  applicableRole?: string;
  requiresEsign: boolean;
  requiresComment: boolean;
  requiresJustification: boolean;
  requiresUserSelection: boolean;
  requiresConfirmation: boolean;
  tenantId?: string;
  isActive?: boolean;
}

export interface WorkflowTransitionItem {
  id?: string;
  transitionId: string;
  workflowCode: string;
  workflowVersion?: string;
  fromStageCode: string;
  actionCode: string;
  toStageCode: string;
  resultingStatus: string;
  returnStageCode?: string;
  condition?: string;
  tenantId?: string;
  isActive?: boolean;
}

export interface WorkflowAssignmentItem {
  id?: string;
  assignmentId: string;
  workflowCode: string;
  stageCode: string;
  roleCode?: string;
  groupId?: string;
  userGroupId?: string;
  eligibleUserRule?: string;
  assignmentRule?: string;
  tenantId?: string;
  plantId?: string;
  departmentId?: string;
  isActive?: boolean;
}

export interface FullWorkflowConfiguration {
  definition: WorkflowDefinitionItem;
  stages: WorkflowStageItem[];
  actions: WorkflowActionItem[];
  transitions: WorkflowTransitionItem[];
  assignments: WorkflowAssignmentItem[];
}

export const getWorkflowDefinitions = async (
  params: { tenantId?: string; status?: string } = {},
  signal?: AbortSignal,
): Promise<WorkflowDefinitionItem[]> => {
  const response = await apiClient<BackendApiResponse<WorkflowDefinitionItem[]>>(
    withQuery(`${MDM_WORKFLOWS_ROOT}/definitions`, params),
    { signal },
  );
  return response.data || [];
};

export const getWorkflowConfig = async (
  workflowCode: string,
  version?: string,
  signal?: AbortSignal,
): Promise<FullWorkflowConfiguration | null> => {
  const response = await apiClient<BackendApiResponse<FullWorkflowConfiguration>>(
    withQuery(`${MDM_WORKFLOWS_ROOT}/config`, { workflowCode, version }),
    { signal },
  );
  return response.data || null;
};

export const createWorkflowDefinition = async (
  data: Partial<WorkflowDefinitionItem>,
): Promise<WorkflowDefinitionItem> => {
  const response = await apiClient<BackendApiResponse<WorkflowDefinitionItem>>(
    `${MDM_WORKFLOWS_ROOT}/definitions`,
    {
      method: "POST",
      body: data,
    },
  );
  if (!response.data) throw new Error(response.message || "Failed to create workflow definition.");
  return response.data;
};

export const updateWorkflowDefinition = async (
  workflowId: string,
  data: Partial<WorkflowDefinitionItem>,
): Promise<WorkflowDefinitionItem> => {
  const response = await apiClient<BackendApiResponse<WorkflowDefinitionItem>>(
    `${MDM_WORKFLOWS_ROOT}/definitions/${encodeURIComponent(workflowId)}`,
    {
      method: "PUT",
      body: data,
    },
  );
  if (!response.data) throw new Error(response.message || "Failed to update workflow definition.");
  return response.data;
};

export const deleteWorkflowDefinition = async (workflowId: string): Promise<void> => {
  await apiClient<BackendApiResponse<void>>(
    `${MDM_WORKFLOWS_ROOT}/definitions/${encodeURIComponent(workflowId)}`,
    { method: "DELETE" },
  );
};

export const validateWorkflow = async (
  workflowCode: string,
  version?: string,
): Promise<{ valid: boolean; errors?: string[] }> => {
  const response = await apiClient<BackendApiResponse<{ valid: boolean; errors?: string[] }>>(
    withQuery(`${MDM_WORKFLOWS_ROOT}/validate`, { workflowCode, version }),
  );
  return response.data || { valid: true, errors: [] };
};

export const activateWorkflowVersion = async (
  workflowId: string,
): Promise<WorkflowDefinitionItem> => {
  const response = await apiClient<BackendApiResponse<WorkflowDefinitionItem>>(
    `${MDM_WORKFLOWS_ROOT}/definitions/${encodeURIComponent(workflowId)}/activate`,
    { method: "POST" },
  );
  if (!response.data) throw new Error(response.message || "Failed to activate workflow version.");
  return response.data;
};

export const retireWorkflowVersion = async (
  workflowId: string,
): Promise<WorkflowDefinitionItem> => {
  const response = await apiClient<BackendApiResponse<WorkflowDefinitionItem>>(
    `${MDM_WORKFLOWS_ROOT}/definitions/${encodeURIComponent(workflowId)}/retire`,
    { method: "POST" },
  );
  if (!response.data) throw new Error(response.message || "Failed to retire workflow version.");
  return response.data;
};

// ============================================
// STAGES CRUD
// ============================================

export const getWorkflowStages = async (
  workflowCode: string,
  version?: string,
  signal?: AbortSignal,
): Promise<WorkflowStageItem[]> => {
  const response = await apiClient<BackendApiResponse<WorkflowStageItem[]>>(
    withQuery(`${MDM_WORKFLOWS_ROOT}/stages`, { workflowCode, version }),
    { signal },
  );
  return response.data || [];
};

export const createWorkflowStage = async (
  data: Partial<WorkflowStageItem>,
): Promise<WorkflowStageItem> => {
  const response = await apiClient<BackendApiResponse<WorkflowStageItem>>(
    `${MDM_WORKFLOWS_ROOT}/stages`,
    {
      method: "POST",
      body: data,
    },
  );
  if (!response.data) throw new Error(response.message || "Failed to create workflow stage.");
  return response.data;
};

export const updateWorkflowStage = async (
  stageId: string,
  data: Partial<WorkflowStageItem>,
): Promise<WorkflowStageItem> => {
  const response = await apiClient<BackendApiResponse<WorkflowStageItem>>(
    `${MDM_WORKFLOWS_ROOT}/stages/${encodeURIComponent(stageId)}`,
    {
      method: "PUT",
      body: data,
    },
  );
  if (!response.data) throw new Error(response.message || "Failed to update workflow stage.");
  return response.data;
};

export const deleteWorkflowStage = async (stageId: string): Promise<void> => {
  await apiClient<BackendApiResponse<void>>(
    `${MDM_WORKFLOWS_ROOT}/stages/${encodeURIComponent(stageId)}`,
    { method: "DELETE" },
  );
};

// ============================================
// ACTIONS CRUD
// ============================================

export const getWorkflowActions = async (signal?: AbortSignal): Promise<WorkflowActionItem[]> => {
  const response = await apiClient<BackendApiResponse<WorkflowActionItem[]>>(
    `${MDM_WORKFLOWS_ROOT}/actions`,
    { signal },
  );
  return response.data || [];
};

export const createWorkflowAction = async (
  data: Partial<WorkflowActionItem>,
): Promise<WorkflowActionItem> => {
  const response = await apiClient<BackendApiResponse<WorkflowActionItem>>(
    `${MDM_WORKFLOWS_ROOT}/actions`,
    {
      method: "POST",
      body: data,
    },
  );
  if (!response.data) throw new Error(response.message || "Failed to create workflow action.");
  return response.data;
};

export const updateWorkflowAction = async (
  actionId: string,
  data: Partial<WorkflowActionItem>,
): Promise<WorkflowActionItem> => {
  const response = await apiClient<BackendApiResponse<WorkflowActionItem>>(
    `${MDM_WORKFLOWS_ROOT}/actions/${encodeURIComponent(actionId)}`,
    {
      method: "PUT",
      body: data,
    },
  );
  if (!response.data) throw new Error(response.message || "Failed to update workflow action.");
  return response.data;
};

export const deleteWorkflowAction = async (actionId: string): Promise<void> => {
  await apiClient<BackendApiResponse<void>>(
    `${MDM_WORKFLOWS_ROOT}/actions/${encodeURIComponent(actionId)}`,
    { method: "DELETE" },
  );
};

// ============================================
// TRANSITIONS CRUD
// ============================================

export const getWorkflowTransitions = async (
  workflowCode: string,
  version?: string,
  signal?: AbortSignal,
): Promise<WorkflowTransitionItem[]> => {
  const response = await apiClient<BackendApiResponse<WorkflowTransitionItem[]>>(
    withQuery(`${MDM_WORKFLOWS_ROOT}/transitions`, { workflowCode, version }),
    { signal },
  );
  return response.data || [];
};

export const createWorkflowTransition = async (
  data: Partial<WorkflowTransitionItem>,
): Promise<WorkflowTransitionItem> => {
  const response = await apiClient<BackendApiResponse<WorkflowTransitionItem>>(
    `${MDM_WORKFLOWS_ROOT}/transitions`,
    {
      method: "POST",
      body: data,
    },
  );
  if (!response.data) throw new Error(response.message || "Failed to create workflow transition.");
  return response.data;
};

export const updateWorkflowTransition = async (
  transitionId: string,
  data: Partial<WorkflowTransitionItem>,
): Promise<WorkflowTransitionItem> => {
  const response = await apiClient<BackendApiResponse<WorkflowTransitionItem>>(
    `${MDM_WORKFLOWS_ROOT}/transitions/${encodeURIComponent(transitionId)}`,
    {
      method: "PUT",
      body: data,
    },
  );
  if (!response.data) throw new Error(response.message || "Failed to update workflow transition.");
  return response.data;
};

export const deleteWorkflowTransition = async (transitionId: string): Promise<void> => {
  await apiClient<BackendApiResponse<void>>(
    `${MDM_WORKFLOWS_ROOT}/transitions/${encodeURIComponent(transitionId)}`,
    { method: "DELETE" },
  );
};

// ============================================
// ASSIGNMENTS CRUD
// ============================================

export const getWorkflowAssignments = async (
  workflowCode: string,
  signal?: AbortSignal,
): Promise<WorkflowAssignmentItem[]> => {
  const response = await apiClient<BackendApiResponse<WorkflowAssignmentItem[]>>(
    withQuery(`${MDM_WORKFLOWS_ROOT}/assignments`, { workflowCode }),
    { signal },
  );
  return response.data || [];
};

export const createWorkflowAssignment = async (
  data: Partial<WorkflowAssignmentItem>,
): Promise<WorkflowAssignmentItem> => {
  const response = await apiClient<BackendApiResponse<WorkflowAssignmentItem>>(
    `${MDM_WORKFLOWS_ROOT}/assignments`,
    {
      method: "POST",
      body: data,
    },
  );
  if (!response.data) throw new Error(response.message || "Failed to create workflow assignment.");
  return response.data;
};

export const updateWorkflowAssignment = async (
  assignmentId: string,
  data: Partial<WorkflowAssignmentItem>,
): Promise<WorkflowAssignmentItem> => {
  const response = await apiClient<BackendApiResponse<WorkflowAssignmentItem>>(
    `${MDM_WORKFLOWS_ROOT}/assignments/${encodeURIComponent(assignmentId)}`,
    {
      method: "PUT",
      body: data,
    },
  );
  if (!response.data) throw new Error(response.message || "Failed to update workflow assignment.");
  return response.data;
};

export const deleteWorkflowAssignment = async (assignmentId: string): Promise<void> => {
  await apiClient<BackendApiResponse<void>>(
    `${MDM_WORKFLOWS_ROOT}/assignments/${encodeURIComponent(assignmentId)}`,
    { method: "DELETE" },
  );
};


"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  CheckCircle,
  Clock,
  ArrowRight,
  GitBranch,
  Sliders,
  Users,
  Stack,
  ArrowClockwise,
  Plus,
  Play,
  Stop,
  FileText,
  Lock,
  PencilSimple,
  Trash,
  X,
  WarningCircle,
  FloppyDisk,
  CheckSquare,
} from "@phosphor-icons/react";
import TablePagination from "@/components/table/TablePagination";
import {
  getWorkflowDefinitions,
  getWorkflowConfig,
  createWorkflowDefinition,
  updateWorkflowDefinition,
  deleteWorkflowDefinition,
  activateWorkflowVersion,
  retireWorkflowVersion,
  validateWorkflow,
  createWorkflowStage,
  updateWorkflowStage,
  deleteWorkflowStage,
  createWorkflowAction,
  updateWorkflowAction,
  deleteWorkflowAction,
  createWorkflowTransition,
  updateWorkflowTransition,
  deleteWorkflowTransition,
  createWorkflowAssignment,
  updateWorkflowAssignment,
  deleteWorkflowAssignment,
  type WorkflowDefinitionItem,
  type WorkflowStageItem,
  type WorkflowActionItem,
  type WorkflowTransitionItem,
  type WorkflowAssignmentItem,
  type FullWorkflowConfiguration,
} from "../api/workflow-mdm.api";

type ActiveTab =
  | "pipeline"
  | "definitions"
  | "stages"
  | "actions"
  | "transitions"
  | "assignments"
  | "activation";

export default function WorkflowMdmScreen() {
  const [definitions, setDefinitions] = useState<WorkflowDefinitionItem[]>([]);
  const [selectedDefinition, setSelectedDefinition] = useState<WorkflowDefinitionItem | null>(null);
  const [config, setConfig] = useState<FullWorkflowConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("pipeline");
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors?: string[] } | null>(null);
  const [validating, setValidating] = useState(false);

  // Modal Dialog States
  const [isDefinitionModalOpen, setIsDefinitionModalOpen] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<Partial<WorkflowDefinitionItem> | null>(null);

  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<Partial<WorkflowStageItem> | null>(null);

  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<Partial<WorkflowActionItem> | null>(null);

  const [isTransitionModalOpen, setIsTransitionModalOpen] = useState(false);
  const [editingTransition, setEditingTransition] = useState<Partial<WorkflowTransitionItem> | null>(null);

  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Partial<WorkflowAssignmentItem> | null>(null);

  // Tab Pagination States
  const [stagesPage, setStagesPage] = useState(1);
  const [stagesPageSize, setStagesPageSize] = useState(10);

  const [actionsPage, setActionsPage] = useState(1);
  const [actionsPageSize, setActionsPageSize] = useState(10);

  const [transitionsPage, setTransitionsPage] = useState(1);
  const [transitionsPageSize, setTransitionsPageSize] = useState(10);

  const [assignmentsPage, setAssignmentsPage] = useState(1);
  const [assignmentsPageSize, setAssignmentsPageSize] = useState(10);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getWorkflowDefinitions();
      setDefinitions(list);
      const activeDef = list.find((d) => d.status === "ACTIVE") || list[0] || null;
      setSelectedDefinition(activeDef);
      if (activeDef) {
        const fullConfig = await getWorkflowConfig(activeDef.workflowCode, activeDef.version);
        setConfig(fullConfig);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load workflow MDM data";
      setStatusMessage({ text: message, type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectDefinition = async (def: WorkflowDefinitionItem) => {
    setSelectedDefinition(def);
    try {
      const fullConfig = await getWorkflowConfig(def.workflowCode, def.version);
      setConfig(fullConfig);
      setValidationResult(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load workflow configuration";
      setStatusMessage({ text: message, type: "error" });
    }
  };

  const reloadCurrentConfig = async () => {
    if (!selectedDefinition) return;
    try {
      const fullConfig = await getWorkflowConfig(selectedDefinition.workflowCode, selectedDefinition.version);
      setConfig(fullConfig);
      const list = await getWorkflowDefinitions();
      setDefinitions(list);
    } catch (err) {
      console.error("Failed to reload configuration", err);
    }
  };

  const handleValidate = async () => {
    if (!selectedDefinition) return;
    setValidating(true);
    try {
      const res = await validateWorkflow(selectedDefinition.workflowCode, selectedDefinition.version);
      setValidationResult(res);
      if (res.valid) {
        setStatusMessage({ text: "Workflow configuration is valid and ready for activation!", type: "success" });
      } else {
        setStatusMessage({ text: "Workflow validation found configuration errors.", type: "error" });
      }
    } catch (err: unknown) {
      setStatusMessage({
        text: err instanceof Error ? err.message : "Failed to validate workflow",
        type: "error",
      });
    } finally {
      setValidating(false);
    }
  };

  const handleActivate = async (workflowId: string) => {
    try {
      await activateWorkflowVersion(workflowId);
      setStatusMessage({ text: "Workflow version activated successfully!", type: "success" });
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to activate workflow version";
      setStatusMessage({ text: message, type: "error" });
    }
  };

  const handleRetire = async (workflowId: string) => {
    try {
      await retireWorkflowVersion(workflowId);
      setStatusMessage({ text: "Workflow version retired successfully.", type: "success" });
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to retire workflow version";
      setStatusMessage({ text: message, type: "error" });
    }
  };

  // ============================================
  // DEFINITION CRUD HANDLERS
  // ============================================
  const handleSaveDefinition = async () => {
    if (!editingDefinition?.workflowCode || !editingDefinition?.workflowName) {
      setStatusMessage({ text: "Workflow Code and Name are required.", type: "error" });
      return;
    }
    try {
      if (editingDefinition.workflowId && editingDefinition.id) {
        await updateWorkflowDefinition(editingDefinition.workflowId, editingDefinition);
        setStatusMessage({ text: "Workflow definition updated successfully.", type: "success" });
      } else {
        await createWorkflowDefinition({
          ...editingDefinition,
          version: editingDefinition.version || "1.0.0",
          module: editingDefinition.module || "IIOT",
          entity: editingDefinition.entity || "BATCH_STAGE",
          status: "DRAFT",
          isActive: true,
        });
        setStatusMessage({ text: "Workflow definition created successfully.", type: "success" });
      }
      setIsDefinitionModalOpen(false);
      setEditingDefinition(null);
      await loadData();
    } catch (err: unknown) {
      setStatusMessage({
        text: err instanceof Error ? err.message : "Failed to save workflow definition",
        type: "error",
      });
    }
  };

  const handleDeleteDefinition = async (workflowId: string) => {
    if (!confirm("Are you sure you want to delete this workflow definition?")) return;
    try {
      await deleteWorkflowDefinition(workflowId);
      setStatusMessage({ text: "Workflow definition deleted.", type: "success" });
      await loadData();
    } catch (err: unknown) {
      setStatusMessage({
        text: err instanceof Error ? err.message : "Failed to delete workflow definition",
        type: "error",
      });
    }
  };

  // ============================================
  // STAGE CRUD HANDLERS
  // ============================================
  const handleSaveStage = async () => {
    if (!editingStage?.stageCode || !editingStage?.stageName) {
      setStatusMessage({ text: "Stage Code and Name are required.", type: "error" });
      return;
    }
    try {
      const payload: Partial<WorkflowStageItem> = {
        ...editingStage,
        workflowCode: selectedDefinition?.workflowCode || "IIOT_BATCH_STAGE_WORKFLOW",
        workflowVersion: selectedDefinition?.version || "1.0.0",
        sequence: Number(editingStage.sequence) || 1,
        stageType: editingStage.stageType || "INTERMEDIATE",
        assignedRole: editingStage.assignedRole || "PRODUCTION_OPERATOR",
        entryStatus: editingStage.entryStatus || "PENDING",
        exitStatus: editingStage.exitStatus || "UNDER_REVIEW",
        isMandatory: editingStage.isMandatory ?? true,
        isActive: true,
      };

      if (editingStage.stageId && editingStage.id) {
        await updateWorkflowStage(editingStage.stageId, payload);
        setStatusMessage({ text: "Stage updated successfully.", type: "success" });
      } else {
        await createWorkflowStage(payload);
        setStatusMessage({ text: "Stage created successfully.", type: "success" });
      }
      setIsStageModalOpen(false);
      setEditingStage(null);
      await reloadCurrentConfig();
    } catch (err: unknown) {
      setStatusMessage({
        text: err instanceof Error ? err.message : "Failed to save stage",
        type: "error",
      });
    }
  };

  const handleDeleteStage = async (stageId: string) => {
    if (!confirm("Are you sure you want to delete this stage?")) return;
    try {
      await deleteWorkflowStage(stageId);
      setStatusMessage({ text: "Stage deleted.", type: "success" });
      await reloadCurrentConfig();
    } catch (err: unknown) {
      setStatusMessage({
        text: err instanceof Error ? err.message : "Failed to delete stage",
        type: "error",
      });
    }
  };

  // ============================================
  // ACTION CRUD HANDLERS
  // ============================================
  const handleSaveAction = async () => {
    if (!editingAction?.actionCode || !editingAction?.displayName) {
      setStatusMessage({ text: "Action Code and Display Name are required.", type: "error" });
      return;
    }
    try {
      const payload: Partial<WorkflowActionItem> = {
        ...editingAction,
        actionName: editingAction.displayName || editingAction.actionCode,
        actionType: editingAction.actionType || "TRANSITION",
        requiresEsign: editingAction.requiresEsign ?? true,
        requiresComment: editingAction.requiresComment ?? false,
        requiresJustification: editingAction.requiresJustification ?? false,
        requiresUserSelection: editingAction.requiresUserSelection ?? false,
        requiresConfirmation: editingAction.requiresConfirmation ?? true,
        isActive: true,
      };

      if (editingAction.actionId && editingAction.id) {
        await updateWorkflowAction(editingAction.actionId, payload);
        setStatusMessage({ text: "Action updated successfully.", type: "success" });
      } else {
        await createWorkflowAction(payload);
        setStatusMessage({ text: "Action created successfully.", type: "success" });
      }
      setIsActionModalOpen(false);
      setEditingAction(null);
      await reloadCurrentConfig();
    } catch (err: unknown) {
      setStatusMessage({
        text: err instanceof Error ? err.message : "Failed to save action",
        type: "error",
      });
    }
  };

  const handleDeleteAction = async (actionId: string) => {
    if (!confirm("Are you sure you want to delete this action?")) return;
    try {
      await deleteWorkflowAction(actionId);
      setStatusMessage({ text: "Action deleted.", type: "success" });
      await reloadCurrentConfig();
    } catch (err: unknown) {
      setStatusMessage({
        text: err instanceof Error ? err.message : "Failed to delete action",
        type: "error",
      });
    }
  };

  // ============================================
  // TRANSITION CRUD HANDLERS
  // ============================================
  const handleSaveTransition = async () => {
    if (!editingTransition?.fromStageCode || !editingTransition?.actionCode || !editingTransition?.resultingStatus) {
      setStatusMessage({ text: "From Stage, Action, and Resulting Status are required.", type: "error" });
      return;
    }
    try {
      const payload: Partial<WorkflowTransitionItem> = {
        ...editingTransition,
        workflowCode: selectedDefinition?.workflowCode || "IIOT_BATCH_STAGE_WORKFLOW",
        workflowVersion: selectedDefinition?.version || "1.0.0",
        isActive: true,
      };

      if (editingTransition.transitionId && editingTransition.id) {
        await updateWorkflowTransition(editingTransition.transitionId, payload);
        setStatusMessage({ text: "Transition updated successfully.", type: "success" });
      } else {
        await createWorkflowTransition(payload);
        setStatusMessage({ text: "Transition created successfully.", type: "success" });
      }
      setIsTransitionModalOpen(false);
      setEditingTransition(null);
      await reloadCurrentConfig();
    } catch (err: unknown) {
      setStatusMessage({
        text: err instanceof Error ? err.message : "Failed to save transition",
        type: "error",
      });
    }
  };

  const handleDeleteTransition = async (transitionId: string) => {
    if (!confirm("Are you sure you want to delete this transition?")) return;
    try {
      await deleteWorkflowTransition(transitionId);
      setStatusMessage({ text: "Transition deleted.", type: "success" });
      await reloadCurrentConfig();
    } catch (err: unknown) {
      setStatusMessage({
        text: err instanceof Error ? err.message : "Failed to delete transition",
        type: "error",
      });
    }
  };

  // ============================================
  // ASSIGNMENT CRUD HANDLERS
  // ============================================
  const handleSaveAssignment = async () => {
    if (!editingAssignment?.stageCode || !editingAssignment?.roleCode) {
      setStatusMessage({ text: "Stage Code and Role Code are required.", type: "error" });
      return;
    }
    try {
      const payload: Partial<WorkflowAssignmentItem> = {
        ...editingAssignment,
        workflowCode: selectedDefinition?.workflowCode || "IIOT_BATCH_STAGE_WORKFLOW",
        eligibleUserRule: editingAssignment.eligibleUserRule || "ALL_IN_ROLE",
        assignmentRule: editingAssignment.assignmentRule || "ROLE_BASED",
        tenantId: editingAssignment.tenantId || "TNT-0001",
        plantId: editingAssignment.plantId || "PLNT-0001",
        isActive: true,
      };

      if (editingAssignment.assignmentId && editingAssignment.id) {
        await updateWorkflowAssignment(editingAssignment.assignmentId, payload);
        setStatusMessage({ text: "Assignment updated successfully.", type: "success" });
      } else {
        await createWorkflowAssignment(payload);
        setStatusMessage({ text: "Assignment created successfully.", type: "success" });
      }
      setIsAssignmentModalOpen(false);
      setEditingAssignment(null);
      await reloadCurrentConfig();
    } catch (err: unknown) {
      setStatusMessage({
        text: err instanceof Error ? err.message : "Failed to save assignment",
        type: "error",
      });
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!confirm("Are you sure you want to delete this assignment?")) return;
    try {
      await deleteWorkflowAssignment(assignmentId);
      setStatusMessage({ text: "Assignment deleted.", type: "success" });
      await reloadCurrentConfig();
    } catch (err: unknown) {
      setStatusMessage({
        text: err instanceof Error ? err.message : "Failed to delete assignment",
        type: "error",
      });
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6 bg-slate-50 text-slate-900 min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-indigo-600" />
            Manage Workflow
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Enterprise Master Data Management for multi-stage workflow definitions, dynamic lifecycle gates, role assignments, and 21 CFR Part 11 electronic signature rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingDefinition({
                workflowCode: "",
                workflowName: "",
                module: "IIOT",
                entity: "BATCH_STAGE",
                version: "1.0.0",
                description: "",
              });
              setIsDefinitionModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <Plus className="h-4 w-4" /> New Workflow Definition
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 shadow-sm transition"
          >
            <ArrowClockwise className={`h-4 w-4 text-slate-600 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Notifications */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs font-medium flex items-center justify-between shadow-sm animate-in fade-in duration-200 ${
            statusMessage.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-rose-50 border border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === "success" ? (
              <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <WarningCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs underline hover:opacity-80 font-bold ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Workflow Definitions Cards Carousel/List */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {definitions.map((def) => {
          const isSelected = selectedDefinition?.workflowId === def.workflowId;
          return (
            <div
              key={def.workflowId}
              onClick={() => handleSelectDefinition(def)}
              className={`cursor-pointer rounded-xl p-4 border transition shadow-sm relative group ${
                isSelected
                  ? "bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-500"
                  : "bg-white border-slate-200 hover:border-slate-300 hover:shadow"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-bold">
                      {def.workflowCode}
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-100 border border-indigo-200 text-indigo-700">
                      v{def.version}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 mt-2 text-sm">
                    {def.workflowName}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Module: <strong className="text-slate-700">{def.module}</strong> &bull; Entity:{" "}
                    <strong className="text-slate-700">{def.entity}</strong>
                  </p>
                </div>
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border uppercase tracking-wider ${
                    def.status === "ACTIVE"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : def.status === "DRAFT"
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : "bg-slate-100 border-slate-200 text-slate-500"
                  }`}
                >
                  {def.status}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                <span className="text-slate-500 text-[11px]">
                  Stages: <strong className="text-slate-800">{def.stageCodes?.length || config?.stages.length || 0}</strong>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingDefinition(def);
                      setIsDefinitionModalOpen(true);
                    }}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                    title="Edit Definition"
                  >
                    <PencilSimple className="h-3.5 w-3.5" />
                  </button>
                  {def.status !== "ACTIVE" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleActivate(def.workflowId);
                      }}
                      className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] shadow-sm transition"
                    >
                      Activate
                    </button>
                  )}
                  {def.status === "ACTIVE" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRetire(def.workflowId);
                      }}
                      className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-[10px] transition"
                    >
                      Retire
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Single Page Tabbed Workspace */}
      {selectedDefinition && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
          {/* Navigation Tab Bar */}
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-3 gap-2">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <button
                onClick={() => setActiveTab("pipeline")}
                className={`flex items-center gap-1.5 pb-2 border-b-2 text-xs font-semibold transition ${
                  activeTab === "pipeline"
                    ? "border-indigo-600 text-indigo-600 font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                <GitBranch className="h-4 w-4" /> Visual Pipeline
              </button>
              <button
                onClick={() => setActiveTab("definitions")}
                className={`flex items-center gap-1.5 pb-2 border-b-2 text-xs font-semibold transition ${
                  activeTab === "definitions"
                    ? "border-indigo-600 text-indigo-600 font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                <FileText className="h-4 w-4" /> Definition Details
              </button>
              <button
                onClick={() => setActiveTab("stages")}
                className={`flex items-center gap-1.5 pb-2 border-b-2 text-xs font-semibold transition ${
                  activeTab === "stages"
                    ? "border-indigo-600 text-indigo-600 font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                <Stack className="h-4 w-4" /> Stages ({config?.stages.length || 0})
              </button>
              <button
                onClick={() => setActiveTab("actions")}
                className={`flex items-center gap-1.5 pb-2 border-b-2 text-xs font-semibold transition ${
                  activeTab === "actions"
                    ? "border-indigo-600 text-indigo-600 font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                <Sliders className="h-4 w-4" /> Actions ({config?.actions.length || 0})
              </button>
              <button
                onClick={() => setActiveTab("transitions")}
                className={`flex items-center gap-1.5 pb-2 border-b-2 text-xs font-semibold transition ${
                  activeTab === "transitions"
                    ? "border-indigo-600 text-indigo-600 font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                <ArrowRight className="h-4 w-4" /> Transitions ({config?.transitions.length || 0})
              </button>
              <button
                onClick={() => setActiveTab("assignments")}
                className={`flex items-center gap-1.5 pb-2 border-b-2 text-xs font-semibold transition ${
                  activeTab === "assignments"
                    ? "border-indigo-600 text-indigo-600 font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                <Users className="h-4 w-4" /> Role Assignments ({config?.assignments.length || 0})
              </button>
              <button
                onClick={() => setActiveTab("activation")}
                className={`flex items-center gap-1.5 pb-2 border-b-2 text-xs font-semibold transition ${
                  activeTab === "activation"
                    ? "border-indigo-600 text-indigo-600 font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                <CheckSquare className="h-4 w-4" /> Validation & Activation
              </button>
            </div>
          </div>

          {/* TAB 1: VISUAL PIPELINE */}
          {activeTab === "pipeline" && config && (
            <div className="space-y-6">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2 uppercase tracking-wider">
                    <Stack className="h-4 w-4 text-indigo-600" />
                    Sequential GxP Process Stages
                  </h4>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Workflow: {selectedDefinition.workflowCode} (v{selectedDefinition.version})
                  </span>
                </div>

                <div className="flex flex-col md:flex-row items-stretch gap-4 overflow-x-auto py-2">
                  {config.stages
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((stage, idx) => (
                      <React.Fragment key={stage.stageId}>
                        <div className="bg-white border border-slate-200 rounded-xl p-4 min-w-[220px] flex-1 shadow-sm flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                              <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                Stage {stage.sequence}
                              </span>
                              <span className="font-mono text-[10px] text-slate-600">{stage.stageType}</span>
                            </div>
                            <h5 className="font-bold text-slate-900 text-sm mt-1">{stage.stageName}</h5>
                            <div className="mt-2 text-xs space-y-1">
                              <div className="text-slate-600 text-[11px]">
                                Role: <strong className="text-slate-800">{stage.assignedRole}</strong>
                              </div>
                              <div className="text-slate-500 text-[11px]">
                                Status: <span className="font-mono text-emerald-700">{stage.entryStatus}</span> &rarr;{" "}
                                <span className="font-mono text-indigo-600">{stage.exitStatus}</span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-100">
                            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                              Allowed Actions:
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {stage.allowedActionCodes?.map((code) => (
                                <span
                                  key={code}
                                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                                >
                                  {code}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        {idx < config.stages.length - 1 && (
                          <div className="flex items-center justify-center">
                            <ArrowRight className="h-5 w-5 text-slate-400 flex-shrink-0 hidden md:block" />
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                </div>
              </div>

              {/* State Machine Transition Flow */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2 uppercase tracking-wider">
                  <ArrowRight className="h-4 w-4 text-indigo-600" />
                  State Machine Transitions & Return Paths
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {config.transitions.map((t) => (
                    <div
                      key={t.transitionId}
                      className="p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-1.5 shadow-sm"
                    >
                      <div className="flex items-center justify-between font-mono font-semibold">
                        <span className="text-indigo-600 font-bold">{t.actionCode}</span>
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                          {t.resultingStatus}
                        </span>
                      </div>
                      <div className="text-slate-600 text-[11px]">
                        From: <strong className="text-slate-800">{t.fromStageCode}</strong> &rarr; To:{" "}
                        <strong className="text-slate-800">{t.toStageCode || "COMPLETED"}</strong>
                      </div>
                      {t.returnStageCode && (
                        <div className="text-rose-600 text-[10px] font-medium flex items-center gap-1">
                          <WarningCircle className="h-3.5 w-3.5 flex-shrink-0" />
                          <span>Return Stage on Rejection: <strong>{t.returnStageCode}</strong></span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DEFINITION DETAILS */}
          {activeTab === "definitions" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Workflow Definition Properties
                </h4>
                <button
                  onClick={() => {
                    setEditingDefinition(selectedDefinition);
                    setIsDefinitionModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold transition"
                >
                  <PencilSimple className="h-3.5 w-3.5" /> Edit Definition
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div className="space-y-2">
                  <div>
                    <span className="text-slate-500 font-medium">Workflow Code:</span>{" "}
                    <strong className="text-slate-900 font-mono">{selectedDefinition.workflowCode}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Workflow Name:</span>{" "}
                    <strong className="text-slate-900">{selectedDefinition.workflowName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Module / Scope:</span>{" "}
                    <strong className="text-slate-900">{selectedDefinition.module}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Entity Type:</span>{" "}
                    <strong className="text-slate-900">{selectedDefinition.entity}</strong>
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <span className="text-slate-500 font-medium">Version:</span>{" "}
                    <strong className="text-slate-900 font-mono">v{selectedDefinition.version}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Status:</span>{" "}
                    <span className="font-semibold text-emerald-700">{selectedDefinition.status}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Tenant ID:</span>{" "}
                    <strong className="text-slate-900 font-mono">{selectedDefinition.tenantId || "TNT-0001"}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Plant ID:</span>{" "}
                    <strong className="text-slate-900 font-mono">{selectedDefinition.plantId || "PLNT-0001"}</strong>
                  </div>
                </div>

                {selectedDefinition.description && (
                  <div className="col-span-2 pt-2 border-t border-slate-200 text-slate-600">
                    <span className="text-slate-500 font-medium">Description:</span>{" "}
                    <span>{selectedDefinition.description}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: STAGES */}
          {activeTab === "stages" && config && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Configured Workflow Stages
                </h4>
                <button
                  onClick={() => {
                    setEditingStage({
                      stageCode: "",
                      stageName: "",
                      sequence: (config.stages.length || 0) + 1,
                      stageType: "INTERMEDIATE",
                      assignedRole: "PRODUCTION_OPERATOR",
                      entryStatus: "PENDING",
                      exitStatus: "UNDER_REVIEW",
                      allowedActionCodes: [],
                      isMandatory: true,
                    });
                    setIsStageModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Stage
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Seq</th>
                      <th className="py-3 px-4">Stage Code</th>
                      <th className="py-3 px-4">Stage Name</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Assigned Role</th>
                      <th className="py-3 px-4">Entry &rarr; Exit Status</th>
                      <th className="py-3 px-4">Allowed Actions</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const totalStagesPages = Math.max(1, Math.ceil((config.stages.length || 0) / stagesPageSize));
                      const safeStagesPage = Math.min(stagesPage, totalStagesPages);
                      const visibleStages = (config.stages || []).slice((safeStagesPage - 1) * stagesPageSize, safeStagesPage * stagesPageSize);
                      return visibleStages.map((stg) => (
                      <tr key={stg.stageId} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{stg.sequence}</td>
                        <td className="py-3 px-4 font-mono font-semibold text-indigo-600">{stg.stageCode}</td>
                        <td className="py-3 px-4 font-medium text-slate-900">{stg.stageName}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-mono">
                            {stg.stageType}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">{stg.assignedRole}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                          {stg.entryStatus || "ANY"} &rarr; {stg.exitStatus || "COMPLETED"}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-indigo-600">
                          {stg.allowedActionCodes?.join(", ") || "-"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setEditingStage(stg);
                                setIsStageModalOpen(true);
                              }}
                              className="p-1 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                              title="Edit Stage"
                            >
                              <PencilSimple className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteStage(stg.stageId)}
                              className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                              title="Delete Stage"
                            >
                              <Trash className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ));
                    })()}
                  </tbody>
                </table>
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 bg-slate-50/60 rounded-b-xl">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-xs text-slate-600">
                      Showing {config.stages.length === 0 ? 0 : (Math.min(stagesPage, Math.max(1, Math.ceil(config.stages.length / stagesPageSize))) - 1) * stagesPageSize + 1} to {Math.min(Math.min(stagesPage, Math.max(1, Math.ceil(config.stages.length / stagesPageSize))) * stagesPageSize, config.stages.length)} of {config.stages.length} entries
                    </span>
                    <label className="text-xs text-slate-600 flex items-center gap-2 whitespace-nowrap">
                      Rows per page
                      <select
                        value={stagesPageSize}
                        onChange={(e) => {
                          setStagesPageSize(Number(e.target.value));
                          setStagesPage(1);
                        }}
                        className="rounded-md border border-[#D9E2EE] bg-white px-2 py-1 text-slate-800 text-xs outline-none"
                      >
                        {[5, 10, 20].map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <TablePagination
                    currentPage={Math.min(stagesPage, Math.max(1, Math.ceil(config.stages.length / stagesPageSize)))}
                    totalPages={Math.max(1, Math.ceil(config.stages.length / stagesPageSize))}
                    onPageChange={setStagesPage}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ACTIONS */}
          {activeTab === "actions" && config && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Configured Workflow Actions
                </h4>
                <button
                  onClick={() => {
                    setEditingAction({
                      actionCode: "",
                      actionName: "",
                      displayName: "",
                      actionType: "TRANSITION",
                      requiresEsign: true,
                      requiresComment: false,
                      requiresJustification: false,
                      requiresUserSelection: false,
                      requiresConfirmation: true,
                    });
                    setIsActionModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Action
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Action Code</th>
                      <th className="py-3 px-4">Display Name</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">E-Sign (21 CFR Part 11)</th>
                      <th className="py-3 px-4">Comments</th>
                      <th className="py-3 px-4">Justification / Info</th>
                      <th className="py-3 px-4">Assignee Select</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const totalActionsPages = Math.max(1, Math.ceil((config.actions.length || 0) / actionsPageSize));
                      const safeActionsPage = Math.min(actionsPage, totalActionsPages);
                      const visibleActions = (config.actions || []).slice((safeActionsPage - 1) * actionsPageSize, safeActionsPage * actionsPageSize);
                      return visibleActions.map((act) => (
                      <tr key={act.actionId} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-mono font-semibold text-indigo-600">{act.actionCode}</td>
                        <td className="py-3 px-4 font-medium text-slate-900">{act.displayName || act.actionName}</td>
                        <td className="py-3 px-4 font-mono text-[10px]">{act.actionType}</td>
                        <td className="py-3 px-4 font-medium text-slate-900">{act.applicableRole || "Dynamic"}</td>
                        <td className="py-3 px-4">
                          {act.requiresEsign ? (
                            <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px] inline-flex items-center gap-1">
                              <Lock className="h-3 w-3" /> Required
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Optional</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {act.requiresComment ? (
                            <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[10px]">
                              Mandatory
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Optional</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {act.requiresJustification ? (
                            <span className="text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-[10px]">
                              Mandatory
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">No</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {act.requiresUserSelection ? (
                            <span className="text-indigo-700 font-semibold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-[10px]">
                              Required
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">No</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setEditingAction(act);
                                setIsActionModalOpen(true);
                              }}
                              className="p-1 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                              title="Edit Action"
                            >
                              <PencilSimple className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteAction(act.actionId)}
                              className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                              title="Delete Action"
                            >
                              <Trash className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ));
                    })()}
                  </tbody>
                </table>
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 bg-slate-50/60 rounded-b-xl">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-xs text-slate-600">
                      Showing {config.actions.length === 0 ? 0 : (Math.min(actionsPage, Math.max(1, Math.ceil(config.actions.length / actionsPageSize))) - 1) * actionsPageSize + 1} to {Math.min(Math.min(actionsPage, Math.max(1, Math.ceil(config.actions.length / actionsPageSize))) * actionsPageSize, config.actions.length)} of {config.actions.length} entries
                    </span>
                    <label className="text-xs text-slate-600 flex items-center gap-2 whitespace-nowrap">
                      Rows per page
                      <select
                        value={actionsPageSize}
                        onChange={(e) => {
                          setActionsPageSize(Number(e.target.value));
                          setActionsPage(1);
                        }}
                        className="rounded-md border border-[#D9E2EE] bg-white px-2 py-1 text-slate-800 text-xs outline-none"
                      >
                        {[5, 10, 20].map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <TablePagination
                    currentPage={Math.min(actionsPage, Math.max(1, Math.ceil(config.actions.length / actionsPageSize)))}
                    totalPages={Math.max(1, Math.ceil(config.actions.length / actionsPageSize))}
                    onPageChange={setActionsPage}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: TRANSITIONS */}
          {activeTab === "transitions" && config && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Configured State Transitions
                </h4>
                <button
                  onClick={() => {
                    setEditingTransition({
                      fromStageCode: config.stages[0]?.stageCode || "SUBMISSION",
                      actionCode: config.actions[0]?.actionCode || "SEND_FOR_REVIEW",
                      toStageCode: config.stages[1]?.stageCode || "REVIEW",
                      resultingStatus: "UNDER_REVIEW",
                      returnStageCode: "",
                    });
                    setIsTransitionModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Transition
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Transition ID</th>
                      <th className="py-3 px-4">From Stage</th>
                      <th className="py-3 px-4">Trigger Action</th>
                      <th className="py-3 px-4">To Stage</th>
                      <th className="py-3 px-4">Resulting Status</th>
                      <th className="py-3 px-4">Rejection Return Stage</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const totalTransitionsPages = Math.max(1, Math.ceil((config.transitions.length || 0) / transitionsPageSize));
                      const safeTransitionsPage = Math.min(transitionsPage, totalTransitionsPages);
                      const visibleTransitions = (config.transitions || []).slice((safeTransitionsPage - 1) * transitionsPageSize, safeTransitionsPage * transitionsPageSize);
                      return visibleTransitions.map((t) => (
                      <tr key={t.transitionId} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-mono text-slate-500">{t.transitionId}</td>
                        <td className="py-3 px-4 font-medium text-slate-900">{t.fromStageCode}</td>
                        <td className="py-3 px-4 font-mono font-semibold text-indigo-600">{t.actionCode}</td>
                        <td className="py-3 px-4 font-medium text-slate-900">{t.toStageCode || "COMPLETED"}</td>
                        <td className="py-3 px-4 font-mono font-semibold text-emerald-700">{t.resultingStatus}</td>
                        <td className="py-3 px-4 font-mono text-rose-600">{t.returnStageCode || "-"}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setEditingTransition(t);
                                setIsTransitionModalOpen(true);
                              }}
                              className="p-1 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                              title="Edit Transition"
                            >
                              <PencilSimple className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteTransition(t.transitionId)}
                              className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                              title="Delete Transition"
                            >
                              <Trash className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ));
                    })()}
                  </tbody>
                </table>
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 bg-slate-50/60 rounded-b-xl">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-xs text-slate-600">
                      Showing {config.transitions.length === 0 ? 0 : (Math.min(transitionsPage, Math.max(1, Math.ceil(config.transitions.length / transitionsPageSize))) - 1) * transitionsPageSize + 1} to {Math.min(Math.min(transitionsPage, Math.max(1, Math.ceil(config.transitions.length / transitionsPageSize))) * transitionsPageSize, config.transitions.length)} of {config.transitions.length} entries
                    </span>
                    <label className="text-xs text-slate-600 flex items-center gap-2 whitespace-nowrap">
                      Rows per page
                      <select
                        value={transitionsPageSize}
                        onChange={(e) => {
                          setTransitionsPageSize(Number(e.target.value));
                          setTransitionsPage(1);
                        }}
                        className="rounded-md border border-[#D9E2EE] bg-white px-2 py-1 text-slate-800 text-xs outline-none"
                      >
                        {[5, 10, 20].map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <TablePagination
                    currentPage={Math.min(transitionsPage, Math.max(1, Math.ceil(config.transitions.length / transitionsPageSize)))}
                    totalPages={Math.max(1, Math.ceil(config.transitions.length / transitionsPageSize))}
                    onPageChange={setTransitionsPage}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: ROLE & USER GROUP ASSIGNMENTS */}
          {activeTab === "assignments" && config && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Configured Role & User Group Assignments
                </h4>
                <button
                  onClick={() => {
                    setEditingAssignment({
                      stageCode: config.stages[0]?.stageCode || "SUBMISSION",
                      roleCode: "PRODUCTION_OPERATOR",
                      userGroupId: "",
                      eligibleUserRule: "ALL_IN_ROLE",
                      assignmentRule: "ROLE_BASED",
                    });
                    setIsAssignmentModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Assignment
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Assignment ID</th>
                      <th className="py-3 px-4">Stage Code</th>
                      <th className="py-3 px-4">Assigned Role</th>
                      <th className="py-3 px-4">User Group</th>
                      <th className="py-3 px-4">Assignment Rule</th>
                      <th className="py-3 px-4">Plant & Tenant Scope</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const totalAssignmentsPages = Math.max(1, Math.ceil((config.assignments.length || 0) / assignmentsPageSize));
                      const safeAssignmentsPage = Math.min(assignmentsPage, totalAssignmentsPages);
                      const visibleAssignments = (config.assignments || []).slice((safeAssignmentsPage - 1) * assignmentsPageSize, safeAssignmentsPage * assignmentsPageSize);
                      return visibleAssignments.map((a) => (
                      <tr key={a.assignmentId} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-mono text-slate-500">{a.assignmentId}</td>
                        <td className="py-3 px-4 font-semibold text-indigo-600">{a.stageCode}</td>
                        <td className="py-3 px-4 font-medium text-slate-900">{a.roleCode}</td>
                        <td className="py-3 px-4 font-medium text-slate-700">{a.userGroupId || "All Users in Role"}</td>
                        <td className="py-3 px-4 font-mono text-[10px] text-slate-600">{a.assignmentRule}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                          {a.plantId || "ALL_PLANTS"} &bull; {a.tenantId || "TNT-0001"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setEditingAssignment(a);
                                setIsAssignmentModalOpen(true);
                              }}
                              className="p-1 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                              title="Edit Assignment"
                            >
                              <PencilSimple className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteAssignment(a.assignmentId)}
                              className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                              title="Delete Assignment"
                            >
                              <Trash className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ));
                    })()}
                  </tbody>
                </table>
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 bg-slate-50/60 rounded-b-xl">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-xs text-slate-600">
                      Showing {config.assignments.length === 0 ? 0 : (Math.min(assignmentsPage, Math.max(1, Math.ceil(config.assignments.length / assignmentsPageSize))) - 1) * assignmentsPageSize + 1} to {Math.min(Math.min(assignmentsPage, Math.max(1, Math.ceil(config.assignments.length / assignmentsPageSize))) * assignmentsPageSize, config.assignments.length)} of {config.assignments.length} entries
                    </span>
                    <label className="text-xs text-slate-600 flex items-center gap-2 whitespace-nowrap">
                      Rows per page
                      <select
                        value={assignmentsPageSize}
                        onChange={(e) => {
                          setAssignmentsPageSize(Number(e.target.value));
                          setAssignmentsPage(1);
                        }}
                        className="rounded-md border border-[#D9E2EE] bg-white px-2 py-1 text-slate-800 text-xs outline-none"
                      >
                        {[5, 10, 20].map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <TablePagination
                    currentPage={Math.min(assignmentsPage, Math.max(1, Math.ceil(config.assignments.length / assignmentsPageSize)))}
                    totalPages={Math.max(1, Math.ceil(config.assignments.length / assignmentsPageSize))}
                    onPageChange={setAssignmentsPage}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: VALIDATION & ACTIVATION */}
          {activeTab === "activation" && (
            <div className="space-y-6">
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <CheckSquare className="h-5 w-5 text-indigo-600" />
                      Workflow Validation & Activation Gate
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Validate that all stages are reachable, transitions are connected, and roles are properly assigned before activating version.
                    </p>
                  </div>
                  <button
                    onClick={handleValidate}
                    disabled={validating}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                  >
                    <CheckCircle className={`h-4 w-4 ${validating ? "animate-spin" : ""}`} />
                    Run Validation Check
                  </button>
                </div>

                {/* Validation Status */}
                {validationResult && (
                  <div
                    className={`p-4 rounded-xl border text-xs space-y-2 ${
                      validationResult.valid
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : "bg-rose-50 border-rose-200 text-rose-900"
                    }`}
                  >
                    <div className="font-bold flex items-center gap-2">
                      {validationResult.valid ? (
                        <CheckCircle className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <WarningCircle className="h-5 w-5 text-rose-600" />
                      )}
                      <span>
                        {validationResult.valid
                          ? "Workflow configuration is completely valid."
                          : "Workflow validation errors detected:"}
                      </span>
                    </div>
                    {validationResult.errors && validationResult.errors.length > 0 && (
                      <ul className="list-disc list-inside space-y-1 text-[11px] pl-2">
                        {validationResult.errors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Activation Actions */}
                <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                  <div className="text-xs text-slate-600">
                    Current Version Status:{" "}
                    <strong className="font-mono text-slate-900">{selectedDefinition.status}</strong>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedDefinition.status !== "ACTIVE" && (
                      <button
                        onClick={() => handleActivate(selectedDefinition.workflowId)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
                      >
                        <Play className="h-3.5 w-3.5" /> Activate Version (v{selectedDefinition.version})
                      </button>
                    )}
                    {selectedDefinition.status === "ACTIVE" && (
                      <button
                        onClick={() => handleRetire(selectedDefinition.workflowId)}
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
                      >
                        <Stop className="h-3.5 w-3.5" /> Retire Version
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: WORKFLOW DEFINITION */}
      {/* ========================================================================= */}
      {isDefinitionModalOpen && editingDefinition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 text-xs text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm text-slate-900">
                {editingDefinition.id ? "Edit Workflow Definition" : "New Workflow Definition"}
              </h3>
              <button onClick={() => setIsDefinitionModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Workflow Code *</label>
                <input
                  type="text"
                  placeholder="e.g. IIOT_BATCH_STAGE_WORKFLOW"
                  value={editingDefinition.workflowCode || ""}
                  onChange={(e) => setEditingDefinition({ ...editingDefinition, workflowCode: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Workflow Name *</label>
                <input
                  type="text"
                  placeholder="e.g. IIoT Batch Review & Approval"
                  value={editingDefinition.workflowName || ""}
                  onChange={(e) => setEditingDefinition({ ...editingDefinition, workflowName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Module</label>
                  <select
                    value={editingDefinition.module || "IIOT"}
                    onChange={(e) => setEditingDefinition({ ...editingDefinition, module: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs"
                  >
                    <option value="IIOT">IIOT</option>
                    <option value="EBR">EBR</option>
                    <option value="DMS">DMS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Entity</label>
                  <input
                    type="text"
                    value={editingDefinition.entity || "BATCH_STAGE"}
                    onChange={(e) => setEditingDefinition({ ...editingDefinition, entity: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Describe workflow purpose..."
                  value={editingDefinition.description || ""}
                  onChange={(e) => setEditingDefinition({ ...editingDefinition, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setIsDefinitionModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDefinition}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm"
              >
                Save Definition
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: STAGE */}
      {/* ========================================================================= */}
      {isStageModalOpen && editingStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 text-xs text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm text-slate-900">
                {editingStage.id ? "Edit Workflow Stage" : "New Workflow Stage"}
              </h3>
              <button onClick={() => setIsStageModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Stage Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. SUBMISSION, REVIEW"
                    value={editingStage.stageCode || ""}
                    onChange={(e) => setEditingStage({ ...editingStage, stageCode: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Sequence</label>
                  <input
                    type="number"
                    value={editingStage.sequence ?? 1}
                    onChange={(e) => setEditingStage({ ...editingStage, sequence: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Stage Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Production Submission"
                  value={editingStage.stageName || ""}
                  onChange={(e) => setEditingStage({ ...editingStage, stageName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Stage Type</label>
                  <select
                    value={editingStage.stageType || "INTERMEDIATE"}
                    onChange={(e) =>
                      setEditingStage({
                        ...editingStage,
                        stageType: e.target.value as "INITIAL" | "INTERMEDIATE" | "FINAL",
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs"
                  >
                    <option value="INITIAL">INITIAL</option>
                    <option value="INTERMEDIATE">INTERMEDIATE</option>
                    <option value="FINAL">FINAL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Assigned Role</label>
                  <select
                    value={editingStage.assignedRole || "PRODUCTION_OPERATOR"}
                    onChange={(e) => setEditingStage({ ...editingStage, assignedRole: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  >
                    <option value="PRODUCTION_OPERATOR">PRODUCTION_OPERATOR</option>
                    <option value="PRODUCTION_REVIEWER">PRODUCTION_REVIEWER</option>
                    <option value="QA_APPROVER">QA_APPROVER</option>
                    <option value="SYSTEM_ADMIN">SYSTEM_ADMIN</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Entry Status</label>
                  <input
                    type="text"
                    value={editingStage.entryStatus || "PENDING"}
                    onChange={(e) => setEditingStage({ ...editingStage, entryStatus: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Exit Status</label>
                  <input
                    type="text"
                    value={editingStage.exitStatus || "UNDER_REVIEW"}
                    onChange={(e) => setEditingStage({ ...editingStage, exitStatus: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setIsStageModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStage}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm"
              >
                Save Stage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ACTION */}
      {/* ========================================================================= */}
      {isActionModalOpen && editingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 text-xs text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm text-slate-900">
                {editingAction.id ? "Edit Workflow Action" : "New Workflow Action"}
              </h3>
              <button onClick={() => setIsActionModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Action Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. SEND_FOR_REVIEW"
                    value={editingAction.actionCode || ""}
                    onChange={(e) => setEditingAction({ ...editingAction, actionCode: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Display Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Submit for Review"
                    value={editingAction.displayName || ""}
                    onChange={(e) => setEditingAction({ ...editingAction, displayName: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Action Type</label>
                  <select
                    value={editingAction.actionType || "TRANSITION"}
                    onChange={(e) => setEditingAction({ ...editingAction, actionType: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  >
                    <option value="TRANSITION">TRANSITION</option>
                    <option value="APPROVE">APPROVE</option>
                    <option value="REJECT">REJECT</option>
                    <option value="DEFER">DEFER</option>
                    <option value="JUSTIFY">JUSTIFY</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Applicable Role</label>
                  <select
                    value={editingAction.applicableRole || ""}
                    onChange={(e) => setEditingAction({ ...editingAction, applicableRole: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  >
                    <option value="">Dynamic / Inherited</option>
                    <option value="PRODUCTION_OPERATOR">PRODUCTION_OPERATOR</option>
                    <option value="PRODUCTION_REVIEWER">PRODUCTION_REVIEWER</option>
                    <option value="QA_APPROVER">QA_APPROVER</option>
                  </select>
                </div>
              </div>

              {/* Checkbox Flags */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={editingAction.requiresEsign ?? true}
                    onChange={(e) => setEditingAction({ ...editingAction, requiresEsign: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>Requires 21 CFR Part 11 Electronic Signature (Password Gate)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={editingAction.requiresComment ?? false}
                    onChange={(e) => setEditingAction({ ...editingAction, requiresComment: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>Requires Mandatory Comments</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={editingAction.requiresJustification ?? false}
                    onChange={(e) =>
                      setEditingAction({ ...editingAction, requiresJustification: e.target.checked })
                    }
                    className="rounded text-indigo-600"
                  />
                  <span>Requires Mandatory Justification / Clarification Reason</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={editingAction.requiresUserSelection ?? false}
                    onChange={(e) =>
                      setEditingAction({ ...editingAction, requiresUserSelection: e.target.checked })
                    }
                    className="rounded text-indigo-600"
                  />
                  <span>Requires Explicit Manual Assignee Selection</span>
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setIsActionModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAction}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm"
              >
                Save Action
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: TRANSITION */}
      {/* ========================================================================= */}
      {isTransitionModalOpen && editingTransition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 text-xs text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm text-slate-900">
                {editingTransition.id ? "Edit Workflow Transition" : "New Workflow Transition"}
              </h3>
              <button onClick={() => setIsTransitionModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">From Stage Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. SUBMISSION"
                    value={editingTransition.fromStageCode || ""}
                    onChange={(e) => setEditingTransition({ ...editingTransition, fromStageCode: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Trigger Action Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. SEND_FOR_REVIEW"
                    value={editingTransition.actionCode || ""}
                    onChange={(e) => setEditingTransition({ ...editingTransition, actionCode: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">To Stage Code</label>
                  <input
                    type="text"
                    placeholder="e.g. REVIEW, COMPLETED"
                    value={editingTransition.toStageCode || ""}
                    onChange={(e) => setEditingTransition({ ...editingTransition, toStageCode: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Resulting Status *</label>
                  <input
                    type="text"
                    placeholder="e.g. UNDER_REVIEW, APPROVED"
                    value={editingTransition.resultingStatus || ""}
                    onChange={(e) => setEditingTransition({ ...editingTransition, resultingStatus: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Rejection Return Stage (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. SUBMISSION"
                  value={editingTransition.returnStageCode || ""}
                  onChange={(e) => setEditingTransition({ ...editingTransition, returnStageCode: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setIsTransitionModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTransition}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm"
              >
                Save Transition
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ASSIGNMENT */}
      {/* ========================================================================= */}
      {isAssignmentModalOpen && editingAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 text-xs text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm text-slate-900">
                {editingAssignment.id ? "Edit Role Assignment" : "New Role Assignment"}
              </h3>
              <button onClick={() => setIsAssignmentModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Stage Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. SUBMISSION, REVIEW"
                    value={editingAssignment.stageCode || ""}
                    onChange={(e) => setEditingAssignment({ ...editingAssignment, stageCode: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Role Code *</label>
                  <select
                    value={editingAssignment.roleCode || "PRODUCTION_OPERATOR"}
                    onChange={(e) => setEditingAssignment({ ...editingAssignment, roleCode: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  >
                    <option value="PRODUCTION_OPERATOR">PRODUCTION_OPERATOR</option>
                    <option value="PRODUCTION_REVIEWER">PRODUCTION_REVIEWER</option>
                    <option value="QA_APPROVER">QA_APPROVER</option>
                    <option value="SYSTEM_ADMIN">SYSTEM_ADMIN</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">User Group ID (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. GRP-PROD-OPERATORS"
                    value={editingAssignment.userGroupId || ""}
                    onChange={(e) => setEditingAssignment({ ...editingAssignment, userGroupId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Assignment Rule</label>
                  <select
                    value={editingAssignment.assignmentRule || "ROLE_BASED"}
                    onChange={(e) => setEditingAssignment({ ...editingAssignment, assignmentRule: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs"
                  >
                    <option value="ROLE_BASED">ROLE_BASED</option>
                    <option value="MANUAL_SELECT">MANUAL_SELECT</option>
                    <option value="ROUND_ROBIN">ROUND_ROBIN</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setIsAssignmentModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAssignment}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm"
              >
                Save Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

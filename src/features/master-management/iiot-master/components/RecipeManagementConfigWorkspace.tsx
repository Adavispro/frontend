"use client";

import { useMemo, useState, useEffect } from "react";
import {
  CaretDown,
  CheckCircle,
  FloppyDisk,
  WarningCircle,
  SlidersHorizontal,
  Table as TableIcon,
  Plus,
  ArrowRight,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { Button, TextField } from "@/components/ui";
import { saveRecipeManagementBatch } from "../api";
import type {
  CriticalParameter,
  IiotAsset,
  ProductMaster,
  RecipeManagement,
  RecipeMaster,
} from "../api";

export interface RecipeManagementConfigWorkspaceProps {
  products: ProductMaster[];
  recipes: RecipeMaster[];
  equipments: IiotAsset[];
  criticalParameters: CriticalParameter[];
  recipeManagements: RecipeManagement[];
  initialProductId?: string;
  initialRecipeId?: string;
  initialBatchSize?: string;
  onRefresh: () => Promise<void>;
  onOpenRecipeMaster: () => void;
  onOpenBatchSizeAssociation: (recipe: RecipeMaster) => void;
  tenantId?: string;
  plantId?: string;
}

interface ParameterRowState {
  parameterCode: string;
  parameterName: string;
  unitOfMeasure: string;
  targetSetpoint: string;
  lowLimit: string;
  highLimit: string;
  error?: string;
}

export default function RecipeManagementConfigWorkspace({
  products,
  recipes,
  equipments,
  criticalParameters,
  recipeManagements,
  initialProductId = "",
  initialRecipeId = "",
  initialBatchSize = "",
  onRefresh,
  onOpenRecipeMaster,
  onOpenBatchSizeAssociation,
  tenantId = "TNT-0001",
  plantId = "PLNT-0001",
}: RecipeManagementConfigWorkspaceProps) {
  // Cascading Selection State
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductId);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(initialRecipeId);
  const [selectedBatchSize, setSelectedBatchSize] = useState<string>(initialBatchSize);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>("");

  // Parameter Configuration State
  const [parameterRows, setParameterRows] = useState<ParameterRowState[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Tab: Configure Parameters vs View All Configurations
  const [viewMode, setViewMode] = useState<"configure" | "all">("configure");
  const [tableSearch, setTableSearch] = useState("");

  // Sync initial values when they change externally
  useEffect(() => {
    if (initialProductId) setSelectedProductId(initialProductId);
    if (initialRecipeId) setSelectedRecipeId(initialRecipeId);
    if (initialBatchSize) setSelectedBatchSize(initialBatchSize);
  }, [initialProductId, initialRecipeId, initialBatchSize]);

  // Step 2 Filter: Recipes belonging to selected Product
  const filteredRecipes = useMemo(() => {
    if (!selectedProductId) return [];
    return recipes.filter(
      (r) =>
        r.productId === selectedProductId ||
        r.productCode === selectedProductId,
    );
  }, [recipes, selectedProductId]);

  // Selected Recipe Object
  const currentRecipe = useMemo(() => {
    return recipes.find((r) => r.recipeId === selectedRecipeId);
  }, [recipes, selectedRecipeId]);

  // Step 3 Filter: Associated Batch Sizes for selected Recipe
  const associatedBatchSizes: string[] = useMemo(() => {
    if (!currentRecipe) return [];
    if (Array.isArray(currentRecipe.associatedBatchSizes)) {
      return currentRecipe.associatedBatchSizes;
    }
    if (typeof currentRecipe.associatedBatchSizes === "string") {
      return (currentRecipe.associatedBatchSizes as string)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }, [currentRecipe]);

  // Reset downstream selections when parent selector changes
  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
    setSelectedRecipeId("");
    setSelectedBatchSize("");
    setSelectedEquipmentId("");
    setSaveStatus(null);
  };

  const handleRecipeChange = (recipeId: string) => {
    setSelectedRecipeId(recipeId);
    setSelectedBatchSize("");
    setSelectedEquipmentId("");
    setSaveStatus(null);
  };

  const handleBatchSizeChange = (batchSize: string) => {
    setSelectedBatchSize(batchSize);
    setSelectedEquipmentId("");
    setSaveStatus(null);
  };

  const handleEquipmentChange = (equipmentId: string) => {
    setSelectedEquipmentId(equipmentId);
    setSaveStatus(null);
  };

  // Step 5: Applicable Critical Parameters for selected Equipment
  const applicableCriticalParameters = useMemo(() => {
    if (!selectedEquipmentId) return [];
    return criticalParameters.filter(
      (p) =>
        p.equipmentId === selectedEquipmentId ||
        p.equipmentId?.toUpperCase() === selectedEquipmentId.toUpperCase(),
    );
  }, [criticalParameters, selectedEquipmentId]);

  // Load / Populate Parameters Table
  useEffect(() => {
    if (
      !selectedProductId ||
      !selectedRecipeId ||
      !selectedBatchSize ||
      !selectedEquipmentId
    ) {
      setParameterRows([]);
      return;
    }

    // Find existing configurations for this exact context
    const existingConfigs = recipeManagements.filter(
      (m) =>
        (m.productId === selectedProductId || m.productCode === selectedProductId) &&
        (m.recipeId === selectedRecipeId || m.recipeCode === selectedRecipeId) &&
        m.batchSize?.trim().toUpperCase() === selectedBatchSize.trim().toUpperCase() &&
        (m.equipmentId === selectedEquipmentId || m.equipmentCode === selectedEquipmentId),
    );

    const configMap = new Map<string, RecipeManagement>();
    existingConfigs.forEach((c) => {
      configMap.set(c.parameterCode.toLowerCase(), c);
    });

    const rows: ParameterRowState[] = applicableCriticalParameters.map((param) => {
      const existing = configMap.get(param.parameterCode.toLowerCase());
      return {
        parameterCode: param.parameterCode,
        parameterName: param.parameterName || param.parameterCode,
        unitOfMeasure: param.unitOfMeasure || "",
        targetSetpoint:
          existing?.targetSetpoint !== undefined ? String(existing.targetSetpoint) : "",
        lowLimit: existing?.lowLimit !== undefined ? String(existing.lowLimit) : "",
        highLimit: existing?.highLimit !== undefined ? String(existing.highLimit) : "",
      };
    });

    setParameterRows(rows);
  }, [
    selectedProductId,
    selectedRecipeId,
    selectedBatchSize,
    selectedEquipmentId,
    applicableCriticalParameters,
    recipeManagements,
  ]);

  // Parameter field change handler with inline validation
  const handleParameterChange = (
    index: number,
    field: "targetSetpoint" | "lowLimit" | "highLimit",
    value: string,
  ) => {
    setSaveStatus(null);
    setParameterRows((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value };

      // Validation: Low <= Target <= High
      const low = row.lowLimit !== "" ? parseFloat(row.lowLimit) : undefined;
      const target = row.targetSetpoint !== "" ? parseFloat(row.targetSetpoint) : undefined;
      const high = row.highLimit !== "" ? parseFloat(row.highLimit) : undefined;

      let error: string | undefined = undefined;
      if (low !== undefined && high !== undefined && low > high) {
        error = `Low limit (${low}) cannot exceed High limit (${high}).`;
      } else if (low !== undefined && target !== undefined && target < low) {
        error = `Target (${target}) cannot be less than Low limit (${low}).`;
      } else if (high !== undefined && target !== undefined && target > high) {
        error = `Target (${target}) cannot exceed High limit (${high}).`;
      }

      row.error = error;
      next[index] = row;
      return next;
    });
  };

  const hasValidationErrors = parameterRows.some((r) => !!r.error);
  const hasConfigurableParameters = parameterRows.length > 0;

  // Save all configured parameters
  const handleSaveConfiguration = async () => {
    setSaveStatus(null);
    if (hasValidationErrors) {
      setSaveStatus({
        type: "error",
        message: "Please correct limit validation errors before saving.",
      });
      return;
    }

    const configuredParams = parameterRows
      .filter((r) => r.targetSetpoint !== "" || r.lowLimit !== "" || r.highLimit !== "")
      .map((r) => ({
        parameterCode: r.parameterCode,
        parameterName: r.parameterName,
        unitOfMeasure: r.unitOfMeasure,
        targetSetpoint: r.targetSetpoint !== "" ? parseFloat(r.targetSetpoint) : undefined,
        lowLimit: r.lowLimit !== "" ? parseFloat(r.lowLimit) : undefined,
        highLimit: r.highLimit !== "" ? parseFloat(r.highLimit) : undefined,
      }));

    if (configuredParams.length === 0) {
      setSaveStatus({
        type: "error",
        message: "Please configure at least one parameter limit or setpoint.",
      });
      return;
    }

    setIsSaving(true);
    try {
      await saveRecipeManagementBatch({
        productId: selectedProductId,
        recipeId: selectedRecipeId,
        batchSize: selectedBatchSize,
        equipmentId: selectedEquipmentId,
        tenantId,
        plantId,
        parameters: configuredParams,
      });

      await onRefresh();
      setSaveStatus({
        type: "success",
        message: `Successfully saved ${configuredParams.length} parameter configurations for ${selectedRecipeId} (${selectedBatchSize}) on ${selectedEquipmentId}!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save parameter configurations.";
      setSaveStatus({ type: "error", message: msg });
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered list of all persisted recipe management configurations
  const filteredPersistedRecords = useMemo(() => {
    return recipeManagements.filter((record) => {
      if (!tableSearch.trim()) return true;
      const term = tableSearch.toLowerCase();
      return (
        record.productName?.toLowerCase().includes(term) ||
        record.productCode?.toLowerCase().includes(term) ||
        record.recipeName?.toLowerCase().includes(term) ||
        record.recipeCode?.toLowerCase().includes(term) ||
        record.batchSize?.toLowerCase().includes(term) ||
        record.equipmentName?.toLowerCase().includes(term) ||
        record.equipmentCode?.toLowerCase().includes(term) ||
        record.parameterName?.toLowerCase().includes(term) ||
        record.parameterCode?.toLowerCase().includes(term)
      );
    });
  }, [recipeManagements, tableSearch]);

  return (
    <div className="space-y-6">
      {/* View Mode Tabs */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setViewMode("configure")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "configure"
                ? "bg-primary text-white shadow-sm"
                : "bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
            }`}
          >
            <SlidersHorizontal size={14} weight="bold" /> Configure Parameters
          </button>
          <button
            type="button"
            onClick={() => setViewMode("all")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "all"
                ? "bg-primary text-white shadow-sm"
                : "bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
            }`}
          >
            <TableIcon size={14} weight="bold" /> Persisted Configurations ({recipeManagements.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => void onRefresh()}
            className="h-8 gap-1 px-2.5 text-xs"
            title="Refresh recipe data"
          >
            <ArrowsClockwise size={12} /> Refresh
          </Button>
        </div>
      </div>

      {viewMode === "configure" ? (
        <div className="space-y-6">
          {/* Cascading Context Selectors Card */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-[#475569]">
              Cascading Recipe & Equipment Context
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Step 1: Product */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1E293B]">
                  1. Product <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedProductId}
                    onChange={(e) => handleProductChange(e.target.value)}
                    aria-label="Select Product"
                    className="h-9 w-full appearance-none rounded border border-[#CBD5E1] bg-white px-3 py-1.5 pr-8 text-xs text-[#1E293B] focus:border-primary focus:outline-none"
                  >
                    <option value="">Select Product...</option>
                    {products.map((p) => (
                      <option key={p.productId} value={p.productId}>
                        {p.productName} ({p.productCode || p.productId})
                      </option>
                    ))}
                  </select>
                  <CaretDown
                    size={14}
                    className="pointer-events-none absolute right-2.5 top-2.5 text-[#94A3B8]"
                  />
                </div>
              </div>

              {/* Step 2: Recipe (filtered by product) */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1E293B]">
                  2. Recipe <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedRecipeId}
                    onChange={(e) => handleRecipeChange(e.target.value)}
                    disabled={!selectedProductId}
                    aria-label="Select Recipe"
                    className="h-9 w-full appearance-none rounded border border-[#CBD5E1] bg-white px-3 py-1.5 pr-8 text-xs text-[#1E293B] disabled:bg-[#F1F5F9] disabled:text-[#94A3B8] focus:border-primary focus:outline-none"
                  >
                    <option value="">
                      {!selectedProductId
                        ? "Select product first..."
                        : filteredRecipes.length === 0
                          ? "No recipes for product"
                          : "Select Recipe..."}
                    </option>
                    {filteredRecipes.map((r) => (
                      <option key={r.recipeId} value={r.recipeId}>
                        {r.recipeName} ({r.recipeCode || r.recipeId})
                      </option>
                    ))}
                  </select>
                  <CaretDown
                    size={14}
                    className="pointer-events-none absolute right-2.5 top-2.5 text-[#94A3B8]"
                  />
                </div>
              </div>

              {/* Step 3: Associated Batch Size (filtered by recipe) */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1E293B]">
                  3. Batch Size <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedBatchSize}
                    onChange={(e) => handleBatchSizeChange(e.target.value)}
                    disabled={!selectedRecipeId}
                    aria-label="Select Batch Size"
                    className="h-9 w-full appearance-none rounded border border-[#CBD5E1] bg-white px-3 py-1.5 pr-8 text-xs text-[#1E293B] disabled:bg-[#F1F5F9] disabled:text-[#94A3B8] focus:border-primary focus:outline-none"
                  >
                    <option value="">
                      {!selectedRecipeId
                        ? "Select recipe first..."
                        : associatedBatchSizes.length === 0
                          ? "No associated batch sizes"
                          : "Select Batch Size..."}
                    </option>
                    {associatedBatchSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                  <CaretDown
                    size={14}
                    className="pointer-events-none absolute right-2.5 top-2.5 text-[#94A3B8]"
                  />
                </div>
              </div>

              {/* Step 4: Equipment */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1E293B]">
                  4. Equipment <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedEquipmentId}
                    onChange={(e) => handleEquipmentChange(e.target.value)}
                    disabled={!selectedBatchSize}
                    aria-label="Select Equipment"
                    className="h-9 w-full appearance-none rounded border border-[#CBD5E1] bg-white px-3 py-1.5 pr-8 text-xs text-[#1E293B] disabled:bg-[#F1F5F9] disabled:text-[#94A3B8] focus:border-primary focus:outline-none"
                  >
                    <option value="">
                      {!selectedBatchSize
                        ? "Select batch size first..."
                        : "Select Equipment..."}
                    </option>
                    {equipments.map((eq) => (
                      <option key={eq.equipmentId} value={eq.equipmentId}>
                        {eq.equipmentName} ({eq.equipmentCode || eq.equipmentId})
                      </option>
                    ))}
                  </select>
                  <CaretDown
                    size={14}
                    className="pointer-events-none absolute right-2.5 top-2.5 text-[#94A3B8]"
                  />
                </div>
              </div>
            </div>

            {/* Contextual warning / helper banners */}
            {selectedProductId && filteredRecipes.length === 0 && (
              <div className="mt-4 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="flex items-center gap-2">
                  <WarningCircle size={16} weight="fill" className="text-amber-600" />
                  <span>No recipes configured for the selected product.</span>
                </div>
                <Button onClick={onOpenRecipeMaster} className="h-7 text-[11px]">
                  + Create Recipe
                </Button>
              </div>
            )}

            {selectedRecipeId && associatedBatchSizes.length === 0 && currentRecipe && (
              <div className="mt-4 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="flex items-center gap-2">
                  <WarningCircle size={16} weight="fill" className="text-amber-600" />
                  <span>Recipe has no associated batch sizes.</span>
                </div>
                <Button
                  onClick={() => onOpenBatchSizeAssociation(currentRecipe)}
                  className="h-7 text-[11px]"
                >
                  Associate Batch Size
                </Button>
              </div>
            )}
          </div>

          {/* Feedback Banner */}
          {saveStatus && (
            <div
              className={`flex items-center gap-2 rounded-md p-3 text-xs ${
                saveStatus.type === "success"
                  ? "border border-green-200 bg-green-50 text-green-800"
                  : "border border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {saveStatus.type === "success" ? (
                <CheckCircle size={16} weight="fill" className="text-green-600" />
              ) : (
                <WarningCircle size={16} weight="fill" className="text-red-600" />
              )}
              <span>{saveStatus.message}</span>
            </div>
          )}

          {/* Step 5: Parameters Table */}
          {selectedEquipmentId && (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">
                    Recipe Parameters Configuration
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    Critical Parameters loaded for equipment{" "}
                    <span className="font-semibold text-[#1E293B]">{selectedEquipmentId}</span>.
                    Assign Target Setpoint, Low Limit, and High Limit.
                  </p>
                </div>

                {hasConfigurableParameters && (
                  <Button
                    onClick={handleSaveConfiguration}
                    disabled={isSaving || hasValidationErrors}
                    className="h-9 px-4 text-xs font-medium"
                    prefixIcon={<FloppyDisk size={14} weight="bold" />}
                  >
                    {isSaving ? "Saving..." : "Save Configuration"}
                  </Button>
                )}
              </div>

              {!hasConfigurableParameters ? (
                <div className="rounded-md border border-dashed border-[#CBD5E1] p-8 text-center text-xs text-[#64748B]">
                  No Critical Parameters found for equipment {selectedEquipmentId}.
                  <p className="mt-1 text-[11px] text-[#94A3B8]">
                    Configure Critical Parameters under the Critical Parameters tab first.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-[#E2E8F0]">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] font-semibold text-[#475569]">
                      <tr>
                        <th className="px-3 py-2.5">S No.</th>
                        <th className="px-3 py-2.5">Parameter Name</th>
                        <th className="px-3 py-2.5">Parameter Code</th>
                        <th className="px-3 py-2.5">UOM</th>
                        <th className="px-3 py-2.5 w-32">Target Setpoint</th>
                        <th className="px-3 py-2.5 w-32">Low Limit</th>
                        <th className="px-3 py-2.5 w-32">High Limit</th>
                        <th className="px-3 py-2.5">Validation / Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {parameterRows.map((row, idx) => (
                        <tr
                          key={row.parameterCode}
                          className={row.error ? "bg-red-50/40" : "hover:bg-[#F8FAFC]"}
                        >
                          <td className="px-3 py-2 text-[#64748B]">{idx + 1}</td>
                          <td className="px-3 py-2 font-medium text-[#1E293B]">
                            {row.parameterName}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-[#475569]">
                            {row.parameterCode}
                          </td>
                          <td className="px-3 py-2 text-[#64748B]">
                            {row.unitOfMeasure || "-"}
                          </td>
                          <td className="px-3 py-2">
                            <TextField
                              type="number"
                              step="any"
                              placeholder="Target"
                              value={row.targetSetpoint}
                              onChange={(e) =>
                                handleParameterChange(idx, "targetSetpoint", e.target.value)
                              }
                              className={`h-8 w-28 text-xs ${
                                row.error ? "border-red-500 focus:border-red-500" : ""
                              }`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <TextField
                              type="number"
                              step="any"
                              placeholder="Low"
                              value={row.lowLimit}
                              onChange={(e) =>
                                handleParameterChange(idx, "lowLimit", e.target.value)
                              }
                              className={`h-8 w-28 text-xs ${
                                row.error ? "border-red-500 focus:border-red-500" : ""
                              }`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <TextField
                              type="number"
                              step="any"
                              placeholder="High"
                              value={row.highLimit}
                              onChange={(e) =>
                                handleParameterChange(idx, "highLimit", e.target.value)
                              }
                              className={`h-8 w-28 text-xs ${
                                row.error ? "border-red-500 focus:border-red-500" : ""
                              }`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            {row.error ? (
                              <span className="flex items-center gap-1 font-medium text-red-600">
                                <WarningCircle size={14} weight="fill" /> {row.error}
                              </span>
                            ) : row.targetSetpoint !== "" &&
                              row.lowLimit !== "" &&
                              row.highLimit !== "" ? (
                              <span className="inline-flex items-center gap-1 font-medium text-green-700">
                                <CheckCircle size={14} weight="fill" className="text-green-600" />
                                Valid
                              </span>
                            ) : (
                              <span className="text-[11px] text-[#94A3B8]">
                                Not fully assigned
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {hasConfigurableParameters && (
                <div className="mt-4 flex items-center justify-between border-t border-[#E2E8F0] pt-3 text-xs">
                  <span className="text-[#64748B]">
                    Validation rule: <code className="font-mono">Low Limit ≤ Target Setpoint ≤ High Limit</code>
                  </span>
                  <Button
                    onClick={handleSaveConfiguration}
                    disabled={isSaving || hasValidationErrors}
                    className="h-9 px-4 text-xs font-medium"
                    prefixIcon={<FloppyDisk size={14} weight="bold" />}
                  >
                    {isSaving ? "Saving..." : "Save Configuration"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Empty Selection State Guidance */}
          {!selectedEquipmentId && (
            <div className="rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-8 text-center text-xs text-[#64748B]">
              <h4 className="text-sm font-semibold text-[#334155]">
                Complete Cascading Selection to View Parameters
              </h4>
              <p className="mt-1 text-xs text-[#64748B]">
                Select Product → Recipe → Associated Batch Size → Equipment to dynamically load
                Critical Parameters and configure Target Setpoint, Low Limit, and High Limit.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* View All Persisted Configurations Table */
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">
                Persisted Recipe Configurations ({filteredPersistedRecords.length})
              </h3>
              <p className="text-xs text-[#64748B]">
                Effective parameters configured across Product, Recipe, Batch Size, and Equipment.
              </p>
            </div>

            <div className="w-full sm:w-64">
              <TextField
                type="text"
                placeholder="Search configurations..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="w-full text-xs"
              />
            </div>
          </div>

          {filteredPersistedRecords.length === 0 ? (
            <div className="rounded-md border border-dashed border-[#CBD5E1] p-8 text-center text-xs text-[#64748B]">
              No persisted configurations found.
              <p className="mt-1 text-[11px] text-[#94A3B8]">
                Switch to "Configure Parameters" above to assign parameter limits for a Recipe and Batch Size.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-[#E2E8F0]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] font-semibold text-[#475569]">
                  <tr>
                    <th className="px-3 py-2.5">S No.</th>
                    <th className="px-3 py-2.5">Product</th>
                    <th className="px-3 py-2.5">Recipe</th>
                    <th className="px-3 py-2.5">Batch Size</th>
                    <th className="px-3 py-2.5">Equipment</th>
                    <th className="px-3 py-2.5">Parameter</th>
                    <th className="px-3 py-2.5">Target</th>
                    <th className="px-3 py-2.5">Low</th>
                    <th className="px-3 py-2.5">High</th>
                    <th className="px-3 py-2.5">Limit Range</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredPersistedRecords.map((r, idx) => (
                    <tr key={r.recipeManagementId || idx} className="hover:bg-[#F8FAFC]">
                      <td className="px-3 py-2 text-[#64748B]">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-[#1E293B]">
                        {r.productName || r.productCode || r.productId}
                      </td>
                      <td className="px-3 py-2">
                        {r.recipeName || r.recipeCode || r.recipeId}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex rounded bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                          {r.batchSize}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[#334155]">
                        {r.equipmentName || r.equipmentCode || r.equipmentId}
                      </td>
                      <td className="px-3 py-2 font-medium text-[#0F172A]">
                        {r.parameterName || r.parameterCode}
                      </td>
                      <td className="px-3 py-2 font-semibold text-primary">
                        {r.targetSetpoint !== undefined ? r.targetSetpoint : "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {r.lowLimit !== undefined ? r.lowLimit : "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {r.highLimit !== undefined ? r.highLimit : "-"}
                      </td>
                      <td className="px-3 py-2 text-[#64748B]">
                        {r.lowLimit} - {r.highLimit} ({r.targetSetpoint})
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            r.isActive !== false
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {r.isActive !== false ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

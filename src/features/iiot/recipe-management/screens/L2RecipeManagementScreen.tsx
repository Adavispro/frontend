"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Cpu,
  MagnifyingGlass,
  ArrowClockwise,
  UploadSimple,
  CheckCircle,
  Sliders,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button, ConfirmDialog, Snackbar } from "@/components/ui";
import {
  getRecipeMasters,
  getRecipeManagements,
  uploadRecipeToHmi,
  type RecipeMaster,
  type RecipeManagement,
} from "@/features/master-management/iiot-master/api";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";

export default function L2RecipeManagementScreen() {
  const user = useCurrentUser();
  const [recipes, setRecipes] = useState<RecipeMaster[]>([]);
  const [limits, setLimits] = useState<RecipeManagement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  // Upload modal state
  const [uploadTarget, setUploadTarget] = useState<RecipeMaster | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: "success" | "error";
  }>({
    open: false,
    title: "",
    message: "",
    variant: "success",
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [recipeList, limitList] = await Promise.all([
        getRecipeMasters(),
        getRecipeManagements(),
      ]);
      setRecipes(recipeList);
      setLimits(limitList);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load recipe data.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeRecipes = useMemo(
    () => recipes.filter((r) => r.isActive),
    [recipes],
  );

  const filteredLimits = useMemo(() => {
    return limits.filter((item) => {
      if (selectedRecipeId !== "ALL" && item.recipeId !== selectedRecipeId) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches =
          (item.productName ?? "").toLowerCase().includes(q) ||
          (item.recipeName ?? "").toLowerCase().includes(q) ||
          (item.parameterCode ?? "").toLowerCase().includes(q) ||
          (item.equipmentId ?? "").toLowerCase().includes(q) ||
          (item.batchSize ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [limits, selectedRecipeId, search]);

  const handleUploadClick = (recipe: RecipeMaster) => {
    setUploadTarget(recipe);
  };

  const handleConfirmUpload = async () => {
    if (!uploadTarget) return;
    setIsUploading(true);
    try {
      const result = await uploadRecipeToHmi({
        tenantId: uploadTarget.tenantId || (user?.tenantId ?? undefined),
        plantId: uploadTarget.plantId || undefined,
        recipeId: uploadTarget.recipeId,
      });

      const message =
        typeof result === "object" && result && "message" in result
          ? String((result as { message: unknown }).message)
          : `Recipe ${uploadTarget.recipeName || uploadTarget.recipeCode} dispatched to HMI successfully.`;

      setToast({
        open: true,
        title: "HMI Dispatch Acknowledged",
        message,
        variant: "success",
      });
      setUploadTarget(null);
    } catch (err) {
      setToast({
        open: true,
        title: "Upload to HMI Failed",
        message:
          err instanceof Error
            ? err.message
            : "Failed to dispatch recipe to HMI controller.",
        variant: "error",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.recipeId === selectedRecipeId),
    [recipes, selectedRecipeId],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner & Recipe Selector */}
      <div className="module-glass-panel flex flex-wrap items-center justify-between gap-4 rounded-xl p-5 shadow-[0_12px_24px_rgba(35,50,70,0.08)]">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Sliders size={22} weight="bold" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-text-heading">
              L2 Recipe Management
            </h1>
            <p className="text-xs text-text-secondary">
              Read-only view of plant recipes and active recipe parameter limits for HMI synchronization.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Recipe Select Dropdown */}
          <div className="relative">
            <select
              value={selectedRecipeId}
              onChange={(e) => setSelectedRecipeId(e.target.value)}
              className="h-9 rounded-md border border-[#BFD0E4] bg-white px-3 pr-8 text-xs font-medium text-text-heading outline-none focus:border-primary"
            >
              <option value="ALL">All Recipes ({activeRecipes.length})</option>
              {activeRecipes.map((r) => (
                <option key={r.recipeId} value={r.recipeId}>
                  {r.recipeName} ({r.recipeCode})
                </option>
              ))}
            </select>
          </div>

          {/* Upload to HMI Button for Selected Recipe */}
          {selectedRecipe && (
            <Button
              type="button"
              size="sm"
              prefixIcon={<UploadSimple size={14} weight="bold" />}
              onClick={() => handleUploadClick(selectedRecipe)}
              className="h-9 shadow-[0_8px_18px_rgba(7,92,175,0.18)]"
            >
              Upload to HMI
            </Button>
          )}

          <button
            type="button"
            onClick={loadData}
            title="Refresh"
            className="grid h-9 w-9 place-items-center rounded-md border border-[#BFD0E4] bg-white text-text-secondary hover:text-primary transition-colors"
          >
            <ArrowClockwise size={15} />
          </button>
        </div>
      </div>

      {/* Recipe Info Card if single recipe selected */}
      {selectedRecipe && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-text-secondary font-medium block">Recipe Name:</span>
              <span className="text-text-heading font-semibold">{selectedRecipe.recipeName}</span>
            </div>
            <div>
              <span className="text-text-secondary font-medium block">Recipe Code:</span>
              <span className="text-text-heading font-mono">{selectedRecipe.recipeCode}</span>
            </div>
            <div>
              <span className="text-text-secondary font-medium block">Version:</span>
              <span className="text-text-heading">{selectedRecipe.version || "1.0"}</span>
            </div>
            <div>
              <span className="text-text-secondary font-medium block">Associated Batch Sizes:</span>
              <span className="text-text-heading font-medium">
                {Array.isArray(selectedRecipe.associatedBatchSizes)
                  ? selectedRecipe.associatedBatchSizes.join(", ")
                  : String(selectedRecipe.associatedBatchSizes ?? "-")}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">
              <CheckCircle size={13} weight="fill" />
              Active in Master
            </span>
          </div>
        </div>
      )}

      {/* Parameter Limits Table */}
      <div className="module-glass-panel rounded-xl overflow-hidden shadow-[0_12px_24px_rgba(35,50,70,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E3E9F0] px-5 py-4">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-text-heading">
              Effective Parameter Limits ({filteredLimits.length})
            </h2>
          </div>

          <div className="relative">
            <MagnifyingGlass
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            />
            <input
              type="search"
              placeholder="Search parameters, equipment, size..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-64 rounded-md border border-[#BFD0E4] bg-white pl-9 pr-3 text-xs outline-none focus:border-primary"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-xs text-text-secondary">
            Loading recipe management data...
          </div>
        ) : error ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-xs text-danger">
            <WarningCircle size={24} />
            <span>{error}</span>
          </div>
        ) : filteredLimits.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-xs text-text-secondary">
            No recipe parameters configured. Configure recipes in Master &gt; Recipe Management.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E3E9F0] bg-[#F7F9FC] text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                <tr>
                  <th className="px-4 py-3">S No.</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Recipe</th>
                  <th className="px-4 py-3">Batch Size</th>
                  <th className="px-4 py-3">Equipment</th>
                  <th className="px-4 py-3">Parameter Code</th>
                  <th className="px-4 py-3 text-right">Target Setpoint</th>
                  <th className="px-4 py-3 text-right">Low Limit</th>
                  <th className="px-4 py-3 text-right">High Limit</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E9F0]">
                {filteredLimits.map((item, idx) => (
                  <tr
                    key={item.recipeManagementId || `${item.recipeId}-${item.equipmentId}-${item.parameterCode}-${idx}`}
                    className="hover:bg-primary/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-text-secondary">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-text-heading">
                      {item.productName || item.productCode || item.productId}
                    </td>
                    <td className="px-4 py-3 text-text-heading">
                      {item.recipeName || item.recipeCode || item.recipeId}
                    </td>
                    <td className="px-4 py-3 font-semibold text-primary">
                      {item.batchSize}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-heading">
                      {item.equipmentName || item.equipmentId}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-text-heading">
                      {item.parameterCode}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-text-heading">
                      {item.targetSetpoint}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-warning">
                      {item.lowLimit}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-danger">
                      {item.highLimit}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          item.isActive
                            ? "bg-[#DDF6DF] text-[#158047]"
                            : "bg-[#EBEEF2] text-text-secondary"
                        }`}
                      >
                        {item.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Dialog for HMI Upload */}
      <ConfirmDialog
        isOpen={Boolean(uploadTarget)}
        title="Upload Recipe to HMI"
        message={`Are you sure you want to upload recipe "${uploadTarget?.recipeName}" (${uploadTarget?.recipeCode}) to the HMI controller? This will synchronize all effective parameter limits and log an audit event.`}
        confirmLabel="Upload to HMI"
        isConfirming={isUploading}
        onConfirm={handleConfirmUpload}
        onCancel={() => setUploadTarget(null)}
      />

      {/* Notification Toast */}
      <Snackbar
        open={toast.open}
        title={toast.title}
        message={toast.message}
        variant={toast.variant}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />
    </div>
  );
}

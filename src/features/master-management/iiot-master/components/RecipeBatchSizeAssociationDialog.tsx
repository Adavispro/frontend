"use client";

import { useState } from "react";
import { Plus, Trash, CheckCircle, WarningCircle, ArrowRight } from "@phosphor-icons/react";
import { Button, Dialog, TextField } from "@/components/ui";
import { addRecipeBatchSize, removeRecipeBatchSize } from "../api";
import type { RecipeMaster } from "../api";

export interface RecipeBatchSizeAssociationDialogProps {
  isOpen: boolean;
  recipe: RecipeMaster | null;
  onClose: () => void;
  onUpdated: (updatedRecipe: RecipeMaster) => void;
  onNavigateToConfigure?: (recipe: RecipeMaster, batchSize?: string) => void;
}

export default function RecipeBatchSizeAssociationDialog({
  isOpen,
  recipe,
  onClose,
  onUpdated,
  onNavigateToConfigure,
}: RecipeBatchSizeAssociationDialogProps) {
  const [batchValue, setBatchValue] = useState("");
  const [batchUnit, setBatchUnit] = useState("KG");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  if (!isOpen || !recipe) return null;

  const batchSizes: string[] = Array.isArray(recipe.associatedBatchSizes)
    ? recipe.associatedBatchSizes
    : typeof recipe.associatedBatchSizes === "string"
      ? (recipe.associatedBatchSizes as string).split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  const handleAddBatchSize = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const trimmedVal = batchValue.trim();
    if (!trimmedVal) {
      setFeedback({ type: "error", message: "Please enter a valid batch size number." });
      return;
    }

    const num = parseFloat(trimmedVal);
    if (isNaN(num) || num <= 0) {
      setFeedback({ type: "error", message: "Batch size must be a positive number." });
      return;
    }

    const formattedVal = Number.isInteger(num) ? num.toString() : num.toFixed(2);
    const candidate = `${formattedVal} ${batchUnit.toUpperCase()}`;

    // Check duplicate locally first
    const isDuplicate = batchSizes.some(
      (b) => b.trim().toUpperCase() === candidate.trim().toUpperCase(),
    );
    if (isDuplicate) {
      setFeedback({
        type: "error",
        message: `Batch size ${candidate} is already associated with this recipe.`,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await addRecipeBatchSize(recipe.recipeId, candidate);
      onUpdated(updated);
      setBatchValue("");
      setFeedback({
        type: "success",
        message: `Batch size ${candidate} successfully associated!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to associate batch size.";
      setFeedback({ type: "error", message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveBatchSize = async (batchSizeToRemove: string) => {
    setFeedback(null);
    setIsSubmitting(true);
    try {
      const updated = await removeRecipeBatchSize(recipe.recipeId, batchSizeToRemove);
      onUpdated(updated);
      setFeedback({
        type: "success",
        message: `Batch size ${batchSizeToRemove} removed.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove batch size.";
      setFeedback({ type: "error", message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Recipe Batch Size Association"
      onClose={onClose}
      widthClassName="max-w-[680px]"
    >
      <div className="space-y-6 p-6">
        {/* Recipe Summary Header */}
        <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-xs">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <span className="block text-[#64748B]">Recipe ID</span>
              <span className="font-semibold text-[#0F172A]">{recipe.recipeId}</span>
            </div>
            <div>
              <span className="block text-[#64748B]">Recipe Code</span>
              <span className="font-semibold text-[#0F172A]">{recipe.recipeCode}</span>
            </div>
            <div>
              <span className="block text-[#64748B]">Product</span>
              <span className="font-semibold text-[#0F172A]">
                {recipe.productName || recipe.productCode || recipe.productId}
              </span>
            </div>
            <div>
              <span className="block text-[#64748B]">Version</span>
              <span className="font-semibold text-[#0F172A]">{recipe.version || "1.0"}</span>
            </div>
          </div>
          <div className="mt-2 border-t border-[#E2E8F0] pt-2">
            <span className="block text-[#64748B]">Recipe Name</span>
            <span className="font-medium text-[#1E293B]">{recipe.recipeName}</span>
          </div>
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-md p-3 text-xs ${
              feedback.type === "success"
                ? "border border-green-200 bg-green-50 text-green-800"
                : "border border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle size={16} weight="fill" className="text-green-600" />
            ) : (
              <WarningCircle size={16} weight="fill" className="text-red-600" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Current Associated Batch Sizes List */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#1E293B]">
              Associated Batch Sizes ({batchSizes.length})
            </h3>
            <span className="text-[11px] text-[#64748B]">
              Recipe ID ↔ Batch Size canonical associations
            </span>
          </div>

          {batchSizes.length === 0 ? (
            <div className="rounded-md border border-dashed border-[#CBD5E1] p-6 text-center text-xs text-[#64748B]">
              No batch sizes currently associated with this recipe.
              <p className="mt-1 text-[11px] text-[#94A3B8]">
                Add a batch size below to enable Recipe Management parameter configuration.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-[#E2E8F0]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E2E8F0] bg-[#F1F5F9] font-medium text-[#475569]">
                  <tr>
                    <th className="px-3 py-2">S No.</th>
                    <th className="px-3 py-2">Batch Size</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {batchSizes.map((size, idx) => (
                    <tr key={size} className="hover:bg-[#F8FAFC]">
                      <td className="px-3 py-2 text-[#64748B]">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center rounded bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                          {size}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {onNavigateToConfigure && (
                            <button
                              type="button"
                              onClick={() => {
                                onNavigateToConfigure(recipe, size);
                                onClose();
                              }}
                              className="inline-flex items-center gap-1 rounded border border-[#CBD5E1] bg-white px-2 py-1 text-[11px] font-medium text-[#334155] shadow-sm hover:bg-[#F8FAFC]"
                              title="Configure parameters in Recipe Management"
                            >
                              Configure <ArrowRight size={12} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveBatchSize(size)}
                            disabled={isSubmitting}
                            className="rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700"
                            title="Remove association"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Batch Size Form */}
        <form onSubmit={handleAddBatchSize} className="rounded-lg border border-[#E2E8F0] bg-white p-4">
          <h4 className="mb-3 text-xs font-semibold text-[#1E293B] flex items-center gap-1">
            <Plus size={14} weight="bold" className="text-primary" /> Add Batch Size
          </h4>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium text-[#475569]">
                Batch Quantity
              </label>
              <TextField
                type="number"
                step="any"
                min="0.01"
                placeholder="e.g. 1000"
                value={batchValue}
                onChange={(e) => setBatchValue(e.target.value)}
                disabled={isSubmitting}
                className="w-full text-xs"
              />
            </div>
            <div className="w-28">
              <label className="mb-1 block text-[11px] font-medium text-[#475569]">
                Unit
              </label>
              <select
                value={batchUnit}
                onChange={(e) => setBatchUnit(e.target.value)}
                disabled={isSubmitting}
                aria-label="Batch Size Unit"
                className="h-9 w-full rounded border border-[#CBD5E1] bg-white px-2 py-1 text-xs text-[#1E293B] focus:border-primary focus:outline-none"
              >
                <option value="KG">KG</option>
                <option value="G">G</option>
                <option value="MG">MG</option>
                <option value="L">L</option>
                <option value="ML">ML</option>
                <option value="BATCH">BATCH</option>
              </select>
            </div>
            <Button
              type="submit"
              disabled={isSubmitting || !batchValue.trim()}
              className="h-9 px-4 text-xs font-medium"
            >
              {isSubmitting ? "Adding..." : "+ Add Batch Size"}
            </Button>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-4">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            Close
          </Button>

          {onNavigateToConfigure && batchSizes.length > 0 && (
            <Button
              onClick={() => {
                onNavigateToConfigure(recipe, batchSizes[0]);
                onClose();
              }}
              className="gap-2 text-xs"
            >
              Configure Recipe Parameters <ArrowRight size={14} />
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

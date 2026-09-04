"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, X } from "@phosphor-icons/react";
import { Button, TextField } from "@/components/ui";

export interface TopologyEsignModalProps {
  isOpen: boolean;
  title: string;
  actionLabel?: string;
  description?: string;
  isSubmitting?: boolean;
  errorMessage?: string;
  onConfirm: (auth: { remarks: string; password: string }) => void | Promise<void>;
  onClose: () => void;
}

export default function TopologyEsignModal({
  isOpen,
  title,
  actionLabel = "Sign & Confirm",
  description = "This action requires 21 CFR Part 11 electronic signature authentication. Please provide valid remarks and your signature password.",
  isSubmitting = false,
  errorMessage = "",
  onConfirm,
  onClose,
}: TopologyEsignModalProps) {
  const [remarks, setRemarks] = useState("");
  const [password, setPassword] = useState("");
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setRemarks("");
      setPassword("");
      setValidationError("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!remarks.trim()) {
      setValidationError("Remarks are mandatory for this controlled action.");
      return;
    }
    if (remarks.trim().length > 500) {
      setValidationError("Remarks cannot exceed 500 characters.");
      return;
    }
    if (!password) {
      setValidationError("Electronic signature password is required.");
      return;
    }
    setValidationError("");
    onConfirm({ remarks: remarks.trim(), password });
  };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-[#15304f]/40 px-5 backdrop-blur-[2px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="esign-modal-title"
        className="w-full max-w-[480px] overflow-hidden rounded-xl border border-white/80 bg-white shadow-[0_24px_70px_rgba(20,43,70,0.25)]"
      >
        <div className="flex items-center justify-between border-b border-[#E6E6E6] bg-[#F7F9FC] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary">
              <ShieldCheck size={18} weight="bold" />
            </span>
            <div>
              <h2 id="esign-modal-title" className="text-[13px] font-semibold text-text-heading">
                {title}
              </h2>
              <span className="text-[9px] font-medium tracking-wide text-primary">
                21 CFR PART 11 COMPLIANT
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close e-signature modal"
            onClick={onClose}
            disabled={isSubmitting}
            className="grid h-6 w-6 place-items-center rounded-full border border-[#C7D1DE] text-text-secondary transition-colors hover:bg-white hover:text-primary disabled:opacity-50"
          >
            <X size={12} weight="bold" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          <p className="mb-4 text-[10px] leading-4 text-text-secondary">
            {description}
          </p>

          {(validationError || errorMessage) && (
            <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-[10px] text-danger">
              {validationError || errorMessage}
            </div>
          )}

          <div className="space-y-4">
            <label className="grid gap-1.5">
              <span className="text-[10px] font-medium text-text-heading">
                Remarks / Reason for Change <span className="text-danger">*</span>
              </span>
              <textarea
                value={remarks}
                onChange={(e) => {
                  setRemarks(e.target.value);
                  if (validationError) setValidationError("");
                }}
                disabled={isSubmitting}
                maxLength={500}
                rows={3}
                placeholder="Enter mandatory reason or remarks..."
                className="w-full rounded-[4px] border border-[#CBD5E1] bg-white p-2.5 text-[11px] text-text-heading outline-none transition-colors focus:border-primary placeholder:text-text-secondary/70 disabled:bg-neutral-100"
              />
              <span className="text-right text-[9px] text-text-secondary">
                {remarks.length}/500
              </span>
            </label>

            <label className="grid gap-1.5">
              <span className="text-[10px] font-medium text-text-heading">
                Signature Password <span className="text-danger">*</span>
              </span>
              <TextField
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (validationError) setValidationError("");
                }}
                disabled={isSubmitting}
                placeholder="Enter your account password"
                containerClassName="!rounded-[4px] !px-3 !py-2 border border-[#CBD5E1] bg-white"
                inputClassName="text-[11px] text-text-heading placeholder:text-text-secondary/70"
              />
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-2.5 border-t border-[#F0F2F5] pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              rounded="rounded-[4px]"
              textSize="text-[10px]"
              paddingX="px-4"
              className="h-8 border-[#CBD5E1] text-text-secondary hover:bg-neutral-50"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              rounded="rounded-[4px]"
              textSize="text-[10px]"
              paddingX="px-5"
              className="h-8 shadow-[0_4px_12px_rgba(7,92,175,0.2)]"
              isLoading={isSubmitting}
              disabled={!remarks.trim() || !password || isSubmitting}
            >
              {actionLabel}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

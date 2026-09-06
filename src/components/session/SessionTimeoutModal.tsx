"use client";

import React, { useEffect, useRef } from "react";
import { WarningCircle, CircleNotch } from "@phosphor-icons/react";

export interface SessionTimeoutModalProps {
  isOpen: boolean;
  remainingSeconds: number;
  isExpired?: boolean;
  isSubmitting?: boolean;
  onContinue: () => void;
  onLogout: () => void;
}

export default function SessionTimeoutModal({
  isOpen,
  remainingSeconds,
  isExpired = false,
  isSubmitting = false,
  onContinue,
  onLogout,
}: SessionTimeoutModalProps) {
  const continueButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus management & keyboard trap
  useEffect(() => {
    if (isOpen) {
      // Auto-focus primary CTA
      const timer = setTimeout(() => {
        continueButtonRef.current?.focus();
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          // Escape must NOT silently continue the session.
          // Treat Escape as explicit logout to protect unmonitored session.
          e.preventDefault();
          onLogout();
        }

        // Focus trap inside modal
        if (e.key === "Tab" && modalRef.current) {
          const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusableElements.length > 0) {
            const first = focusableElements[0];
            const last = focusableElements[focusableElements.length - 1];

            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen, onLogout]);

  if (!isOpen) {
    return null;
  }

  const formattedCountdown = `00:${String(Math.max(0, remainingSeconds)).padStart(2, "0")}`;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6 transition-opacity duration-200"
      aria-hidden={!isOpen}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
        aria-describedby="session-timeout-desc"
        className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 sm:p-7 text-center shadow-2xl border border-slate-200/90 transition-all duration-200"
      >
        {/* Warning Icon Badge */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 border border-amber-200">
          <WarningCircle className="h-8 w-8 text-amber-500" weight="fill" />
        </div>

        {/* Title */}
        <h2
          id="session-timeout-title"
          className="text-xl font-bold text-slate-900 tracking-tight"
        >
          Session timeout
        </h2>

        {/* Message */}
        <div id="session-timeout-desc" className="mt-2 text-sm text-slate-600 space-y-1">
          <p>Due to inactivity, your session is about to time out.</p>
          <p>Click &quot;Continue Session&quot; to stay signed in.</p>
        </div>

        {/* Countdown Box or Expired Notice */}
        <div className="mt-5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
          {isExpired ? (
            <div className="space-y-1 text-rose-600">
              <p className="font-semibold text-sm">Session expired due to inactivity.</p>
              <p className="text-xs text-rose-500">Please sign in again.</p>
            </div>
          ) : (
            <>
              <p className="text-xs font-medium text-slate-500">
                Otherwise, you will be signed out in:
              </p>
              <div
                className="my-2 font-mono text-3xl font-bold tracking-wider text-amber-600"
                aria-live="assertive"
                aria-atomic="true"
              >
                {formattedCountdown}
              </div>
              <p className="text-xs font-medium text-slate-600">
                Do you want to continue?
              </p>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
          <button
            type="button"
            onClick={onLogout}
            disabled={isSubmitting}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-60 cursor-pointer"
          >
            Log out
          </button>

          <button
            ref={continueButtonRef}
            type="button"
            onClick={onContinue}
            disabled={isSubmitting || isExpired}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <CircleNotch className="h-4 w-4 animate-spin text-white" />
                <span>Continuing...</span>
              </>
            ) : (
              <span>Continue session</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

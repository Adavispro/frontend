"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSessionInactivity } from "@/hooks/useSessionInactivity";
import SessionTimeoutModal from "./SessionTimeoutModal";
import { sessionInactivityManager } from "@/services/session/sessionInactivityManager";

export default function SessionInactivityController() {
  const pathname = usePathname();
  // Temporary rollout switch: inactivity/expiry enforcement remains active in the
  // manager, while only the interactive "Continue Session" warning is suppressed.
  // Set NEXT_PUBLIC_CONTINUE_SESSION_POPUP_ENABLED=true to restore the popup.
  const isContinueSessionPopupEnabled =
    process.env.NEXT_PUBLIC_CONTINUE_SESSION_POPUP_ENABLED === "true";

  const isPublicRoute =
    !pathname ||
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  useEffect(() => {
    if (isPublicRoute) {
      sessionInactivityManager.stop();
    } else {
      sessionInactivityManager.start();
    }
  }, [isPublicRoute]);

  const {
    isWarningOpen,
    remainingSeconds,
    isExpired,
    isSubmitting,
    continueSession,
    logoutNow,
  } = useSessionInactivity(!isPublicRoute);

  if (isPublicRoute || !isContinueSessionPopupEnabled || !isWarningOpen) {
    return null;
  }

  return (
    <SessionTimeoutModal
      isOpen={isWarningOpen}
      remainingSeconds={remainingSeconds}
      isExpired={isExpired}
      isSubmitting={isSubmitting}
      onContinue={continueSession}
      onLogout={logoutNow}
    />
  );
}

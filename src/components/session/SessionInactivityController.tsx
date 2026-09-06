"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSessionInactivity } from "@/hooks/useSessionInactivity";
import SessionTimeoutModal from "./SessionTimeoutModal";
import { sessionInactivityManager } from "@/services/session/sessionInactivityManager";

export default function SessionInactivityController() {
  const pathname = usePathname();

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

  if (isPublicRoute || !isWarningOpen) {
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

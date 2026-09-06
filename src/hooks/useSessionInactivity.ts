"use client";

import { useEffect, useState, useCallback } from "react";
import { sessionInactivityManager } from "@/services/session/sessionInactivityManager";
import type { SessionInactivityState } from "@/services/session/sessionTypes";

export function useSessionInactivity(autoStart: boolean = true) {
  const [state, setState] = useState<SessionInactivityState>(() =>
    sessionInactivityManager.getState()
  );

  useEffect(() => {
    if (autoStart) {
      sessionInactivityManager.start();
    }

    const unsubscribe = sessionInactivityManager.subscribe((newState) => {
      setState(newState);
    });

    return () => {
      unsubscribe();
    };
  }, [autoStart]);

  const continueSession = useCallback(async () => {
    return await sessionInactivityManager.continueSession();
  }, []);

  const logoutNow = useCallback(async () => {
    await sessionInactivityManager.logoutNow();
  }, []);

  return {
    ...state,
    continueSession,
    logoutNow,
  };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/api";
import { useLoginContext } from "@/features/auth/hooks/useCurrentUser";
import { getSystemAdminDashboardData } from "../api";
import type { SystemAdminDashboardData } from "../api";

export function useSystemAdminDashboard() {
  const loginContext = useLoginContext();
  const tenantId = loginContext?.tenantId || loginContext?.user?.tenantId;

  const [data, setData] = useState<SystemAdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchData = useCallback((activeTenantId?: string, signal?: AbortSignal) => {
    setIsLoading(true);
    setErrorMessage("");

    return getSystemAdminDashboardData(activeTenantId, signal)
      .then((dashboardData) => {
        if (!signal?.aborted) {
          setData(dashboardData);
          setErrorMessage("");
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!signal?.aborted) {
          setErrorMessage(
            error instanceof ApiError
              ? error.message
              : "Unable to load dashboard data. Please try again.",
          );
        }
      })
      .finally(() => {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    if (!loginContext) {
      setIsLoading(true);
      return;
    }

    const controller = new AbortController();
    void fetchData(tenantId || undefined, controller.signal);

    return () => {
      controller.abort();
    };
  }, [loginContext, tenantId, fetchData]);

  return {
    clearError: () => setErrorMessage(""),
    data,
    errorMessage,
    isLoading: isLoading || !loginContext,
    refetch: () => fetchData(tenantId || undefined),
    tenantId,
  };
}


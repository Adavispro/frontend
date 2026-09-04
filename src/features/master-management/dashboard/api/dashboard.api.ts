import { apiClient, requireApiData, withQuery } from "@/api";
import type { BackendApiResponse } from "@/api/types";
import type { AuditLog } from "../../audit-logs/api/types";
import { getAuditLogs } from "../../audit-logs/api";
import { getRoles } from "../../role-management/api";
import { getGroups } from "../../user-group-management/api";
import type {
  DashboardTrendPoint,
  DashboardUserTiles,
  RoleUserCount,
  SystemAdminDashboardData,
  TeamActivityItem,
} from "./types";

interface BackendSummaryResponse {
  userTiles: DashboardUserTiles;
  usersByRole: RoleUserCount[];
  teamActivity: TeamActivityItem[];
  recentUsers: any[];
}

interface BackendTrendResponse {
  mode: string;
  year: number;
  month?: number | null;
  quarter?: number | null;
  rangeStart: string;
  rangeEnd: string;
  weeks: Array<{
    weekStart: string;
    weekEnd: string;
    distinctUserCount: number;
    loginCount?: number;
    users: Array<{ userId: string; username: string }>;
  }>;
}

const formatWeekLabel = (startDateStr: string) => {
  try {
    const date = new Date(startDateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return startDateStr;
  }
};

const getCurrentQuarter = () => Math.floor(new Date().getMonth() / 3) + 1;
const getCurrentYear = () => new Date().getFullYear();

export const getDashboardSummaryFromBackend = async (
  tenantId?: string,
  signal?: AbortSignal,
): Promise<BackendSummaryResponse> => {
  const summaryPath = withQuery("/api/master-management/mdm/dashboard/summary", {
    tenantId: tenantId || undefined,
  });

  try {
    const result = await apiClient<BackendApiResponse<BackendSummaryResponse>>(
      summaryPath,
      { method: "GET", signal },
    );

    return requireApiData(result, "Unable to load dashboard summary.");
  } catch {
    // Graceful backward-compatible fallback for backends that only expose /user-tiles
    const userTilesPath = withQuery("/api/master-management/mdm/dashboard/user-tiles", {
      tenantId: tenantId || undefined,
    });

    const tilesResult = await apiClient<BackendApiResponse<DashboardUserTiles>>(
      userTilesPath,
      { method: "GET", signal },
    );

    const userTiles = requireApiData(tilesResult, "Unable to load dashboard summary.");

    return {
      userTiles,
      usersByRole: [],
      teamActivity: [],
      recentUsers: [],
    };
  }
};

export const getUserActivityTrendFromBackend = async (
  mode: "quarterly" | "monthly" = "quarterly",
  tenantId?: string,
  signal?: AbortSignal,
): Promise<DashboardTrendPoint[]> => {
  const year = getCurrentYear();
  const quarter = getCurrentQuarter();
  const month = new Date().getMonth() + 1;

  const path = withQuery("/api/audit/logs/activity-trend", {
    mode,
    quarter: mode === "quarterly" ? quarter : undefined,
    month: mode === "monthly" ? month : undefined,
    year,
    tenantId: tenantId || undefined,
  });

  const result = await apiClient<BackendApiResponse<BackendTrendResponse>>(
    path,
    { method: "GET", signal },
  );

  const data = requireApiData(result, "Unable to load activity trend.");

  return (data.weeks || []).map((w, index) => ({
    label: formatWeekLabel(w.weekStart) || `W${index + 1}`,
    value: w.loginCount ?? w.distinctUserCount,
    bucketStart: w.weekStart,
  }));
};

export const getSystemAdminDashboardData = async (
  tenantId?: string,
  signal?: AbortSignal,
): Promise<SystemAdminDashboardData> => {
  const [
    summaryResult,
    trendResult,
    auditResult,
    rolesResult,
    groupsResult,
  ] = await Promise.allSettled([
    getDashboardSummaryFromBackend(tenantId, signal),
    getUserActivityTrendFromBackend("quarterly", tenantId, signal),
    getAuditLogs({ page: 0, size: 5, tenantId: tenantId || undefined }, signal),
    getRoles(true, signal),
    getGroups(true, signal),
  ]);

  if (summaryResult.status === "rejected") {
    throw summaryResult.reason;
  }

  const summary = summaryResult.value;

  const loginActivityTrend =
    trendResult.status === "fulfilled" ? trendResult.value : [];

  const auditPage =
    auditResult.status === "fulfilled"
      ? auditResult.value
      : { content: [] as AuditLog[] };

  const activeRoles = rolesResult.status === "fulfilled" ? rolesResult.value : [];
  const activeGroups = groupsResult.status === "fulfilled" ? groupsResult.value : [];

  const userTiles = {
    ...summary.userTiles,
    configuredRolesCount:
      Number(summary.userTiles?.configuredRolesCount ?? 0) > 0
        ? Number(summary.userTiles.configuredRolesCount)
        : activeRoles.length,
    configuredGroupsCount:
      Number(summary.userTiles?.configuredGroupsCount ?? 0) > 0
        ? Number(summary.userTiles.configuredGroupsCount)
        : activeGroups.length,
  };

  const usersByRole = summary.usersByRole || [];
  const teamActivity = summary.teamActivity || [];
  const recentUsers = summary.recentUsers || [];
  const recentAuditLogs = auditPage.content.slice(0, 5);

  return {
    userTiles,
    usersByRole,
    teamActivity,
    loginActivityTrend,
    recentAuditLogs,
    recentUsers,
    groups: activeGroups,
    roles: activeRoles,
    users: [],
    userStats: {
      active: Number(userTiles.activeUsersCount ?? 0),
      idle: Number(userTiles.idleUsersCount ?? 0),
      total: Number(userTiles.totalUsersCount ?? 0),
    },
  };
};


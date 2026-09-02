import type { Group } from "../../user-group-management/api/types";
import type { Role } from "../../role-management/api/types";
import type { User } from "../../user-management/api/types";
import type { AuditLog } from "../../audit-logs/api/types";

export interface DashboardTrendPoint {
  label: string;
  value: number;
  bucketStart?: string;
}

export interface TeamActivityItem {
  groupId: string;
  label: string;
  value: number;
  total: number;
}

export interface DashboardUserTiles {
  tenantId?: string;
  totalUsersCount: number;
  activeUsersCount: number;
  idleUsersCount: number;
  totalOnlineUsersCount: number;
  configuredRolesCount: number;
  configuredGroupsCount: number;
  idleThresholdMinutes?: string;
  asOf?: string;
}

export interface RoleUserCount {
  roleId: string;
  roleCode?: string;
  label: string;
  value: number;
}

export interface SystemAdminDashboardData {
  userTiles: DashboardUserTiles;
  usersByRole: RoleUserCount[];
  teamActivity: TeamActivityItem[];
  loginActivityTrend: DashboardTrendPoint[];
  recentAuditLogs: AuditLog[];
  recentUsers: any[];
  groups: Group[];
  roles: Role[];
  users: User[];
  userStats: {
    active: number;
    idle: number;
    total: number;
  };
}


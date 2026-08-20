"use client";

import { useMemo } from "react";
import { useLoginContext } from "./useCurrentUser";

export interface PermissionCheckOptions {
  moduleId?: string;
  screenId?: string;
  featureId?: string;
  action?: string;
}

/**
 * Enterprise hook for evaluating dynamic effective user permissions.
 * Follows the canonical resolution:
 * User -> User Group -> Role -> Permissions -> Effective Authorities
 */
export function usePermissions() {
  const loginContext = useLoginContext();

  const effectivePermissions = useMemo(() => {
    if (!loginContext) return new Set<string>();

    const permissions = new Set<string>();
    const roles = loginContext.roles || [];
    const rolePermissions = loginContext.rolePermissions || {};

    // Check for super admin / IT admin
    const isAdmin = roles.some(
      (r) =>
        r.roleCode === "SUPER_ADMIN" ||
        r.roleCode === "PLATFORM_SUPER_ADMIN" ||
        r.roleCode === "IT_ADMIN",
    );

    if (isAdmin) {
      permissions.add("ADMIN");
      permissions.add("BATCH_READ");
      permissions.add("BATCH_ADMIN_OVERRIDE");
      permissions.add("MDM_ALL");
      permissions.add("AUDIT_READ");
      permissions.add("USER_ADMIN");
      permissions.add("ROLE_ADMIN");
      permissions.add("LICENSE_ADMIN");
    }

    // Traverse rolePermissions
    Object.values(rolePermissions).forEach((moduleList) => {
      if (!Array.isArray(moduleList)) return;
      moduleList.forEach((mod: any) => {
        const screens = mod.screens || [];
        screens.forEach((screen: any) => {
          const screenCode = screen.screenCode || screen.screenId;
          const actions = screen.actions || [];
          actions.forEach((act: string) => {
            permissions.add(`${screenCode}:${act}`);
            permissions.add(act);
          });

          const features = screen.features || [];
          features.forEach((feat: any) => {
            const featCode = feat.featureCode || feat.featureId;
            const featActions = feat.actions || [];
            featActions.forEach((act: string) => {
              permissions.add(`${featCode}:${act}`);
              permissions.add(`${featCode}`);
            });
          });
        });
      });
    });

    // Map known feature/screen codes to canonical permission tokens
    if (
      permissions.has("FEAT-IIOT-SEND-BATCH-FOR-APPROVAL") ||
      permissions.has("SCR-IIOT-PENDING-BATCHES:WRITE") ||
      permissions.has("SCR-IIOT-PENDING-BATCHES:REVIEW")
    ) {
      permissions.add("BATCH_SEND_FOR_REVIEW");
      permissions.add("BATCH_OPERATOR_REVIEW");
    }
    if (
      permissions.has("FEAT-IIOT-SEND-BATCH-FOR-APPROVAL") ||
      permissions.has("SCR-IIOT-PENDING-BATCHES:REVIEW")
    ) {
      permissions.add("BATCH_SEND_FOR_APPROVAL");
      permissions.add("BATCH_REVIEW");
    }
    if (
      permissions.has("FEAT-IIOT-APPROVE-OR-REJECT-BATCH") ||
      permissions.has("SCR-IIOT-APPROVED-BATCHES:APPROVE")
    ) {
      permissions.add("BATCH_APPROVE");
      permissions.add("BATCH_REJECT");
    }

    return permissions;
  }, [loginContext]);

  const hasPermission = (permissionCode: string): boolean => {
    if (!loginContext) return false;
    if (effectivePermissions.has("*")) return true;
    return effectivePermissions.has(permissionCode);
  };

  const hasAnyPermission = (permissionCodes: string[]): boolean => {
    return permissionCodes.some((code) => hasPermission(code));
  };

  const hasAllPermissions = (permissionCodes: string[]): boolean => {
    return permissionCodes.every((code) => hasPermission(code));
  };

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    effectivePermissions,
    roles: loginContext?.roles || [],
    groups: loginContext?.groups || [],
    isLoading: !loginContext,
  };
}

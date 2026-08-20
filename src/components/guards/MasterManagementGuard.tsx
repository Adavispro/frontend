"use client";

import { useLoginContext } from "@/features/auth/hooks/useCurrentUser";
import { usePermissions } from "@/features/auth/hooks/usePermissions";
import AccessDenied from "../ui/AccessDenied";
import type { ReactNode } from "react";

interface MasterManagementGuardProps {
  children: ReactNode;
}

const ADMIN_ROLE_CODES = new Set([
  "SUPER_ADMIN",
  "PLATFORM_SUPER_ADMIN",
  "PLATFORM_ADMIN",
  "SYSTEM_ADMIN",
  "IT_ADMIN",
  "ADMIN",
]);

export default function MasterManagementGuard({ children }: MasterManagementGuardProps) {
  const loginContext = useLoginContext();
  const { hasPermission } = usePermissions();

  if (!loginContext) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-xs font-medium text-gray-500">Checking authorization...</p>
        </div>
      </div>
    );
  }

  const userId = String(loginContext.user?.userId || "").toUpperCase();
  const roles = (loginContext.roles || []) as Array<Record<string, unknown>>;
  const isAdminUser =
    userId === "SUPER_ADMIN" ||
    roles.some((r) => {
      const code = typeof r?.roleCode === "string" ? r.roleCode.toUpperCase() : "";
      return ADMIN_ROLE_CODES.has(code);
    }) ||
    hasPermission("MDM_ALL") ||
    hasPermission("ADMIN") ||
    hasPermission("*");

  if (!isAdminUser) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}

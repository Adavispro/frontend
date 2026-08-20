import { ROUTES } from "@/config/routes";

export const ALLOWED_RETURN_ROUTES: readonly string[] = [
  ROUTES.iiotMyActions,
  ROUTES.iiotPendingReports,
  ROUTES.iiotDeferredBatches,
  ROUTES.iiotApprovedBatches,
  ROUTES.iiotEquipmentOverview,
  ROUTES.iiotMonitoring,
  ROUTES.iiotAnalytics,
  ROUTES.modules,
  ROUTES.masterManagement,
  ROUTES.masterTenants,
  ROUTES.masterPlantTopology,
  ROUTES.masterUsers,
  ROUTES.masterRoles,
  ROUTES.masterUserGroups,
  ROUTES.masterDepartments,
  ROUTES.masterLicenses,
  ROUTES.masterAssignments,
];

export const DEFAULT_BATCH_DETAILS_RETURN_ROUTE = ROUTES.iiotMyActions;

/**
 * Validates and safely resolves an internal returnTo route.
 * Rejects external URLs, protocol-relative links, and non-allowlisted routes.
 *
 * @param rawReturnTo - The candidate return route string from query parameters or state.
 * @param fallbackRoute - The safe fallback route if rawReturnTo is absent or invalid (defaults to My Actions).
 * @returns A safe, validated internal application route.
 */
export function getSafeReturnTo(
  rawReturnTo: string | null | undefined,
  fallbackRoute: string = DEFAULT_BATCH_DETAILS_RETURN_ROUTE,
): string {
  if (!rawReturnTo || typeof rawReturnTo !== "string") {
    return fallbackRoute;
  }

  const trimmed = rawReturnTo.trim();

  // Guard against protocol-relative (e.g. "//evil.com") or external schemes
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) {
    return fallbackRoute;
  }

  // Extract the path portion (excluding query string and fragment)
  const pathOnly = trimmed.split("?")[0].split("#")[0];

  const isAllowed = ALLOWED_RETURN_ROUTES.some((allowed) => allowed === pathOnly);
  if (isAllowed) {
    return trimmed;
  }

  return fallbackRoute;
}

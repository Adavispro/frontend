import type { AuditLogsResult } from "@/features/master-management/audit-logs/api";
import { auditActionQuerySchema } from "@/features/master-management/audit-logs/schemas";
import {
  API_ENDPOINTS,
  auditUnauthorizedResponse,
  auditValidationResponse,
  getAuditAccessToken,
  parseSearchParams,
  proxyAuditRequest,
} from "../../_utils";

export async function GET(request: Request) {
  const accessToken = await getAuditAccessToken();
  if (!accessToken) return auditUnauthorizedResponse();

  const parsedQuery = parseSearchParams(request, auditActionQuerySchema);
  if (!parsedQuery.success) {
    return auditValidationResponse(
      parsedQuery.error.issues[0]?.message ?? "Invalid audit action query.",
    );
  }

  if (parsedQuery.data.action.trim().toUpperCase() !== "LOGIN") {
    return auditValidationResponse("Only LOGIN action is supported for login activity trend.");
  }

  const { action: _action, ...query } = parsedQuery.data;

  return proxyAuditRequest<AuditLogsResult>(API_ENDPOINTS.audit.loginHistory, {
    accessToken,
    query,
  });
}
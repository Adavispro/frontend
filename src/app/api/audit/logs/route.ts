import type { AuditLogsResult } from "@/features/master-management/audit-logs/api";
import { auditListQuerySchema } from "@/features/master-management/audit-logs/schemas";
import {
  API_ENDPOINTS,
  auditUnauthorizedResponse,
  auditValidationResponse,
  getAuditAccessToken,
  parseSearchParams,
  proxyAuditRequest,
} from "../_utils";

export async function GET(request: Request) {
  const accessToken = await getAuditAccessToken();
  if (!accessToken) return auditUnauthorizedResponse();

  const parsedQuery = parseSearchParams(request, auditListQuerySchema);
  if (!parsedQuery.success) {
    return auditValidationResponse(
      parsedQuery.error.issues[0]?.message ?? "Invalid audit query.",
    );
  }

  return proxyAuditRequest<AuditLogsResult>(API_ENDPOINTS.audit.logs, {
    accessToken,
    query: parsedQuery.data,
  });
}

import type { AuditLogsResult } from "@/features/master-management/audit-logs/api";
import { auditTenantQuerySchema } from "@/features/master-management/audit-logs/schemas";
import {
  API_ENDPOINTS,
  auditUnauthorizedResponse,
  auditValidationResponse,
  getAuditAccessToken,
  parseSearchParams,
  proxyAuditRequest,
} from "../../../_utils";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const accessToken = await getAuditAccessToken();
  if (!accessToken) return auditUnauthorizedResponse();

  const parsedQuery = parseSearchParams(request, auditTenantQuerySchema);
  if (!parsedQuery.success) {
    return auditValidationResponse(
      parsedQuery.error.issues[0]?.message ?? "Invalid audit query.",
    );
  }

  const { tenantId } = await params;

  return proxyAuditRequest<AuditLogsResult>(API_ENDPOINTS.audit.byTenant(tenantId), {
    accessToken,
    query: parsedQuery.data,
  });
}

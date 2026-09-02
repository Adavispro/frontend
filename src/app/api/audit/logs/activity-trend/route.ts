import { NextResponse } from "next/server";
import {
  auditUnauthorizedResponse,
  getAuditAccessToken,
  proxyAuditRequest,
} from "../../_utils";

export async function GET(request: Request) {
  const accessToken = await getAuditAccessToken();
  if (!accessToken) {
    return auditUnauthorizedResponse();
  }

  const url = new URL(request.url);
  const searchParams = Object.fromEntries(url.searchParams.entries());

  return proxyAuditRequest("/api/v1/audit/user-activity-trend", {
    accessToken,
    query: searchParams,
  });
}

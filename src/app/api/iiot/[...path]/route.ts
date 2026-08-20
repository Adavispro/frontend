import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { serverApiClient } from "@/api/server-client";
import { SERVER_API_CONFIG } from "@/api/server-config";
import type { ApiMethod, BackendApiResponse } from "@/api/types";
import { SELECTED_PLANT_HEADER } from "@/utils/plantSelection";
import { AUTH_COOKIE_NAMES } from "@/features/auth/api/auth.server";

const allowedRoots = new Set([
  "critical-parameters",
  "critical-parameter-limits",
  "equipment-live-status",
  "reports",
  "source-mappings",
  "ingestion",
  "analytics",
  "workflow",
  "batch-reports",
]);

const errorResponse = (status: number, message: string, errorCode: string) =>
  NextResponse.json(
    {
      success: false,
      message,
      errorCode,
      timestamp: new Date().toISOString(),
    } satisfies BackendApiResponse<never>,
    { status },
  );

async function proxy(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
  method: ApiMethod,
) {
  const accessToken = (await cookies()).get(
    AUTH_COOKIE_NAMES.accessToken,
  )?.value;

  if (!accessToken) {
    return errorResponse(401, "Not authenticated.", "UNAUTHORIZED");
  }

  const { path } = await context.params;

  if (!path.length || !allowedRoots.has(path[0])) {
    return errorResponse(404, "Unknown IIOT resource.", "NOT_FOUND");
  }

  const requestUrl = new URL(request.url);
  const selectedPlantId = request.headers.get(SELECTED_PLANT_HEADER)?.trim();
  const upstreamPath = `/api/v1/iiot/${path.map(encodeURIComponent).join("/")}${requestUrl.search}`;

  // Handle direct binary PDF download
  const isPdfRequest = path[0] === "batch-reports" && path[path.length - 1] === "pdf";
  if (method === "GET" && isPdfRequest) {
    try {
      const upstreamRes = await fetch(`${SERVER_API_CONFIG.iiotServiceUrl}${upstreamPath}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/pdf, application/json",
          ...(selectedPlantId ? { [SELECTED_PLANT_HEADER]: selectedPlantId } : {}),
        },
        cache: "no-store",
      });

      const contentType = upstreamRes.headers.get("content-type") || "";
      if (contentType.includes("application/pdf")) {
        const disposition =
          upstreamRes.headers.get("content-disposition") ||
          `attachment; filename="Batch_Dossier_${path[1] || "Report"}.pdf"`;
        const buffer = await upstreamRes.arrayBuffer();
        return new NextResponse(buffer, {
          status: upstreamRes.status,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": disposition,
          },
        });
      }
    } catch (err) {
      console.error("PDF stream proxy failed", err);
      return errorResponse(503, "The IIOT PDF service is unavailable.", "IIOT_SERVICE_UNAVAILABLE");
    }
  }

  let body: unknown;

  if (method !== "GET" && method !== "DELETE") {
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
  }

  try {
    const { response, result } = await serverApiClient<unknown, unknown>(
      SERVER_API_CONFIG.iiotServiceUrl,
      upstreamPath,
      {
        method,
        body,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(selectedPlantId ? { [SELECTED_PLANT_HEADER]: selectedPlantId } : {}),
        },
      },
    );

    return NextResponse.json(result, { status: response.status });
  } catch {
    return errorResponse(
      503,
      "The IIOT service is unavailable.",
      "IIOT_SERVICE_UNAVAILABLE",
    );
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

export const GET = (request: Request, context: RouteContext) =>
  proxy(request, context, "GET");
export const POST = (request: Request, context: RouteContext) =>
  proxy(request, context, "POST");
export const PUT = (request: Request, context: RouteContext) =>
  proxy(request, context, "PUT");
export const PATCH = (request: Request, context: RouteContext) =>
  proxy(request, context, "PATCH");
export const DELETE = (request: Request, context: RouteContext) =>
  proxy(request, context, "DELETE");

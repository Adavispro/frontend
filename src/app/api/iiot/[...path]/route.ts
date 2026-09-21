import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { serverApiClient } from "@/api/server-client";
import { SERVER_API_CONFIG } from "@/api/server-config";
import type { ApiMethod, BackendApiResponse } from "@/api/types";
import { SELECTED_PLANT_HEADER } from "@/utils/plantSelection";
import { AUTH_COOKIE_NAMES } from "@/features/auth/api/auth.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const allowedRoots = new Set([
  "critical-parameters",
  "critical-parameter-limits",
  "equipment-live-status",
  "equipment-master",
  "reports",
  "source-mappings",
  "ingestion",
  "analytics",
  "workflow",
  "batch-reports",
  "topology",
  "live",
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

  // Handle direct binary PDF download & controlled print
  const isPdfRequest = path[0] === "batch-reports" && path[path.length - 1] === "pdf";
  const isPrintRequest = path[0] === "batch-reports" && path[path.length - 1] === "print";

  if ((method === "GET" && isPdfRequest) || (method === "POST" && isPrintRequest)) {
    try {
      let reqBody: string | undefined = undefined;
      if (method === "POST") {
        try {
          reqBody = JSON.stringify(await request.json());
        } catch {
          reqBody = undefined;
        }
      }

      const upstreamRes = await fetch(`${SERVER_API_CONFIG.iiotServiceUrl}${upstreamPath}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/pdf, application/json",
          ...(reqBody ? { "Content-Type": "application/json" } : {}),
          ...(selectedPlantId ? { [SELECTED_PLANT_HEADER]: selectedPlantId } : {}),
        },
        body: reqBody,
        cache: "no-store",
      });

      const contentType = upstreamRes.headers.get("content-type") || "";
      if (upstreamRes.ok && (contentType.includes("application/pdf") || contentType.includes("octet-stream"))) {
        const disposition =
          upstreamRes.headers.get("content-disposition") ||
          `attachment; filename="Batch_Dossier_${path[1] || "Report"}.pdf"`;
        const contentLength = upstreamRes.headers.get("content-length");
        const buffer = await upstreamRes.arrayBuffer();

        const responseHeaders: Record<string, string> = {
          "Content-Type": "application/pdf",
          "Content-Disposition": disposition,
          "Cache-Control": "no-store, no-cache, must-revalidate",
        };
        if (contentLength) {
          responseHeaders["Content-Length"] = contentLength;
        }

        // Forward custom print tracking headers
        const printCount = upstreamRes.headers.get("X-Print-Count");
        const batchId = upstreamRes.headers.get("X-Batch-Id") || upstreamRes.headers.get("X-Batch-No");
        const printedBy = upstreamRes.headers.get("X-Printed-By");
        const printedAt = upstreamRes.headers.get("X-Printed-At");
        if (printCount) responseHeaders["X-Print-Count"] = printCount;
        if (batchId) responseHeaders["X-Batch-Id"] = batchId;
        if (printedBy) responseHeaders["X-Printed-By"] = printedBy;
        if (printedAt) responseHeaders["X-Printed-At"] = printedAt;
        responseHeaders["Access-Control-Expose-Headers"] =
          "X-Print-Count, X-Batch-Id, X-Printed-By, X-Printed-At, Content-Disposition";

        return new NextResponse(buffer, {
          status: upstreamRes.status,
          headers: responseHeaders,
        });
      }

      // If upstream returned an error (JSON or text)
      const errText = await upstreamRes.text();
      let errBody: Record<string, unknown> = { success: false, message: "PDF request failed." };
      try {
        errBody = JSON.parse(errText);
      } catch {
        errBody.message = errText || `PDF request failed with status ${upstreamRes.status}.`;
      }
      return NextResponse.json(errBody, { status: upstreamRes.status || 500 });
    } catch (err) {
      console.error("PDF proxy failed", err);
      return errorResponse(
        503,
        err instanceof Error ? err.message : "The IIOT PDF service is unavailable.",
        "IIOT_SERVICE_UNAVAILABLE",
      );
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

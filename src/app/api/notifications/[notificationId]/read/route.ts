import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { serverApiClient } from "@/api/server-client";
import { SERVER_API_CONFIG } from "@/api/server-config";
import { AUTH_COOKIE_NAMES } from "@/features/auth/api/auth.server";
import type { BackendApiResponse } from "@/api/types";

export async function POST(
  _request: Request,
  context: { params: Promise<{ notificationId: string }> },
) {
  const accessToken = (await cookies()).get(AUTH_COOKIE_NAMES.accessToken)?.value;

  if (!accessToken) {
    return NextResponse.json(
      {
        success: false,
        message: "Not authenticated.",
        errorCode: "UNAUTHORIZED",
        timestamp: new Date().toISOString(),
      } satisfies BackendApiResponse<never>,
      { status: 401 },
    );
  }

  const incomingHeaders = await headers();
  const selectedPlantId = incomingHeaders.get("x-selected-plant-id") || incomingHeaders.get("x-plant-id") || "";

  const { notificationId } = await context.params;
  const upstreamPath = `/api/v1/notifications/${encodeURIComponent(notificationId)}/read`;

  const forwardHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };

  if (selectedPlantId) {
    forwardHeaders["X-Plant-Id"] = selectedPlantId;
    forwardHeaders["X-Selected-Plant-Id"] = selectedPlantId;
  }

  const { response, result } = await serverApiClient<unknown>(
    SERVER_API_CONFIG.gatewayUrl,
    upstreamPath,
    {
      method: "POST",
      headers: forwardHeaders,
    },
  );

  return NextResponse.json(result, { status: response.status });
}

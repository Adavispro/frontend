import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { serverApiClient } from "@/api/server-client";
import { SERVER_API_CONFIG } from "@/api/server-config";
import { AUTH_COOKIE_NAMES } from "@/features/auth/api/auth.server";
import type { BackendApiResponse } from "@/api/types";

export async function GET() {
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

  const { response, result } = await serverApiClient<unknown>(
    SERVER_API_CONFIG.gatewayUrl,
    "/api/v1/notifications/unread-count",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  return NextResponse.json(result, { status: response.status });
}

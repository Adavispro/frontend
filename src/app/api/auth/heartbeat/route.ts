import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAMES,
  authErrorResponse,
  authServiceEndpoints,
  authServiceUnavailableResponse,
  clearAuthCookies,
  requestAuthService,
  setAccessTokenCookie,
} from "@/features/auth/api/auth.server";
import type { RefreshTokenResponse } from "@/features/auth/api/types";
import { refreshTokenResponseSchema } from "@/features/auth/schemas";
import type { BackendApiResponse } from "@/api/types";

export async function POST() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_COOKIE_NAMES.accessToken)?.value;
  const refreshToken = cookieStore.get(AUTH_COOKIE_NAMES.refreshToken)?.value;

  if (!accessToken && !refreshToken) {
    const response = authErrorResponse(401, { message: "Not authenticated." });
    clearAuthCookies(response);
    return response;
  }

  // 1. If accessToken is present, try direct heartbeat on auth-service
  if (accessToken) {
    try {
      const { response, result } = await requestAuthService(
        authServiceEndpoints.heartbeat,
        {
          method: "POST",
          accessToken,
        }
      );

      if (response.ok && result.success) {
        return NextResponse.json({
          success: true,
          message: "Session extended successfully.",
          data: result.data,
          timestamp: new Date().toISOString(),
        } satisfies BackendApiResponse<unknown>);
      }
    } catch {
      // Direct heartbeat failed (token may be expired), fall through to refresh
    }
  }

  // 2. If direct heartbeat failed or accessToken was expired, use refresh token rotation
  if (refreshToken) {
    try {
      const { response, result } = await requestAuthService<
        RefreshTokenResponse,
        { refreshToken: string }
      >(authServiceEndpoints.refresh, {
        method: "POST",
        body: { refreshToken },
      });

      if (!response.ok || !result.success || !result.data) {
        const errorResponse = authErrorResponse(response.status, result);
        clearAuthCookies(errorResponse);
        return errorResponse;
      }

      const parsedTokens = refreshTokenResponseSchema.safeParse(result.data);
      if (!parsedTokens.success) {
        const errorResponse = authErrorResponse(502, {
          message: "The authentication service returned an invalid response.",
        });
        clearAuthCookies(errorResponse);
        return errorResponse;
      }

      const nextResponse = NextResponse.json({
        success: true,
        message: "Session refreshed successfully.",
        data: null,
        timestamp: result.timestamp,
      });
      setAccessTokenCookie(nextResponse, parsedTokens.data);
      return nextResponse;
    } catch {
      return authServiceUnavailableResponse();
    }
  }

  const errorResponse = authErrorResponse(401, { message: "Session expired or revoked." });
  clearAuthCookies(errorResponse);
  return errorResponse;
}

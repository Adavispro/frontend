import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const MDM_SERVICE_URL = process.env.MDM_SERVICE_URL || process.env.NEXT_PUBLIC_MDM_SERVICE_URL || "http://localhost:9083";
const INTERNAL_AUTH = process.env.INTERNAL_AUTH_HEADER_VALUE || process.env.SECURITY_INTERNAL_AUTH_HEADER || "adavis-internal-auth-key";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("adavis_access_token")?.value;

    const formData = await request.formData();
    const type = formData.get("type") as string;
    const mode = (formData.get("mode") as string) || "UPDATE";
    const tenantId = (formData.get("tenantId") as string) || "TNT-0001";
    const file = formData.get("file") as File;

    if (!file || !type) {
      return NextResponse.json(
        { success: false, message: "Type and file are required", errorCode: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const forwardFormData = new FormData();
    forwardFormData.append("type", type);
    forwardFormData.append("mode", mode);
    forwardFormData.append("tenantId", tenantId);
    forwardFormData.append("file", file);

    const headers: Record<string, string> = {
      "X-Internal-Auth": INTERNAL_AUTH,
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${MDM_SERVICE_URL}/api/v1/mdm/bulk/upload`, {
      method: "POST",
      headers,
      body: forwardFormData,
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Bulk upload proxy error", errorCode: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

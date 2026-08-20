import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const MDM_SERVICE_URL = process.env.MDM_SERVICE_URL || process.env.NEXT_PUBLIC_MDM_SERVICE_URL || "http://localhost:9083";
const INTERNAL_AUTH = process.env.INTERNAL_AUTH_HEADER_VALUE || process.env.SECURITY_INTERNAL_AUTH_HEADER || "adavis-internal-auth-key";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get("adavis_access_token")?.value;

    const headers: Record<string, string> = {
      "X-Internal-Auth": INTERNAL_AUTH,
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${MDM_SERVICE_URL}/api/v1/mdm/bulk/template/${type}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: "Failed to fetch template" },
        { status: response.status }
      );
    }

    const csvData = await response.text();
    return new NextResponse(csvData, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${type.toLowerCase()}_template.csv"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Template download error" },
      { status: 500 }
    );
  }
}

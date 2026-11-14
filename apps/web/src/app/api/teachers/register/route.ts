import { NextResponse } from "next/server";
import { registerTeacher } from "@/lib/auth-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await registerTeacher({
      displayName: typeof body.displayName === "string" ? body.displayName : "",
      nationalId: typeof body.nationalId === "string" ? body.nationalId : "",
      phone: typeof body.phone === "string" ? body.phone : "",
    });
    return result.ok
      ? NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ error: result.error }, { status: 400, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "ثبت درخواست انجام نشد؛ سرور سایت را یک‌بار راه‌اندازی مجدد کنید." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { staffContact, updateStaffPhone } from "@/lib/auth-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user || !["admin", "teacher"].includes(user.role)) return NextResponse.json({ error: "دسترسی مجاز نیست." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ profile: await staffContact(user.id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user || !["admin", "teacher"].includes(user.role)) return NextResponse.json({ error: "دسترسی مجاز نیست." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  let body: { phone?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400 }); }
  if (typeof body.phone !== "string" || body.phone.length > 30) return NextResponse.json({ error: "شمارهٔ همراه معتبر نیست." }, { status: 400 });
  const result = await updateStaffPhone(user.id, body.phone);
  return result.ok ? NextResponse.json({ ok: true, phone: result.phone }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: result.error }, { status: 400, headers: { "Cache-Control": "no-store" } });
}

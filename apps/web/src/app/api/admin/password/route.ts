import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { updateOwnAdminPassword } from "@/lib/auth-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// An admin changes their own password. All of their sessions are revoked,
// so they sign in again with the new password afterwards.
export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "فقط مدیر واردشده می‌تواند گذرواژهٔ خودش را تغییر دهد." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400 }); }
  if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
    return NextResponse.json({ error: "گذرواژهٔ فعلی و جدید لازم است." }, { status: 400 });
  }
  const result = await updateOwnAdminPassword(user.id, { currentPassword: body.currentPassword, newPassword: body.newPassword });
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: 400 });
}

import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { createGuardianAccount, linkGuardianToStudent, listGuardianAccounts, unlinkGuardianFromStudent } from "@/lib/auth-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: create a guardian account (login = guardian mobile number),
// list guardians with their linked students, link / unlink a student.
export async function GET() {
  const user = await currentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "فقط مدیر به حساب‌های والد دسترسی دارد." }, { status: 403 });
  return NextResponse.json({ guardians: await listGuardianAccounts() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "فقط مدیر می‌تواند حساب والد بسازد یا پیوند دهد." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400 }); }
  const action = String(body.action || "create");
  if (action === "create") {
    if (typeof body.displayName !== "string" || typeof body.phone !== "string" || typeof body.password !== "string") {
      return NextResponse.json({ error: "نام سرپرست، شمارهٔ همراه و گذرواژه لازم است." }, { status: 400 });
    }
    const result = await createGuardianAccount(user, { displayName: body.displayName, phone: body.phone, password: body.password });
    return result.ok
      ? NextResponse.json({ ok: true, id: result.id, username: result.username }, { status: 201, headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ error: result.error }, { status: 400 });
  }
  const guardianUserId = Number(body.guardianUserId);
  const registrationId = Number(body.registrationId);
  if (!Number.isSafeInteger(guardianUserId) || guardianUserId < 1 || !Number.isSafeInteger(registrationId) || registrationId < 1) {
    return NextResponse.json({ error: "حساب والد یا پروندهٔ دانش‌آموز معتبر نیست." }, { status: 400 });
  }
  if (action === "link") {
    const result = await linkGuardianToStudent(user, guardianUserId, registrationId);
    return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: 400 });
  }
  if (action === "unlink") {
    const result = await unlinkGuardianFromStudent(user, guardianUserId, registrationId);
    return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ error: "عملیات ناشناخته است." }, { status: 400 });
}

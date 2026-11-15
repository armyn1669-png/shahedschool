import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { authenticate, ensureDatabaseReady, issueSession, roleLabels, sessionCookieOptions } from "@/lib/auth-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedRoles = new Set(Object.keys(roleLabels));

export async function POST(request: Request) {
  await ensureDatabaseReady();
  let body: { username?: unknown; password?: unknown; role?: unknown; rememberMe?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (typeof body.username !== "string" || typeof body.password !== "string" || body.username.length > 64 || body.password.length > 128) {
    return NextResponse.json({ error: "نام کاربری یا گذرواژه درست نیست." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (body.role !== undefined && (typeof body.role !== "string" || !allowedRoles.has(body.role))) {
    return NextResponse.json({ error: "پنل انتخاب‌شده معتبر نیست." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const identityKey = createHash("sha256").update(`${forwarded}\0${body.username.normalize("NFKC").toLowerCase()}`).digest("hex");
  const result = await authenticate(body.username, body.password, identityKey);
  if (!result.ok) {
    const message = result.limited ? "تلاش‌های ورود زیاد بوده است؛ ۱۵ دقیقه دیگر دوباره امتحان کنید." : "نام کاربری یا گذرواژه درست نیست.";
    return NextResponse.json({ error: message }, { status: result.limited ? 429 : 401, headers: { "Cache-Control": "no-store" } });
  }
  if (typeof body.role === "string" && body.role !== result.user.role) {
    return NextResponse.json({ error: `این حساب برای پنل ${roleLabels[result.user.role]} است.` }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const session = await issueSession(result.user.id, body.rememberMe === true);
  const response = NextResponse.json({ user: { username: result.user.username, role: result.user.role, displayName: result.user.displayName } }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(session.cookieName, session.token, sessionCookieOptions(session.maxAge));
  return response;
}

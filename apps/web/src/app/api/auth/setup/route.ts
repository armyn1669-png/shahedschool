import { NextResponse } from "next/server";
import { createInitialAdmin, issueSession, sessionCookieOptions } from "@/lib/auth-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { username?: unknown; password?: unknown; setupToken?: unknown; phone?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (typeof body.username !== "string" || typeof body.password !== "string" || typeof body.setupToken !== "string" || typeof body.phone !== "string" || body.password.length > 128 || body.setupToken.length > 256 || body.phone.length > 30) {
    return NextResponse.json({ error: "اطلاعات راه‌اندازی کامل نیست." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0].replace(/^\[|\]$/g, "").toLowerCase();
  if (process.env.NODE_ENV !== "production" && !["localhost", "127.0.0.1", "::1"].includes(hostname)) return NextResponse.json({ error: "راه‌اندازی اولیه فقط از همین دستگاه مجاز است." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (origin) {
    try { if (new URL(origin).host !== host) return NextResponse.json({ error: "درخواست راه‌اندازی از این نشانی مجاز نیست." }, { status: 403, headers: { "Cache-Control": "no-store" } }); }
    catch { return NextResponse.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: { "Cache-Control": "no-store" } }); }
  }
  const result = await createInitialAdmin(body.username, body.password, body.setupToken, body.phone);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const session = await issueSession(result.user.id);
  const response = NextResponse.json({ user: { username: result.user.username, role: result.user.role } }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(session.cookieName, session.token, sessionCookieOptions(session.maxAge));
  return response;
}

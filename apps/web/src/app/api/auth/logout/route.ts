import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, revokeSession, sessionCookieOptions } from "@/lib/auth-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const jar = await cookies();
  await revokeSession(jar.get(COOKIE_NAME)?.value);
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(COOKIE_NAME, "", { ...sessionCookieOptions(0), expires: new Date(0) });
  return response;
}

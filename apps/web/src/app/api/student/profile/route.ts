import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { studentProfile } from "@/lib/auth-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user || user.role !== "student") return NextResponse.json({ error: "دسترسی فقط برای دانش‌آموز است." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const profile = await studentProfile(user.id);
  return profile ? NextResponse.json({ profile }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "پروندهٔ تأییدشده‌ای برای این حساب پیدا نشد." }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

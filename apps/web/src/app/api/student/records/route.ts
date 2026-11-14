import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { classRecords } from "@/lib/academic-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user || user.role !== "student") return NextResponse.json({error:"دسترسی فقط برای دانش‌آموز است."},{status:403});
  return NextResponse.json(await classRecords(user),{headers:{"Cache-Control":"no-store"}});
}

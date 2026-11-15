import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { guardianChildren } from "@/lib/auth-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Guardian's own view: only the approved students linked to this account,
// each with recent attendance and grades. No other student's data is returned.
export async function GET() {
  const user = await currentUser();
  if (!user || user.role !== "guardian") return NextResponse.json({ error: "فقط حساب والد به پروندهٔ فرزند دسترسی دارد." }, { status: 403 });
  return NextResponse.json({ children: await guardianChildren(user.id) }, { headers: { "Cache-Control": "no-store" } });
}

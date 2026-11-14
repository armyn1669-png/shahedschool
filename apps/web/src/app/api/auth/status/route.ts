import { NextResponse } from "next/server";
import { database, ensureDatabaseReady } from "@/lib/auth-db";
import { dbGet } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await ensureDatabaseReady();
  const userCount = ((await dbGet(db, "SELECT COUNT(*) AS count FROM users")) as { count: number }).count;
  const setupUsed = Boolean((await dbGet(db, "SELECT 1 FROM app_settings WHERE setting_key = 'initial_admin_created'")));
  const needsSetup = userCount === 0 && !setupUsed;
  return NextResponse.json({ needsSetup, canSetup: needsSetup && Boolean(process.env.SCHOOL_SETUP_TOKEN) }, { headers: { "Cache-Control": "no-store" } });
}

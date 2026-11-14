import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { createTeacherAccount, listTeacherAccounts, listTeacherRegistrations, reviewTeacherRegistration, updateTeacherCredentials, syncTeacherLoginToNationalId } from "@/lib/auth-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await currentUser();
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "دسترسی فقط برای مدیر مدرسه است." }, { status: 403 });
  return NextResponse.json({ requests: await listTeacherRegistrations(), teachers:await listTeacherAccounts() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const admin = await currentUser();
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "دسترسی فقط برای مدیر مدرسه است." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  let body: { displayName?: unknown; nationalId?: unknown; phone?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400 }); }
  if (typeof body.displayName !== "string" || typeof body.nationalId !== "string" || typeof body.phone !== "string") return NextResponse.json({ error: "نام، کد ملی و شماره همراه را وارد کنید." }, { status: 400 });
  const result = await createTeacherAccount(body.displayName, body.nationalId, body.phone);
  return result.ok ? NextResponse.json({ ok: true, username: result.username }, { status: 201, headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: result.error }, { status: 400, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const admin = await currentUser();
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "دسترسی فقط برای مدیر مدرسه است." }, { status: 403 });
  let body: { id?: unknown; status?: unknown;account?:unknown;nationalId?:unknown;displayName?:unknown;phone?:unknown;password?:unknown;syncNationalId?:unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400 }); }
  if(body.account===true){const result=await updateTeacherCredentials(admin,{userId:Number(body.id),username:typeof body.nationalId==="string"?body.nationalId:"",displayName:typeof body.displayName==="string"?body.displayName:undefined,phone:typeof body.phone==="string"?body.phone:undefined});return result.ok?NextResponse.json({ok:true}):NextResponse.json({error:result.error},{status:400})}
  if(body.syncNationalId===true){const result=await syncTeacherLoginToNationalId(Number(body.id),typeof body.nationalId==="string"?body.nationalId:"",admin.id);return result.ok?NextResponse.json({ok:true}):NextResponse.json({error:result.error},{status:400})}
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id < 1 || !["approved", "rejected"].includes(String(body.status))) return NextResponse.json({ error: "درخواست یا وضعیت معتبر نیست." }, { status: 400 });
  const result = await reviewTeacherRegistration(id, body.status as "approved" | "rejected", admin.id);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: 400 });
}

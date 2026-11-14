import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { ensureDatabaseReady, listStudentRegistrations, reviewStudentRegistration, resetStudentPassword, updateStudentRegistration, deleteStudentRegistration } from "@/lib/auth-db";
import { academicDatabase, setGuardianEitaaChatId } from "@/lib/academic-db";
import { dbAll } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "دسترسی فقط برای مدیر مدرسه است." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  await ensureDatabaseReady();
  const db=await academicDatabase();
  const students=await listStudentRegistrations() as Array<Record<string,unknown>&{id:number}>;
  const contacts=(await dbAll(db, "SELECT registration_id AS registrationId,chat_id AS guardianEitaaChatId FROM guardian_eitaa_contacts")) as Array<{registrationId:number;guardianEitaaChatId:string}>;
  const byId=new Map(contacts.map(x=>[x.registrationId,x.guardianEitaaChatId]));
  return NextResponse.json({ students: students.map(s=>({...s,guardianEitaaChatId:byId.get(s.id)||""})) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "دسترسی فقط برای مدیر مدرسه است." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  let body: { id?: unknown; status?: unknown; action?:unknown; password?:unknown; chatId?:unknown; student?:unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400 }); }
  if(body.action==="eitaa-chat-id"){
    if(!Number.isSafeInteger(body.id)||typeof body.chatId!=="string"||body.chatId.trim().length>120)return NextResponse.json({error:"شناسهٔ مقصد معتبر نیست."},{status:400});
    const result=await setGuardianEitaaChatId(user,Number(body.id),body.chatId.trim());
    return result.ok?NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:result.error},{status:400});
  }
  if(body.action==="reset-password"){
    if(!Number.isSafeInteger(body.id))return NextResponse.json({error:"شناسهٔ دانش‌آموز معتبر نیست."},{status:400});
    const result=await resetStudentPassword(body.id as number,user.id);
    return result.ok?NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:result.error},{status:400,headers:{"Cache-Control":"no-store"}});
  }
  if(body.action==="edit"){
    if(!Number.isSafeInteger(body.id)||!body.student||typeof body.student!=="object")return NextResponse.json({error:"اطلاعات دانش‌آموز معتبر نیست."},{status:400});
    const s=body.student as Record<string,unknown>;
    if(["fullName","nationalId","phone","grade","fieldOfStudy","branch","guardianName","guardianPhone","address"].some(k=>typeof s[k]!=="string"))return NextResponse.json({error:"همهٔ مشخصات باید متنی باشند."},{status:400});
    const result=await updateStudentRegistration(Number(body.id),s as {fullName:string;nationalId:string;phone:string;grade:string;fieldOfStudy:string;branch:string;guardianName:string;guardianPhone:string;address:string},user.id);
    return result.ok?NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:result.error},{status:400,headers:{"Cache-Control":"no-store"}});
  }
  if(body.action==="delete"){
    if(!Number.isSafeInteger(body.id))return NextResponse.json({error:"شناسهٔ دانش‌آموز معتبر نیست."},{status:400});
    const result=await deleteStudentRegistration(Number(body.id),user.id);
    return result.ok?NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:result.error},{status:404,headers:{"Cache-Control":"no-store"}});
  }
  if (!Number.isSafeInteger(body.id) || (body.status !== "approved" && body.status !== "rejected")) return NextResponse.json({ error: "درخواست بررسی معتبر نیست." }, { status: 400 });
  await ensureDatabaseReady();
  const changed = await reviewStudentRegistration(body.id as number, body.status, user.id);
  return changed ? NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "این درخواست دیگر در انتظار بررسی نیست." }, { status: 409, headers: { "Cache-Control": "no-store" } });
}

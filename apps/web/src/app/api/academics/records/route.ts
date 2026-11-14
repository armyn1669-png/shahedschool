import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { courseRoster, recordAttendance, recordGrade, submitAttendanceBatch } from "@/lib/academic-db";
import { dbAll } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !["admin","teacher"].includes(user.role)) return NextResponse.json({ error: "فقط مدیر یا دبیر به فهرست کلاس دسترسی دارد." }, { status: 403 });
  const courseId = Number(new URL(request.url).searchParams.get("courseId"));
  if (!Number.isSafeInteger(courseId) || courseId < 1) return NextResponse.json({ error: "کلاس انتخاب نشده است." }, { status: 400 });
  const students = await courseRoster(user,courseId);
  if(!students)return NextResponse.json({error:"کلاس پیدا نشد یا دسترسی ندارید."},{status:404});
  const date=new URL(request.url).searchParams.get("date")||"";
  const {academicDatabase}=await import("@/lib/academic-db");const db=await academicDatabase();
  const attendance=date?(await dbAll(db, "SELECT registration_id AS registrationId,status FROM attendance WHERE course_id=? AND attendance_date=?", courseId,date)):[];
  return NextResponse.json({students,attendance},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || !["admin","teacher"].includes(user.role)) return NextResponse.json({ error: "فقط مدیر یا دبیر می‌تواند اطلاعات آموزشی ثبت کند." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400 }); }
  const courseId = Number(body.courseId), registrationId = Number(body.registrationId);
  if(body.kind==="attendance-batch"){
    const ids=Array.isArray(body.absentRegistrationIds)?body.absentRegistrationIds.map(Number):[];
    if(!Number.isSafeInteger(courseId)||!ids.every(id=>Number.isSafeInteger(id)&&id>0))return NextResponse.json({error:"کلاس یا فهرست غایبان معتبر نیست."},{status:400});
    const result=await submitAttendanceBatch(user,{courseId,date:typeof body.date==="string"?body.date:"",absentRegistrationIds:ids});
    return result.ok?NextResponse.json(result,{headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:result.error},{status:400});
  }
  if (!Number.isSafeInteger(courseId) || !Number.isSafeInteger(registrationId)) return NextResponse.json({error:"کلاس یا دانش‌آموز معتبر نیست."},{status:400});
  const result = body.kind === "attendance"
    ? await recordAttendance(user,{courseId,registrationId,date:typeof body.date === "string" ? body.date : "",status:typeof body.status === "string" ? body.status : ""})
    : body.kind === "grade"
      ? await recordGrade(user,{courseId,registrationId,title:typeof body.title === "string" ? body.title.trim() : "",score:Number(body.score),maxScore:Number(body.maxScore)})
      : {ok:false as const,error:"نوع ثبت مشخص نیست."};
  return result.ok ? NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}}) : NextResponse.json({error:result.error},{status:400,headers:{"Cache-Control":"no-store"}});
}

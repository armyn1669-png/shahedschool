import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { academicSnapshot, createCourse, deleteCourse, updateCourse } from "@/lib/academic-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "برای دیدن اطلاعات وارد شوید." }, { status: 401 });
  return NextResponse.json(await academicSnapshot(user), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "فقط مدیر می‌تواند کلاس و برنامه تعریف کند." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400 }); }
  const text = (key: string, max: number) => typeof body[key] === "string" ? (body[key] as string).trim().slice(0, max) : "";
  const teacherId = Number(body.teacherId);
  const period=Number(body.period), weekPattern=text("weekPattern",10) as "every"|"a"|"b";
  if (!Number.isSafeInteger(teacherId) || !text("title", 80) || !["دهم","یازدهم","دوازدهم"].includes(text("grade",20)) || !["ریاضی و فیزیک","علوم تجربی","علوم انسانی","هنر","سایر"].includes(text("fieldOfStudy",60)) || !/^([۱-۹]|[1-9])$/.test(text("branch",4)) || !["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه"].includes(text("weekday",20)) || !Number.isInteger(period)||period<1||period>8||!["every","a","b"].includes(weekPattern)) return NextResponse.json({ error: "اطلاعات درس، پایه، شعبه، دبیر، روز و زنگ را کامل کنید." }, { status: 400 });
  const result = await createCourse(user,{ title:text("title",80), grade:text("grade",20), fieldOfStudy:text("fieldOfStudy",60), branch:text("branch",4), teacherId, weekday:text("weekday",20), period, weekPattern, room:text("room",40) });
  return result.ok ? NextResponse.json(result,{status:201,headers:{"Cache-Control":"no-store"}}) : NextResponse.json({error:result.error},{status:400});
}

export async function PATCH(request:Request){const user=await currentUser();if(!user||user.role!=="admin")return NextResponse.json({error:"فقط مدیر می‌تواند برنامه را ویرایش کند."},{status:403});let body:Record<string,unknown>;try{body=await request.json()}catch{return NextResponse.json({error:"درخواست معتبر نیست."},{status:400})}const text=(key:string,max:number)=>typeof body[key]==="string"?(body[key] as string).trim().slice(0,max):"",id=Number(body.id),teacherId=Number(body.teacherId),period=Number(body.period),weekPattern=text("weekPattern",10) as "every"|"a"|"b";if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(teacherId)||!text("title",80)||!Number.isInteger(period)||period<1||period>8||!["every","a","b"].includes(weekPattern))return NextResponse.json({error:"اطلاعات برنامه معتبر نیست."},{status:400});const result=await updateCourse(user,id,{title:text("title",80),grade:text("grade",20),fieldOfStudy:text("fieldOfStudy",60),branch:text("branch",4),teacherId,weekday:text("weekday",20),period,weekPattern,room:text("room",40)});return result.ok?NextResponse.json({ok:true}):NextResponse.json({error:result.error},{status:400})}

export async function DELETE(request:Request){const user=await currentUser();if(!user||user.role!=="admin")return NextResponse.json({error:"فقط مدیر می‌تواند برنامه را حذف کند."},{status:403});const id=Number(new URL(request.url).searchParams.get("id"));if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:"زنگ معتبر نیست."},{status:400});return await deleteCourse(user,id)?NextResponse.json({ok:true}):NextResponse.json({error:"زنگ پیدا نشد."},{status:404})}

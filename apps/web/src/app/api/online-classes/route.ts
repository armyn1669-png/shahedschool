import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { createOnlineClass, extendOnlineClass, onlineClassesSnapshot, updateOnlineClass } from "@/lib/online-classes";
import { academicSnapshot } from "@/lib/academic-db";
import { RoomServiceClient } from "livekit-server-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "برای دیدن جلسه‌ها وارد شوید." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const [classes, academic] = await Promise.all([onlineClassesSnapshot(user), academicSnapshot(user)]);
  return NextResponse.json({ classes, courses: user.role === "teacher" ? academic.courses : [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "teacher") return NextResponse.json({ error: "ساخت جلسه فقط برای دبیر همان کلاس فعال است." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400 }); }
  const text = (key: string, limit: number) => typeof body[key] === "string" ? (body[key] as string).trim().slice(0,limit) : "";
  const courseId = Number(body.courseId);
  const durationMinutes = Number(body.durationMinutes);
  if (!Number.isSafeInteger(courseId) || courseId < 1 || !Number.isInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 120) {
    return NextResponse.json({ error: "کلاس و مدت ۱۰ تا ۱۲۰ دقیقه‌ای معتبر را وارد کنید." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const result = await createOnlineClass(user,{ courseId,title:text("title",120),description:text("description",700),durationMinutes });
  if (!result.ok) return NextResponse.json({error:result.error},{status:400,headers:{"Cache-Control":"no-store"}});
  const sessions = await onlineClassesSnapshot(user);
  const session = sessions.find(item => item.id === result.id);
  return NextResponse.json({ok:true,session},{status:201,headers:{"Cache-Control":"no-store"}});
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "teacher") return NextResponse.json({ error: "فقط دبیر همان کلاس می‌تواند جلسهٔ خودش را مدیریت کند." }, { status: 403 });
  let body: { id?: unknown; status?: unknown; action?: unknown }; try { body = await request.json(); } catch { return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400 }); }
  const id = Number(body.id);
  if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:"شناسهٔ جلسه معتبر نیست."},{status:400});
  if(body.action==="extend"){const result=await extendOnlineClass(user,id);return result.ok?NextResponse.json(result,{headers:{"Cache-Control":"no-store"}}):NextResponse.json({error:result.error},{status:400,headers:{"Cache-Control":"no-store"}});}
  const status = body.status;
  if (!Number.isSafeInteger(id) || id < 1 || !["live","ended","cancelled"].includes(String(status))) return NextResponse.json({ error: "وضعیت جلسه معتبر نیست." }, { status: 400 });
  const updated = await updateOnlineClass(user,id,status as "live"|"ended"|"cancelled");
  if (updated && ["ended","cancelled"].includes(String(status)) && process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
    const host=process.env.LIVEKIT_URL.replace(/^ws:/i,"http:").replace(/^wss:/i,"https:");
    try { await new RoomServiceClient(host,process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET).deleteRoom(`school-class-${id}`); } catch { /* Room may not have been created yet. */ }
  }
  return updated ? NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}}) : NextResponse.json({error:"جلسه پیدا نشد یا به حساب شما تعلق ندارد."},{status:404});
}

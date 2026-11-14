import { randomUUID } from "node:crypto";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { onlineClassAccess } from "@/lib/online-classes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "برای ورود به کلاس باید وارد حساب شوید." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "شناسهٔ کلاس معتبر نیست." }, { status: 400 });
  const onlineClass = await onlineClassAccess(user,id);
  if (!onlineClass) return NextResponse.json({ error: "این کلاس برای حساب شما در دسترس نیست یا جلسه پایان یافته است." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const serverUrl = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!serverUrl || !apiKey || !apiSecret) return NextResponse.json({ error: "سرور کلاس آنلاین هنوز پیکربندی نشده است. تنظیمات LiveKit را در .env.local وارد و سرور سایت را دوباره اجرا کنید." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!/^wss?:\/\//i.test(serverUrl)) return NextResponse.json({ error: "نشانی سرور کلاس آنلاین باید با ws:// یا wss:// شروع شود." }, { status: 503 });
  const roomName = `school-class-${onlineClass.id}`;
  const token = new AccessToken(apiKey,apiSecret,{identity:`user-${user.id}-${randomUUID()}`,name:user.displayName,metadata:JSON.stringify({role:user.role}),ttl:"2h"});
  const isTeacher=user.role==="teacher";
  token.addGrant({roomJoin:true,room:roomName,canPublish:isTeacher,canPublishSources:isTeacher?[TrackSource.CAMERA,TrackSource.MICROPHONE,TrackSource.SCREEN_SHARE]:[],canSubscribe:true,canPublishData:true,roomAdmin:isTeacher});
  return NextResponse.json({ token: await token.toJwt(), serverUrl, roomName, role:user.role, participantName:user.displayName }, { headers: { "Cache-Control": "no-store" } });
}

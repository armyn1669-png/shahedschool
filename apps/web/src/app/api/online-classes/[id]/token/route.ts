import { randomUUID } from "node:crypto";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { ensureOnlineClassAdmission, getOnlineClassAdmission, onlineClassAccess } from "@/lib/online-classes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function siteHost(request: Request) {
  return (request.headers.get("host") || "").split(":")[0].toLowerCase();
}

function siteIsLocal(request: Request) {
  const host = siteHost(request);
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function siteIsHttps(request: Request) {
  const forwarded = (request.headers.get("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
  if (forwarded) return forwarded === "https";
  try { return new URL(request.url).protocol === "https:"; } catch { return false; }
}

function isLoopbackOrPrivate(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1") return true;
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some(part => !/^\d+$/.test(part))) return false;
  const [a, b] = parts.map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "برای ورود به کلاس باید وارد حساب شوید." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "شناسهٔ کلاس معتبر نیست." }, { status: 400 });
  const onlineClass = await onlineClassAccess(user,id);
  if (!onlineClass) return NextResponse.json({ error: user.role === "admin" ? "مدیر فقط می‌تواند جلسهٔ زنده را مشاهده کند؛ در حال حاضر جلسه‌ای در حال برگزاری نیست." : "این کلاس برای حساب شما در دسترس نیست یا جلسه پایان یافته است." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (user.role === "student") {
    const admission = await getOnlineClassAdmission(id, user.id);
    if (!admission) {
      await ensureOnlineClassAdmission(id, user.id);
      return NextResponse.json({ code: "waiting_room", status: "pending", message: "در انتظار تأیید دبیر هستید؛ پس از تأیید به کلاس وارد می‌شوید." }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }
    if (admission.status === "pending") return NextResponse.json({ code: "waiting_room", status: "pending", message: "در انتظار تأیید دبیر هستید؛ پس از تأیید به کلاس وارد می‌شوید." }, { status: 202, headers: { "Cache-Control": "no-store" } });
    if (admission.status === "denied") return NextResponse.json({ code: "admission_denied", status: "denied", message: "دبیر ورود شما به این کلاس را رد کرد." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const serverUrl = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!serverUrl || !apiKey || !apiSecret) return NextResponse.json({ code: "livekit_not_configured", error: "سرور کلاس آنلاین هنوز پیکربندی نشده است. مدیر باید LIVEKIT_URL و LIVEKIT_API_KEY و LIVEKIT_API_SECRET را در متغیرهای محیطی هاست (مثلاً Netlify) ست کند و دوباره دیپلوی بگیرد؛ در اجرای لوکال همان‌ها را در apps/web/.env.local بگذارید." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  // B3: an obvious placeholder (e.g. the dev key from .env.local.example) must
  // never mint a real-looking token that points at a server that does not exist.
  if ([serverUrl, apiKey, apiSecret].some((value) => /devkey|placeholder/i.test(value))) return NextResponse.json({ code: "livekit_placeholder", error: "کلید یا نشانی LiveKit هنوز مقدار نمونه (placeholder) است؛ مدیر باید کلید واقعی سرور LiveKit را در تنظیمات هاست وارد کند." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!/^wss?:\/\//i.test(serverUrl)) return NextResponse.json({ code: "livekit_bad_url", error: "نشانی سرور کلاس آنلاین باید با ws:// یا wss:// شروع شود." }, { status: 503 });
  let livekitHost = "";
  try { livekitHost = new URL(serverUrl).hostname; } catch { return NextResponse.json({ code: "livekit_bad_url", error: "نشانی سرور کلاس آنلاین معتبر نیست." }, { status: 503 }); }
  if (isLoopbackOrPrivate(livekitHost) && !siteIsLocal(request)) return NextResponse.json({ code: "livekit_local_url", error: "سرور کلاس آنلاین روی رایانهٔ لوکال تنظیم شده و مرورگر شما از اینترنت به آن نمی‌رسد. مدیر باید یک سرور LiveKit عمومی با نشانی wss:// وصل کند." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (/^ws:\/\//i.test(serverUrl) && siteIsHttps(request)) return NextResponse.json({ code: "livekit_insecure_url", error: "نشانی سرور کلاس آنلاین امن نیست (ws://) و مرورگر روی سایت امن به آن وصل نمی‌شود. مدیر باید نشانی wss:// برای LiveKit بدهد." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const roomName = `school-class-${onlineClass.id}`;
  const token = new AccessToken(apiKey,apiSecret,{identity:`user-${user.id}-${randomUUID()}`,name:user.displayName,metadata:JSON.stringify({role:user.role}),ttl:"2h"});
  const isTeacher=user.role==="teacher";
  // Admins join view-only: canPublish false + no publish sources + not room admin.
  token.addGrant({roomJoin:true,room:roomName,canPublish:isTeacher,canPublishSources:isTeacher?[TrackSource.CAMERA,TrackSource.MICROPHONE,TrackSource.SCREEN_SHARE]:[],canSubscribe:true,canPublishData:true,roomAdmin:isTeacher});
  return NextResponse.json({ token: await token.toJwt(), serverUrl, roomName, role:user.role, participantName:user.displayName }, { headers: { "Cache-Control": "no-store" } });
}

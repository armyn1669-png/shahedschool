import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { announcementsSnapshot, createAnnouncement, deleteAnnouncement } from "@/lib/announcements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "برای دیدن اخبار وارد شوید." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ announcements: await announcementsSnapshot(user) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "فقط مدیر مدرسه می‌تواند خبر منتشر کند." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400 }); }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.body === "string" ? body.body.trim() : "";
  const kind = body.kind;
  const imageData = typeof body.imageData === "string" ? body.imageData : "";
  if (!title || title.length > 150 || content.length < 2 || content.length > 12_000 || !["news","article"].includes(String(kind)) || imageData.length > 2_000_000 || (imageData && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData))) {
    return NextResponse.json({ error: "عنوان، متن، نوع مطلب یا تصویر معتبر نیست." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const id = await createAnnouncement(user, { title, body: content, kind: kind as "news" | "article", imageData, pinned: body.pinned === true });
  return NextResponse.json({ ok: true, id }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "فقط مدیر مدرسه می‌تواند مطلب را حذف کند." }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "مطلب انتخاب‌شده معتبر نیست." }, { status: 400 });
  return await deleteAnnouncement(id) ? NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "مطلب پیدا نشد." }, { status: 404 });
}

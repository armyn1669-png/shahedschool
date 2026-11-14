import { NextResponse } from "next/server";
import { database, ensureDatabaseReady, registerStudent } from "@/lib/auth-db";
import { dbGet } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : ""; }
function digits(value: string) { return value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))); }

export async function POST(request: Request) {
  try {
    await ensureDatabaseReady();
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 400 }); }
    const fullName = clean(body.fullName, 100), nationalId = digits(clean(body.nationalId, 10)), phone = digits(clean(body.phone, 20)), grade = clean(body.grade, 20), fieldOfStudy = clean(body.fieldOfStudy, 60), branch = clean(body.branch, 4), guardianName = clean(body.guardianName, 100), guardianPhone = digits(clean(body.guardianPhone, 20)), address = clean(body.address, 500);
    if (fullName.length < 3 || !/^\d{10}$/.test(nationalId) || !/^\+?\d[\d ()-]{8,14}$/.test(phone) || !["دهم", "یازدهم", "دوازدهم"].includes(grade) || !["ریاضی و فیزیک", "علوم تجربی", "علوم انسانی", "هنر", "سایر"].includes(fieldOfStudy) || !/^([۱-۹]|[1-9])$/.test(branch) || guardianName.length < 3 || !/^\+?\d[\d ()-]{8,14}$/.test(guardianPhone) || address.length < 8) {
      return NextResponse.json({ error: "بعضی اطلاعات کامل یا معتبر نیستند. کد ملی باید ۱۰ رقم باشد." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const hourlyLimit = Math.max(1, Number(process.env.REGISTRATION_HOURLY_LIMIT || 600));
    const count = ((await dbGet(await database(), "SELECT COUNT(*) AS count FROM student_registrations WHERE created_at > ?", Date.now() - 60 * 60 * 1000)) as { count: number }).count;
    if (count >= hourlyLimit) return NextResponse.json({ error: "تعداد درخواست‌های ثبت‌نام در این ساعت به سقف رسیده است. کمی بعد تلاش کنید." }, { status: 429, headers: { "Cache-Control": "no-store" } });
    const result = await registerStudent({ fullName, nationalId, phone, grade, fieldOfStudy, branch, guardianName, guardianPhone, address });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ ok: true, id: result.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Student registration failed:", error);
    return NextResponse.json({ error: "ذخیرهٔ درخواست انجام نشد. سرور را یک‌بار متوقف و دوباره اجرا کنید؛ اگر خطا ماند، متن خطای قرمز در پنجرهٔ سرور را بفرستید." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

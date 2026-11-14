import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { academicDatabase } from "@/lib/academic-db";
import { dbGet, dbAll } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await currentUser();
  if (!actor || actor.role !== "admin") return NextResponse.json({ error: "دسترسی فقط برای مدیر مدرسه است." }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "شناسهٔ دانش‌آموز معتبر نیست." }, { status: 400 });
  const db = await academicDatabase();
  const student = (await dbGet(db, `SELECT r.id,r.full_name AS fullName,r.national_id AS nationalId,r.phone,r.grade,r.field_of_study AS fieldOfStudy,r.branch,r.guardian_name AS guardianName,r.guardian_phone AS guardianPhone,r.address,r.status,r.created_at AS createdAt,u.username,u.status AS accountStatus FROM student_registrations r LEFT JOIN users u ON u.id=r.account_user_id WHERE r.id=?`, id));
  if (!student) return NextResponse.json({ error: "پروندهٔ دانش‌آموز پیدا نشد." }, { status: 404 });
  const attendance = (await dbAll(db, `SELECT a.id,a.attendance_date AS date,a.status,a.note,c.title AS course,c.grade,c.branch FROM attendance a JOIN courses c ON c.id=a.course_id WHERE a.registration_id=? ORDER BY a.attendance_date DESC,c.period`, id));
  const grades = (await dbAll(db, `SELECT g.id,g.title,g.score,g.max_score AS maxScore,g.created_at AS createdAt,c.title AS course,u.display_name AS teacherName FROM grades g JOIN courses c ON c.id=g.course_id JOIN users u ON u.id=g.recorded_by WHERE g.registration_id=? ORDER BY g.created_at DESC`, id));
  return NextResponse.json({ student, attendance, grades }, { headers: { "Cache-Control": "no-store" } });
}

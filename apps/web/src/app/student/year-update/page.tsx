import {redirect} from "next/navigation";
import {currentUser} from "@/lib/current-user";
import {studentNeedsYearUpdate,studentProfile} from "@/lib/auth-db";
import {StudentYearUpdateForm} from "@/components/StudentYearUpdateForm";
export const dynamic="force-dynamic";
export default async function StudentYearUpdatePage(){const user=await currentUser();if(!user||user.role!=="student")redirect("/login?role=student");if(!(await studentNeedsYearUpdate(user.id)))redirect("/panel");const profile=await studentProfile(user.id);if(!profile)redirect("/login?role=student");return <main className="auth-page auth-page-student" dir="rtl"><section className="auth-card"><span className="auth-kicker">آغاز سال تحصیلی جدید</span><h1>اطلاعات آموزشی‌ات را به‌روز کن</h1><p>برای ورود به پنل، پایه و کلاس امسال را انتخاب کن. نام، کد ملی و سوابق حساب حفظ می‌شوند.</p><StudentYearUpdateForm profile={profile}/></section></main>}

import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { ensureDatabaseReady } from "@/lib/auth-db";
import { dbGet } from "@/lib/db";

export const metadata = { title: "ورود امن | دبیرستان سید احمد خمینی" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  const db = await ensureDatabaseReady();
  const userCount = ((await dbGet(db, "SELECT COUNT(*) AS count FROM users")) as { count: number }).count;
  const setupUsed = Boolean((await dbGet(db, "SELECT 1 FROM app_settings WHERE setting_key='initial_admin_created'")));
  const showSetup = userCount === 0 && !setupUsed && Boolean(process.env.SCHOOL_SETUP_TOKEN);
  return (
    <main className={`auth-page${role === "student" ? " auth-page-student" : role === "admin" ? " auth-page-admin" : role === "teacher" ? " auth-page-teacher" : ""}`}>
      <div className="auth-top"><Link className="auth-brand" href="/"><span className="brand-seal"><span>س</span></span><span><strong>دبیرستان سید احمد خمینی</strong><small>سامانهٔ یکپارچهٔ آموزشی</small></span></Link><Link className="back-link" href="/">بازگشت به صفحهٔ اصلی <span>←</span></Link></div>
      <section className="auth-layout">
        <div className="auth-card">
          <span className="auth-kicker">خوش آمدید</span>
          <h1>ورود به سامانه</h1>
          <p className="auth-intro">اطلاعات حساب شخصی خود را وارد کنید تا به فضای آموزشی‌تان برسید.</p>
          <LoginForm initialRole={role} />
          {role === "teacher" && <p className="teacher-register-prompt">حساب دبیر ندارید؟ <Link href="/teacher-register">درخواست ساخت حساب دبیر</Link></p>}
          {showSetup && <div className="setup-hint"><span>راه‌اندازی اولیهٔ مدیر</span><Link href="/setup">فقط برای مدیر مجاز</Link></div>}
        </div>
        <aside className="auth-aside">
          <span className="aside-overline">فضای امن مدرسه</span>
          <h2>هر نقش،<br />مسیر آموزشی خودش.</h2>
          <p>دانش‌آموز، دبیر و مدیر با حساب اختصاصی خود به اطلاعات مجاز دسترسی پیدا می‌کنند.</p>
          <div className="aside-rule" />
          <span className="aside-school">دبیرستان سید احمد خمینی</span>
        </aside>
      </section>
      <footer className="auth-footer">ارتباط امن و اختصاصی <span>•</span> دبیرستان سید احمد خمینی</footer>
    </main>
  );
}

import Link from "next/link";
import { FirstAdminForm } from "@/components/FirstAdminForm";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ensureDatabaseReady } from "@/lib/auth-db";
import { dbGet } from "@/lib/db";

export const metadata = { title: "راه‌اندازی حساب مدیر | دبیرستان سید احمد خمینی" };

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const host = (await headers()).get("host")?.split(":")[0]?.replace(/^\[|\]$/g, "").toLowerCase();
  if (process.env.NODE_ENV !== "production" && !["localhost", "127.0.0.1", "::1"].includes(host || "")) redirect("/login");
  const db = await ensureDatabaseReady();
  const users = ((await dbGet(db, "SELECT COUNT(*) AS count FROM users")) as { count: number }).count;
  const setupUsed = Boolean((await dbGet(db, "SELECT 1 FROM app_settings WHERE setting_key='initial_admin_created'")));
  const configured = Boolean(process.env.SCHOOL_SETUP_TOKEN);
  if (users > 0 || setupUsed || !configured) redirect("/login");
  return (
    <main className="auth-page auth-page-admin setup-page">
      <div className="auth-top"><Link className="auth-brand" href="/"><span className="brand-seal"><span>س</span></span><span><strong>دبیرستان سید احمد خمینی</strong><small>راه‌اندازی امن مدرسه</small></span></Link><Link className="back-link" href="/login">رفتن به ورود <span>←</span></Link></div>
      <section className="auth-layout setup-layout">
        <div className="auth-card">
          <span className="auth-kicker">شروع مدیریت سامانه</span>
          <h1>ساخت حساب مدیر</h1>
          <p className="auth-intro">این مرحله فقط یک‌بار انجام می‌شود و نخستین حساب مدیریتی مدرسه را ایجاد می‌کند.</p>
          <FirstAdminForm />
        </div>
        <aside className="auth-aside">
          <span className="aside-overline">پیش از شروع</span>
          <h2>حساب نخست<br />در اختیار شماست.</h2>
          <p>برای امنیت، نخستین حساب مدیر فقط روی این دستگاه و برای همین مدرسه ساخته می‌شود.</p>
          <div className="aside-rule" />
          <span className="aside-school">پس از ایجاد حساب، کد دیگر کار نمی‌کند.</span>
        </aside>
      </section>
      <footer className="auth-footer">راه‌اندازی فقط روی همین نمونهٔ محلی <span>•</span> دبیرستان سید احمد خمینی</footer>
    </main>
  );
}

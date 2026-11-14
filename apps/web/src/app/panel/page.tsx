import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/current-user";
import { roleLabels, studentNeedsYearUpdate } from "@/lib/auth-db";
import { LogoutButton } from "@/components/LogoutButton";
import { RoleDashboard } from "@/components/RoleDashboard";

export const metadata = { title: "پنل کاربری | دبیرستان سید احمد خمینی" };

export default async function PanelPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if(user.role==="student"&&await studentNeedsYearUpdate(user.id))redirect("/student/year-update");
  return (
    <main className={`panel-page panel-page-${user.role}`}>
      <header className="panel-top"><Link className="auth-brand" href="/"><span className="brand-seal"><span>س</span></span><span><strong>دبیرستان سید احمد خمینی</strong><small>سامانهٔ یکپارچهٔ آموزشی</small></span></Link><LogoutButton /></header>
      <section className="panel-welcome">
        <span className="auth-kicker">پنل اختصاصی {user.role === "admin" ? user.adminTitle || roleLabels.admin : roleLabels[user.role]}</span>
        <h1>سلام، {user.displayName}</h1>
        <p>{user.role === "admin" ? user.adminScope === "site" ? "حساب مدیر سایت با دسترسی کامل و امکان مدیریت مدیران، ناظمان و دبیران." : "دسترسی کامل به بخش‌های آموزشی و اجرایی مدرسه." : "ورود شما امن و موفق بود. اطلاعات متناسب با حساب کاربری شما نمایش داده می‌شود."}</p>
        <div className="account-chip"><span className="live-dot" /> حساب فعال <i /> نام کاربری: {user.username}</div>
        <Link className="back-link" href="/">بازگشت به صفحهٔ اصلی <span>←</span></Link>
      </section>
      <RoleDashboard user={user} />
    </main>
  );
}

import Link from "next/link";
import { StudentRegistrationForm } from "@/components/StudentRegistrationForm";

export const metadata = { title: "ثبت‌نام دانش‌آموز | دبیرستان سید احمد خمینی" };

export default function RegisterPage() {
  return <main className="auth-page auth-page-student"><div className="auth-top"><Link className="auth-brand" href="/"><span className="brand-seal"><span>س</span></span><span><strong>دبیرستان سید احمد خمینی</strong><small>ثبت درخواست دانش‌آموز</small></span></Link><Link className="back-link" href="/login?role=student">ورود دانش‌آموز <span>→</span></Link></div><section className="auth-layout register-layout"><div className="auth-card"><span className="auth-kicker">پذیرش و تشکیل پرونده</span><h1>ثبت‌نام دانش‌آموز</h1><p className="auth-intro">اطلاعات را دقیق وارد کنید. درخواست پس از بررسی مدیر در فهرست دانش‌آموزان قرار می‌گیرد.</p><StudentRegistrationForm /></div><aside className="auth-aside"><span className="aside-overline">فرم ثبت‌نام امن</span><h2>یک شروع تازه<br />برای مسیر یادگیری.</h2><p>اطلاعات واردشده فقط برای بررسی و تشکیل پروندهٔ آموزشی مدرسه استفاده می‌شود.</p><div className="aside-rule"/><span className="aside-school">دبیرستان سید احمد خمینی</span></aside></section><footer className="auth-footer">ثبت‌نام به معنی تأیید نهایی پذیرش نیست <span>•</span> مدیر مدرسه درخواست را بررسی می‌کند</footer></main>;
}

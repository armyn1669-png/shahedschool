import Link from "next/link";

export const metadata = { title: "صفحه پیدا نشد | دبیرستان سید احمد خمینی" };

export default function NotFound() {
  return (
    <main className="auth-page" dir="rtl">
      <div className="auth-layout" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
        <div className="auth-card" style={{ textAlign: "center" }}>
          <span className="auth-kicker">خطای ۴۰۴</span>
          <h1>این صفحه پیدا نشد</h1>
          <p className="auth-intro">نشانی صفحه درست نیست یا صفحه جابه‌جا شده است. از پیوند زیر به صفحهٔ اصلی برگردید.</p>
          <Link className="auth-submit" href="/">بازگشت به صفحهٔ اصلی</Link>
        </div>
      </div>
    </main>
  );
}

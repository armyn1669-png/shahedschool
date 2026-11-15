"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="auth-page" dir="rtl">
      <div className="auth-layout" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
        <div className="auth-card" style={{ textAlign: "center" }}>
          <span className="auth-kicker">خطا در سامانه</span>
          <h1>مشکلی پیش آمد</h1>
          <p className="auth-intro">صفحه بارگیری نشد. دوباره تلاش کنید؛ اگر خطا ادامه داشت، به مدیر مدرسه خبر بدهید.</p>
          <button className="auth-submit" type="button" onClick={() => reset()}>تلاش دوباره</button>
          <p className="auth-footnote"><Link href="/">بازگشت به صفحهٔ اصلی</Link></p>
        </div>
      </div>
    </main>
  );
}

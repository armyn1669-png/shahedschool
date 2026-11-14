"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function FirstAdminForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupToken: form.get("setupToken"), username: form.get("username"), password: form.get("password"), phone: form.get("phone") }),
      });
      const data = await response.json();
      if (!response.ok) setError(data.error || "راه‌اندازی انجام نشد.");
      else router.push("/panel");
    } catch {
      setError("ارتباط برقرار نشد. اتصال محلی را بررسی کنید.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label className="field-label" htmlFor="setupToken">کد محرمانهٔ راه‌اندازی</label>
      <input className="auth-input" id="setupToken" name="setupToken" autoComplete="off" required maxLength={256} placeholder="کد موجود در فایل محلی پروژه" />
      <label className="field-label" htmlFor="username">نام کاربری مدیر</label>
      <input className="auth-input" id="username" name="username" autoComplete="username" required minLength={3} maxLength={32} placeholder="۳ تا ۳۲ حرف یا عدد" />
      <label className="field-label" htmlFor="adminPhone">شمارهٔ همراه مدیر</label>
      <input className="auth-input" id="adminPhone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={30} placeholder="۰۹۱۲۱۲۳۴۵۶۷" />
      <label className="field-label" htmlFor="password">گذرواژهٔ مدیر</label>
      <input className="auth-input" id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} placeholder="حداقل ۱۲ نویسه" />
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="auth-submit" disabled={busy} type="submit">{busy ? "در حال ساخت حساب…" : "ساخت حساب مدیر"}<span aria-hidden="true">←</span></button>
      <p className="auth-footnote">کد محرمانه در <bdi>apps/web/.env.local</bdi> است. حساب مدیر فقط یک‌بار ساخته می‌شود؛ کد را در اختیار دیگران نگذارید.</p>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const roles = [
  ["student", "دانش‌آموز"],
  ["teacher", "دبیر"],
  ["admin", "مدیر مدرسه"],
  ["guardian", "والد یا سرپرست"],
] as const;

export function LoginForm({ initialRole }: { initialRole?: string }) {
  const router = useRouter();
  const [role, setRole] = useState(roles.some(([key]) => key === initialRole) ? initialRole! : "student");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password"), role, rememberMe }),
      });
      const data = await response.json();
      if (!response.ok) setError(data.error || "ورود انجام نشد. دوباره تلاش کنید.");
      else router.push("/panel");
    } catch {
      setError("ارتباط برقرار نشد. اتصال محلی را بررسی کنید.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label className="field-label" htmlFor="role">پنل کاربری</label>
      <select className="auth-input" id="role" value={role} onChange={(event) => setRole(event.target.value)}>
        {roles.map(([key, label]) => <option value={key} key={key}>{label}</option>)}
      </select>
      <label className="field-label" htmlFor="username">نام کاربری</label>
      <input className="auth-input" id="username" name="username" autoComplete="username" required maxLength={64} placeholder={role === "student" ? "کد ملی ۱۰ رقمی" : role === "guardian" ? "شمارهٔ همراه سرپرست" : "نام کاربری خود را وارد کنید"} />
      {role === "student" && <small className="auth-hint">نام کاربری دانش‌آموز، کد ملی ۱۰ رقمی اوست.</small>}
      {role === "guardian" && <small className="auth-hint">والد با شمارهٔ همراهی وارد می‌شود که مدیر مدرسه برای او ثبت کرده است.</small>}
      <label className="field-label" htmlFor="password">گذرواژه</label>
      <div className="password-field">
        <input className="auth-input" id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={128} placeholder="گذرواژهٔ حساب شما" />
        <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "پنهان‌کردن گذرواژه" : "نمایش گذرواژه"}>{showPassword ? "پنهان‌کردن" : "نمایش"}</button>
      </div>
      <label className="remember-me"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /><span>من را به خاطر بسپار <small>(ورود ۳۰ روزه در همین مرورگر؛ بدون تیک، نشست پس از ۸ ساعت پایان می‌یابد)</small></span></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="auth-submit" disabled={busy} type="submit">{busy ? "در حال بررسی…" : "ورود امن به سامانه"}<span aria-hidden="true">→</span></button>
      <p className="auth-footnote">گذرواژهٔ شما فقط برای بررسی ورود استفاده می‌شود؛ در مرورگر ذخیره نمی‌شود و به هیچ‌کس نشان داده نمی‌شود.</p>
      {role === "student" && <p className="auth-switch">حساب دانش‌آموز ندارید؟ <a href="/register">ثبت‌نام دانش‌آموز</a></p>}
      {role === "teacher" && <p className="auth-switch">حساب دبیر ندارید؟ <a href="/teacher-register">درخواست ساخت حساب دبیر</a></p>}
    </form>
  );
}

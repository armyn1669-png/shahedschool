"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const roles = [
  ["admin", "مدیر مدرسه"],
  ["teacher", "دبیر"],
  ["student", "دانش‌آموز"],
] as const;

export function LoginForm({ initialRole }: { initialRole?: string }) {
  const router = useRouter();
  const [role, setRole] = useState(roles.some(([key]) => key === initialRole) ? initialRole! : "admin");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password"), role }),
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
      <input className="auth-input" id="username" name="username" autoComplete="username" required maxLength={64} placeholder="نام کاربری خود را وارد کنید" />
      <label className="field-label" htmlFor="password">گذرواژه</label>
      <input className="auth-input" id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} placeholder="گذرواژهٔ حساب شما" />
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="auth-submit" disabled={busy} type="submit">{busy ? "در حال بررسی…" : "ورود امن به سامانه"}<span aria-hidden="true">←</span></button>
      <p className="auth-footnote">گذرواژهٔ شما به‌صورت امن بررسی می‌شود و در مرورگر ذخیره نمی‌شود.</p>
    </form>
  );
}

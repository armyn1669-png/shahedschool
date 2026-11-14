"use client";

import { FormEvent, useEffect, useState } from "react";

type Profile = { displayName: string; phone: string };

export function StaffContactCard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/staff/profile", { cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setProfile(data.profile); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "پروندهٔ کارکنان بارگیری نشد.")); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const phone = String(new FormData(event.currentTarget).get("phone") || "");
    try {
      const response = await fetch("/api/staff/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "شماره ذخیره نشد.");
      setProfile((value) => value ? { ...value, phone: data.phone } : value); setNotice("شمارهٔ همراه ذخیره شد.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "شماره ذخیره نشد."); }
    finally { setBusy(false); }
  }
  return <section className="staff-contact-card"><div><span className="auth-kicker">اطلاعات تماس کارکنان</span><h2>شمارهٔ همراه</h2><p>{profile ? `شمارهٔ ${profile.displayName} برای پروندهٔ مدرسه ثبت می‌شود.` : "شمارهٔ تماس کاری خود را ثبت کنید."}</p></div>{profile && <form onSubmit={submit}><label>شمارهٔ همراه<input className="auth-input" type="tel" inputMode="tel" autoComplete="tel" name="phone" required maxLength={30} defaultValue={profile.phone} placeholder="۰۹۱۲۱۲۳۴۵۶۷" /></label><button className="auth-submit" disabled={busy}>{busy ? "در حال ذخیره…" : profile.phone ? "به‌روزرسانی شماره" : "ثبت شماره"}</button></form>}{notice && <p className="academic-notice" role="status">{notice}</p>}{error && <p className="auth-error" role="alert">{error}</p>}</section>;
}

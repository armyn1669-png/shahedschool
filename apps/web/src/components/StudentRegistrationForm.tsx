"use client";

import { FormEvent, useState } from "react";

export function StudentRegistrationForm() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(["fullName", "nationalId", "phone", "grade", "fieldOfStudy", "branch", "guardianName", "guardianPhone", "address"].map((key) => [key, form.get(key)]));
    try {
      const response = await fetch("/api/students/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setError(data.error || "ثبت درخواست انجام نشد."); else setSuccess(true);
    } catch { setError("به سرور محلی وصل نشدم. مطمئن شو پنجرهٔ اجرای برنامه باز است و نشانی صفحه با localhost:3000 شروع می‌شود."); }
    finally { setBusy(false); }
  }

  if (success) return <div className="registration-success" role="status"><span>✓</span><h2>درخواست ثبت شد</h2><p>درخواست شما برای بررسی به مدیر مدرسه رسید. پس از تأیید مدیر، اطلاعات ورود به شما داده می‌شود. تا قبل از تأیید، ورود فعال نیست.</p></div>;

  return <form className="auth-form registration-form" onSubmit={submit}>
    <label className="field-label" htmlFor="fullName">نام و نام خانوادگی دانش‌آموز <span className="required-star">*</span></label><input className="auth-input" id="fullName" name="fullName" required minLength={3} maxLength={100} autoComplete="name" placeholder="نام کامل" />
    <div className="form-pair"><div><label className="field-label" htmlFor="nationalId">کد ملی دانش‌آموز <span className="required-star">*</span></label><input className="auth-input" id="nationalId" name="nationalId" required inputMode="numeric" minLength={10} maxLength={10} pattern="[0-9۰-۹]{10}" placeholder="۱۰ رقم، فقط عدد" /><small className="auth-hint">کد ملی ۱۰ رقمی؛ با عددهای فارسی یا انگلیسی.</small></div><div><label className="field-label" htmlFor="phone">شماره تلفن دانش‌آموز <span className="required-star">*</span></label><input className="auth-input" id="phone" name="phone" required inputMode="tel" maxLength={15} pattern="[0-9۰-۹+() -]{10,15}" placeholder="۰۹۱۲۱۲۳۴۵۶۷" /></div></div>
    <div className="form-pair"><div><label className="field-label" htmlFor="grade">پایهٔ تحصیلی <span className="required-star">*</span></label><select className="auth-input" id="grade" name="grade" required defaultValue=""><option value="" disabled>انتخاب کنید</option><option>دهم</option><option>یازدهم</option><option>دوازدهم</option></select></div><div><label className="field-label" htmlFor="fieldOfStudy">رشتهٔ تحصیلی <span className="required-star">*</span></label><select className="auth-input" id="fieldOfStudy" name="fieldOfStudy" required defaultValue=""><option value="" disabled>انتخاب کنید</option><option>ریاضی و فیزیک</option><option>علوم تجربی</option><option>علوم انسانی</option><option>هنر</option><option>سایر</option></select></div></div>
    <label className="field-label" htmlFor="branch">شعبهٔ تحصیلی <span className="required-star">*</span></label><select className="auth-input" id="branch" name="branch" required defaultValue=""><option value="" disabled>انتخاب کنید</option>{["۱","۲","۳","۴"].map((branch)=><option key={branch} value={branch}>شعبهٔ {branch}</option>)}</select>
    <label className="field-label" htmlFor="guardianName">نام و نام خانوادگی والد یا سرپرست <span className="required-star">*</span></label><input className="auth-input" id="guardianName" name="guardianName" required maxLength={100} placeholder="نام سرپرست" />
    <label className="field-label" htmlFor="guardianPhone">شماره تلفن والد یا سرپرست <span className="required-star">*</span></label><input className="auth-input" id="guardianPhone" name="guardianPhone" required inputMode="tel" maxLength={15} pattern="[0-9۰-۹+() -]{10,15}" placeholder="شماره‌ای که در دسترس باشد" />
    <label className="field-label" htmlFor="address">نشانی محل سکونت <span className="required-star">*</span></label><textarea className="auth-input registration-address" id="address" name="address" required minLength={8} maxLength={500} placeholder="شهر، خیابان و نشانی کامل" />
    {error && <p className="auth-error" role="alert">{error}</p>}<button className="auth-submit" disabled={busy} type="submit">{busy ? "در حال ثبت درخواست…" : "ارسال درخواست ثبت‌نام"}<span aria-hidden="true">→</span></button><p className="auth-footnote">پس از تأیید مدیر، اطلاعات ورود به شما داده می‌شود.</p>
  </form>;
}

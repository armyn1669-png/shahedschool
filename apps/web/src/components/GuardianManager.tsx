"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Child = { id: number; fullName: string; grade: string; fieldOfStudy: string; branch: string; status: string };
type Guardian = { id: number; username: string; displayName: string; phone: string; status: string; children: Child[] };
type Student = { id: number; fullName: string; grade: string; fieldOfStudy: string; branch: string; status: string };

async function readJson(r: Response) { try { return await r.json(); } catch { return { error: "پاسخ سرور قابل‌خواندن نیست." }; } }

// Admin-only: create a guardian account (login = guardian mobile number) and
// link it to an approved student, so the guardian panel shows that child.
export function GuardianManager() {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedGuardian, setSelectedGuardian] = useState(0);
  const [selectedStudent, setSelectedStudent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [g, s] = await Promise.all([fetch("/api/admin/guardians", { cache: "no-store" }), fetch("/api/admin/students", { cache: "no-store" })]);
    const gd = await readJson(g), sd = await readJson(s);
    if (!g.ok) throw new Error(gd.error || "فهرست والدین بارگیری نشد.");
    setGuardians(gd.guardians || []);
    if (s.ok) setStudents((sd.students || []).filter((x: Student) => x.status === "approved"));
  }, []);
  useEffect(() => { load().catch((e) => setError(e instanceof Error ? e.message : "بارگیری انجام نشد.")); }, [load]);

  async function createGuardian(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    const form = event.currentTarget, values = new FormData(form);
    try {
      const r = await fetch("/api/admin/guardians", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", displayName: values.get("displayName"), phone: values.get("phone"), password: values.get("password") }) });
      const d = await readJson(r);
      if (!r.ok) throw new Error(d.error || "ساخت حساب والد انجام نشد.");
      form.reset();
      setNotice(`حساب والد ساخته شد؛ نام کاربری ورود، شمارهٔ همراه ${d.username} است.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "ساخت حساب انجام نشد."); } finally { setBusy(false); }
  }

  async function link(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGuardian || !selectedStudent) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/admin/guardians", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link", guardianUserId: selectedGuardian, registrationId: selectedStudent }) });
      const d = await readJson(r);
      if (!r.ok) throw new Error(d.error || "پیوند انجام نشد.");
      setNotice("پروندهٔ فرزند به حساب والد متصل شد.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "پیوند انجام نشد."); } finally { setBusy(false); }
  }

  async function unlink(guardianId: number, registrationId: number) {
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/admin/guardians", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unlink", guardianUserId: guardianId, registrationId }) });
      const d = await readJson(r);
      if (!r.ok) throw new Error(d.error || "حذف پیوند انجام نشد.");
      setNotice("پیوند والد و دانش‌آموز حذف شد.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "حذف پیوند انجام نشد."); } finally { setBusy(false); }
  }

  return <section className="guardian-manager">
    <div className="academic-head"><div><span className="auth-kicker">حساب‌های والدین</span><h2>والدین و پیوند به فرزند</h2><p>برای هر سرپرست یک حساب بسازید و آن را به پروندهٔ تأییدشدهٔ فرزندش پیوند دهید تا پنل والد، نمره‌ها و حضور و غیاب را نشان دهد.</p></div></div>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {notice && <p className="academic-notice" role="status">{notice}</p>}
    <form className="auth-form" onSubmit={createGuardian}>
      <h3>ساخت حساب والد</h3>
      <label className="field-label">نام و نام خانوادگی سرپرست <span className="required-star">*</span><input className="auth-input" name="displayName" required maxLength={100} /></label>
      <label className="field-label">شمارهٔ همراه سرپرست (نام کاربری ورود) <span className="required-star">*</span><input className="auth-input" name="phone" required inputMode="tel" maxLength={15} placeholder="۰۹۱۲۱۲۳۴۵۶۷" /></label>
      <label className="field-label">گذرواژه (حداقل ۱۲ نویسه) <span className="required-star">*</span><input className="auth-input" name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
      <button className="auth-submit" disabled={busy}>{busy ? "در حال ساخت…" : "ساخت حساب والد"}</button>
    </form>
    <form className="auth-form" onSubmit={link}>
      <h3>پیوند والد به فرزند</h3>
      <label className="field-label">حساب والد<select className="auth-input" value={selectedGuardian || ""} onChange={(e) => setSelectedGuardian(Number(e.target.value))} required><option value="" disabled>انتخاب والد</option>{guardians.map((g) => <option key={g.id} value={g.id}>{g.displayName} · {g.phone}</option>)}</select></label>
      <label className="field-label">دانش‌آموز تأییدشده<select className="auth-input" value={selectedStudent || ""} onChange={(e) => setSelectedStudent(Number(e.target.value))} required><option value="" disabled>انتخاب دانش‌آموز</option>{students.map((s) => <option key={s.id} value={s.id}>{s.fullName} · {s.grade} {s.fieldOfStudy} · شعبهٔ {s.branch}</option>)}</select></label>
      <button className="auth-submit" disabled={busy || !selectedGuardian || !selectedStudent}>پیوند به فرزند</button>
    </form>
    <div className="guardian-list">
      {guardians.length ? guardians.map((g) => <article key={g.id}>
        <div><strong>{g.displayName}</strong><span> · نام کاربری: <bdi>{g.username}</bdi> · {g.status === "active" ? "فعال" : "غیرفعال"}</span></div>
        {g.children.length ? g.children.map((c) => <p key={c.id}>{c.fullName} · {c.grade} {c.fieldOfStudy} · شعبهٔ {c.branch} <button type="button" disabled={busy} onClick={() => void unlink(g.id, c.id)}>حذف پیوند</button></p>) : <small>هنوز به فرزندی پیوند نخورده است.</small>}
      </article>) : <small>هنوز حساب والدی ساخته نشده است.</small>}
    </div>
  </section>;
}

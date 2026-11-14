"use client";

import { useEffect, useState } from "react";

type Period = { period: number; startTime: string; endTime: string };
export function BellScheduleManager() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch("/api/academics/bell-schedule", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setPeriods(body.periods || []);
  }
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  async function save(period: Period) {
    setError(""); setNotice(""); setBusy(true);
    try {
      const response = await fetch("/api/academics/bell-schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "period", ...period }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setNotice(`ساعت زنگ ${period.period} ذخیره شد.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "ذخیرهٔ ساعت زنگ انجام نشد."); }
    finally { setBusy(false); }
  }
  return <section className="bell-schedule-manager"><div className="academic-head"><div><span className="auth-kicker">تنظیمات مشترک مدرسه</span><h2>ساعت زنگ‌های مدرسه</h2><p>ساعت شروع و پایان زنگ‌ها برای برنامهٔ درسی و حضور و غیاب مدرسه ثبت می‌شود.</p></div></div>
    {error && <p className="auth-error" role="alert">{error}</p>}{notice && <p className="academic-notice" role="status">{notice}</p>}
    <div className="bell-period-grid">{periods.filter(period => period.period <= 4).map(period => <article key={period.period}><h3>زنگ {period.period}</h3>
      <label>ساعت شروع<input className="auth-input" type="time" value={period.startTime} onChange={event => setPeriods(rows => rows.map(row => row.period === period.period ? { ...row, startTime: event.target.value } : row))} /></label>
      <label>ساعت پایان<input className="auth-input" type="time" value={period.endTime} onChange={event => setPeriods(rows => rows.map(row => row.period === period.period ? { ...row, endTime: event.target.value } : row))} /></label>
      <button disabled={busy} onClick={() => void save(period)}>ذخیرهٔ زنگ</button>
    </article>)}</div>
  </section>;
}

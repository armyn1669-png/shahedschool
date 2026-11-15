"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { SchoolRole } from "@/lib/auth-db";
import { LiveClassRoom } from "@/components/LiveClassRoom";
import { OnlineAttendanceReview } from "@/components/OnlineAttendanceReview";

type Course = { id: number; title: string; grade: string; fieldOfStudy: string; branch: string; weekday: string; period: number; weekPattern: string; startTime: string; teacherName: string };
type OnlineClass = { id: number; courseId: number; title: string; description: string; startsAt: string; startsAtEpoch: number; endsAt: string; endsAtEpoch: number; actualStartedAt: string | null; actualEndedAt: string | null; extensionMinutes: number; status: "scheduled" | "live" | "ended" | "cancelled"; courseTitle: string; grade: string; fieldOfStudy: string; branch: string; teacherName: string };
type Snapshot = { classes: OnlineClass[]; courses: Course[] };
const dateTime = new Intl.DateTimeFormat("fa-IR", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Tehran" });
const timeOnly = new Intl.DateTimeFormat("fa-IR", { timeStyle: "short", timeZone: "Asia/Tehran" });
function statusLabel(status: OnlineClass["status"]) { return ({ scheduled: "زمان‌بندی‌شده", live: "در حال برگزاری", ended: "پایان‌یافته", cancelled: "لغوشده" })[status]; }

export function OnlineClassroom({ role, focusCourseId }: { role: SchoolRole; focusCourseId?: number }) {
  const [data, setData] = useState<Snapshot>({ classes: [], courses: [] });
  const [selectedCourseId, setSelectedCourseId] = useState(focusCourseId || 0);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [room, setRoom] = useState<OnlineClass | null>(null);
  const [postClassAttendanceId,setPostClassAttendanceId]=useState(0);
  const roomRef = useRef<OnlineClass | null>(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const refresh = useCallback(async () => {
    const response = await fetch("/api/online-classes", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "کلاس‌های آنلاین بارگیری نشدند.");
    setData(body);
    if (roomRef.current) { const activeRoom=roomRef.current;const updatedRoom = body.classes.find((item: OnlineClass) => item.id === activeRoom.id); if (!updatedRoom || updatedRoom.status !== "live") { if(role==="teacher"&&updatedRoom?.status==="ended")setPostClassAttendanceId(activeRoom.id);roomRef.current = null; setRoom(null); setNotice("جلسه پایان یافت و گزارش آن برای مدیر ثبت شد."); } }
    // No auto-join: a live class only shows the banner + join button; the
    // student chooses when to enter.
    if (role === "teacher" && !selectedCourseId && body.courses?.[0]) setSelectedCourseId(body.courses[0].id);
  }, [role, selectedCourseId]);
  useEffect(() => {
    refresh().catch(e => setError(e instanceof Error ? e.message : "بارگیری انجام نشد."));
    const clock = setInterval(() => setClockNow(Date.now()), 5000);
    const poll = setInterval(() => refresh().catch(() => {}), 10000);
    return () => { clearInterval(clock); clearInterval(poll); };
  }, [refresh]);
  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => {
    const match = window.location.hash.match(/^#online-class-(\d+)$/);
    if (match) { const item = data.classes.find(candidate => candidate.id === Number(match[1])); if (item?.status === "live") setRoom(item); }
  }, [data.classes]);
  async function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = Object.fromEntries(["courseId", "title", "description", "durationMinutes"].map(key => [key, form.get(key)]));
      const response = await fetch("/api/online-classes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "جلسه ساخته نشد.");
      setNotice(`کلاس شروع شد؛ مدت جلسه ${durationMinutes} دقیقه است.`);
      if (result.session) setRoom(result.session as OnlineClass);
      formElement.reset(); setDurationMinutes(60); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "ذخیرهٔ جلسه انجام نشد."); }
    finally { setBusy(false); }
  }
  async function changeStatus(item: OnlineClass, status: "ended" | "cancelled") {
    setError(""); setNotice("");
    try {
      const response = await fetch("/api/online-classes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setNotice("وضعیت جلسه به‌روزرسانی شد.");
      if (status === "ended" || status === "cancelled") setRoom(current => current?.id === item.id ? null : current);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "تغییر وضعیت انجام نشد."); }
  }
  async function extend(item: OnlineClass) {
    setError(""); setNotice("");
    try {
      const response = await fetch("/api/online-classes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, action: "extend" }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setNotice("جلسه فقط یک‌بار و به‌مدت ۵ دقیقه تمدید شد."); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "تمدید جلسه انجام نشد."); }
  }
  async function hideHistory(item:OnlineClass){if(!window.confirm("این سابقه برای دانش‌آموزان و دبیران پنهان می‌شود اما در پنل مدیر باقی می‌ماند. ادامه می‌دهید؟"))return;setBusy(true);setError("");try{const response=await fetch(`/api/online-classes/${item.id}/history`,{method:"DELETE"});const body=await response.json();if(!response.ok)throw new Error(body.error);setNotice("سابقه از فهرست دبیران و دانش‌آموزان حذف شد و برای مدیر باقی ماند.");await refresh()}catch(e){setError(e instanceof Error?e.message:"حذف سابقه انجام نشد.")}finally{setBusy(false)}}
  const visibleClasses = data.classes;
  const liveClass = role === "student" ? visibleClasses.find(item => item.status === "live") : undefined;
  return <section id="online-classroom" className="online-classroom">
    <div className="academic-head"><div><span className="auth-kicker">یادگیری از راه دور</span><h2>کلاس‌های آنلاین</h2><p>{role === "teacher" ? "کلاس را هر زمان آماده‌اید شروع کنید و فقط مدت آن را تعیین کنید." : role === "admin" ? "گزارش کلاس‌های آنلاین دبیران و زمان واقعی برگزاری را ببینید." : "جلسه‌های آنلاین کلاس‌های خود را ببینید و پس از شروع دبیر وارد شوید."}</p></div><span className="academic-mark">◉</span></div>
    {error && <p className="auth-error" role="alert">{error}</p>}{notice && <p className="academic-notice" role="status">{notice}</p>}
    {role === "teacher" && <form className="online-session-form" onSubmit={schedule}><h3>شروع کلاس آنلاین</h3>{data.courses.length ? <div className="academic-form-grid">
      <label>کلاس<select className="auth-input" name="courseId" value={selectedCourseId || ""} required onChange={event => setSelectedCourseId(Number(event.target.value))}><option value="" disabled>انتخاب کلاس</option>{data.courses.map(course => <option key={course.id} value={course.id}>{course.grade} · {course.title} · شعبهٔ {course.branch} · زنگ {course.period} · {course.weekday}</option>)}</select></label>
      <label>عنوان جلسه<input className="auth-input" name="title" required maxLength={120} placeholder="مثلاً حل تمرین فصل دوم" /></label>
      <label>مدت جلسه (دقیقه)<input className="auth-input" name="durationMinutes" type="number" min={10} max={120} step={5} required value={durationMinutes} onChange={event => setDurationMinutes(Number(event.target.value))} /></label>
      <label className="online-description-field">توضیح برای دانش‌آموزان<textarea className="auth-input" name="description" rows={3} maxLength={700} placeholder="موضوع جلسه یا منابع موردنیاز" /></label>
    </div> : <p className="registry-empty">ابتدا مدیر باید درس و دبیر را در برنامهٔ هفتگی ثبت کند.</p>}
      <p className="online-provider-note">مدت جلسه را بین ۱۰ تا ۱۲۰ دقیقه تعیین کنید؛ با زدن دکمه کلاس همان لحظه شروع می‌شود و دانش‌آموزان می‌توانند وارد شوند.</p>
      <button className="auth-submit online-start-button" disabled={busy || !data.courses.length}>{busy ? "در حال شروع…" : "▶ شروع کلاس آنلاین"}</button>
    </form>}
    {role === "admin" && <p className="online-provider-note">این بخش گزارش جلسه‌ها را ثبت می‌کند؛ دبیر با شروع کلاس، زمان شروع و پایان واقعی را در فهرست می‌گذارد.</p>}
    {role === "admin" && <p><a className="online-join-button" href="/api/online-classes/export">دانلود نشست‌ها (CSV اکسل)</a></p>}
    {role==="teacher"&&postClassAttendanceId>0&&<div className="post-class-attendance"><OnlineAttendanceReview courseId={focusCourseId} initialSessionId={postClassAttendanceId} onDone={()=>{setPostClassAttendanceId(0);setNotice("گزارش غیبت و تأخیر برای بررسی مدیر ارسال شد.")}}/><button type="button" onClick={()=>setPostClassAttendanceId(0)}>بعداً بررسی می‌کنم</button></div>}
    {role === "student" && liveClass && !room && <div className="online-live-banner" role="status"><span className="online-live-dot" aria-hidden="true" /><div><strong>کلاس زنده است</strong><span>{liveClass.title} · {liveClass.courseTitle} · دبیر: {liveClass.teacherName}</span></div><button type="button" className="online-live-join" onClick={() => setRoom(liveClass)}>ورود به کلاس</button></div>}
    <div className="online-session-list"><div className="online-list-heading"><h3>{role === "student" ? "جلسه‌های کلاس من" : role === "teacher" ? "جلسه‌های کلاس‌های شما" : "جلسه‌های آنلاین"}</h3><span>{visibleClasses.length} جلسه</span>{role === "teacher" && <button type="button" onClick={() => refresh().catch(e => setError(e instanceof Error ? e.message : "بارگیری انجام نشد."))}>به‌روزرسانی فهرست</button>}</div>
      {visibleClasses.length ? visibleClasses.map(item => <article id={`online-session-${item.id}`} className={`online-session-card ${item.status}`} key={item.id}>
        <div className="online-session-status"><span className={`online-status-dot ${item.status}`} />{statusLabel(item.status)}{item.status === "live" && <i>اکنون</i>}</div>
        <h3>{item.title}</h3><div className="online-session-course">{item.courseTitle} · {item.grade} · شعبهٔ {item.branch} · {item.fieldOfStudy}</div>
        <p className="online-session-time">{dateTime.format(new Date(item.startsAtEpoch))} · {item.status === "live" ? `پایان پیش‌بینی‌شده ${timeOnly.format(new Date(item.endsAtEpoch))}` : `مدت ${Math.max(1, Math.round((item.endsAtEpoch - item.startsAtEpoch) / 60000))} دقیقه`}</p>
        {role === "admin" && item.actualStartedAt && <small className="online-session-actual-time">دبیر {item.teacherName}: شروع {timeOnly.format(new Date(item.actualStartedAt))}{item.actualEndedAt ? ` · پایان ${timeOnly.format(new Date(item.actualEndedAt))}` : " · در حال برگزاری"}</small>}
        {role !== "teacher" && <small className="online-session-teacher">دبیر: {item.teacherName}</small>}{item.description && <p className="online-session-description">{item.description}</p>}
        {role === "teacher" && item.status === "live" && item.extensionMinutes === 0 && item.endsAtEpoch - clockNow <= 600000 && item.endsAtEpoch - clockNow > 0 && <div className="online-session-overtime"><strong>هشدار: تا پایان زمان انتخابی {Math.max(1, Math.ceil((item.endsAtEpoch - clockNow) / 60000))} دقیقه مانده است.</strong><span>اگر کلاس ادامه دارد، می‌توانید پایان آن را به‌دلخواه عقب بیندازید.</span><button disabled={busy} onClick={() => void extend(item)}>افزودن ۵ دقیقه</button></div>}
        <div className="online-session-actions">{item.status === "live" && <button className="online-join-button online-join-button--big" onClick={() => setRoom(item)}>{role === "admin" ? "مشاهدهٔ کلاس" : "ورود به کلاس"} <span>↗</span></button>}
          {role === "teacher" && item.status === "live" && <button onClick={() => void changeStatus(item, "ended")}>پایان جلسه</button>}
          {role === "teacher" && item.status === "ended" && <><button onClick={() => { window.location.hash = "teacher-attendance"; }}>بازبینی حضور این جلسه</button><a className="online-join-button" href={`/api/online-classes/${item.id}/classroom/export`}>دریافت یادداشت‌ها و گزارش تخته</a><button disabled={busy} onClick={()=>void hideHistory(item)}>حذف سابقه از فهرست من و دانش‌آموزان</button></>}
        </div>
      </article>) : <div className="registry-empty"><span>◉</span><strong>جلسه‌ای ثبت نشده است</strong><small>{role === "teacher" ? "پس از انتخاب کلاس و زمان مجاز، جلسه را از فرم بالا بسازید." : role === "admin" ? "جلسه‌ای ثبت نشده؛ جلسات را دبیران شروع می‌کنند." : "وقتی دبیر جلسه را ثبت کند، اینجا نمایش داده می‌شود."}</small></div>}
    </div>
    {room && <LiveClassRoom classId={room.id} title={room.title} courseTitle={room.courseTitle} role={role} onClose={() => { roomRef.current = null; setRoom(null); }} onEnded={() => { void refresh(); setPostClassAttendanceId(room.id); setNotice("جلسه برای مدیر ثبت شد؛ غیبت‌ها را بررسی و در صورت تأیید ارسال کنید."); }} />}
  </section>;
}

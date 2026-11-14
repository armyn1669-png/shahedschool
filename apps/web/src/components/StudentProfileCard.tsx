"use client";

import { useEffect, useState } from "react";

type Profile = { fullName: string; nationalId: string; phone: string; grade: string; fieldOfStudy: string; branch:string; guardianName: string; guardianPhone: string };

export function StudentProfileCard() {
  const [profile, setProfile] = useState<Profile | null>(null); const [error, setError] = useState("");
  useEffect(() => { fetch("/api/student/profile", { cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setProfile(data.profile); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "پرونده بارگیری نشد.")); }, []);
  if (error) return <p className="auth-error" role="alert">{error}</p>;
  if (!profile) return <div className="profile-loading">در حال دریافت پروندهٔ شما…</div>;
  return <section className="student-profile"><span className="auth-kicker">پروندهٔ آموزشی</span><h2>{profile.fullName}</h2><div className="profile-fields"><div><small>پایه، رشته و شعبه</small><strong>{profile.grade} · {profile.fieldOfStudy} · شعبهٔ {profile.branch}</strong></div><div><small>کد ملی</small><bdi>{profile.nationalId}</bdi></div><div><small>شمارهٔ همراه</small><bdi>{profile.phone}</bdi></div><div><small>والد یا سرپرست</small><strong>{profile.guardianName}</strong></div><div><small>شمارهٔ سرپرست</small><bdi>{profile.guardianPhone}</bdi></div></div><p className="profile-note">پرونده توسط مدیر مدرسه تأیید شده است.</p></section>;
}

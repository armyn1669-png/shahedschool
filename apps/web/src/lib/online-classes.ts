import type { AuthenticatedUser } from "@/lib/auth-db";
import { EgressClient, EgressStatus, EncodedFileOutput, EncodedFileType, EncodingOptionsPreset, RoomServiceClient, S3Upload } from "livekit-server-sdk";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Db } from "@/lib/db";
import { dbGet, dbAll, dbRun, dbExec, dbTransaction } from "@/lib/db";

const expiryTimers=new Map<number,ReturnType<typeof setTimeout>>();
function schoolNow(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:process.env.SCHOOL_TIME_ZONE||"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());const get=(name:string)=>parts.find(x=>x.type===name)?.value||"00";return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;}
function addLocalMinutes(value:string,minutes:number){return new Date(Date.parse(`${value}:00Z`)+minutes*60_000).toISOString().slice(0,16);}
function localEpoch(value:string){const [day,time]=value.split("T"),[year,month,date]=day.split("-").map(Number),[hour,minute]=time.split(":").map(Number);const guess=Date.UTC(year,month-1,date,hour,minute);const parts=new Intl.DateTimeFormat("en-CA",{timeZone:process.env.SCHOOL_TIME_ZONE||"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(guess));const get=(name:string)=>Number(parts.find(x=>x.type===name)?.value||0);return guess-(Date.UTC(get("year"),get("month")-1,get("day"),get("hour"),get("minute"))-guess);}
function addClassDuration(value:string,minutes:number){const [date,time]=value.split("T"),[hour,minute]=time.split(":").map(Number),total=hour*60+minute+minutes;if(total>=24*60)return null;return `${date}T${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;}
async function closeLiveKitRoom(id:number){const url=process.env.LIVEKIT_URL?.trim(),key=process.env.LIVEKIT_API_KEY?.trim(),secret=process.env.LIVEKIT_API_SECRET?.trim();if(!url||!key||!secret)return;try{const host=url.replace(/^ws:/i,"http:").replace(/^wss:/i,"https:");await new RoomServiceClient(host,key,secret).deleteRoom(`school-class-${id}`);}catch{/* Room may already be closed. */}}

export async function onlineDb() {
  const { academicDatabase } = await import("@/lib/academic-db");
  const db = await academicDatabase();
  (await dbExec(db, `CREATE TABLE IF NOT EXISTS online_classes(
    id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','live','ended','cancelled')),
    actual_started_at TEXT, actual_ended_at TEXT, extension_minutes INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
  ); CREATE TABLE IF NOT EXISTS online_class_bans(online_class_id INTEGER NOT NULL REFERENCES online_classes(id) ON DELETE CASCADE,registration_id INTEGER NOT NULL REFERENCES student_registrations(id) ON DELETE CASCADE,banned_by INTEGER NOT NULL REFERENCES users(id),banned_at INTEGER NOT NULL,PRIMARY KEY(online_class_id,registration_id));CREATE TABLE IF NOT EXISTS online_class_admin_only_history(online_class_id INTEGER PRIMARY KEY REFERENCES online_classes(id) ON DELETE CASCADE,hidden_by INTEGER NOT NULL REFERENCES users(id),hidden_at INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS online_class_polls(id INTEGER PRIMARY KEY, online_class_id INTEGER NOT NULL REFERENCES online_classes(id) ON DELETE CASCADE, question TEXT NOT NULL, options_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')), created_by INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS online_class_poll_votes(poll_id INTEGER NOT NULL REFERENCES online_class_polls(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id), option_index INTEGER NOT NULL, voted_at INTEGER NOT NULL, PRIMARY KEY(poll_id,user_id));CREATE TABLE IF NOT EXISTS online_class_admissions(online_class_id INTEGER NOT NULL REFERENCES online_classes(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','admitted','denied')), decided_by INTEGER REFERENCES users(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(online_class_id,user_id));CREATE TABLE IF NOT EXISTS online_class_recordings(id INTEGER PRIMARY KEY, online_class_id INTEGER NOT NULL REFERENCES online_classes(id) ON DELETE CASCADE, egress_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'recording' CHECK(status IN ('recording','stopped','completed','failed')), file_path TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER, duration_seconds INTEGER, created_by INTEGER NOT NULL REFERENCES users(id));CREATE INDEX IF NOT EXISTS online_class_recordings_class_idx ON online_class_recordings(online_class_id,started_at);CREATE INDEX IF NOT EXISTS online_classes_course_start_idx ON online_classes(course_id,starts_at);`));
  const columns=new Set(((await dbAll(db, "PRAGMA table_info(online_classes)")) as Array<{name:string}>).map(x=>x.name));
  // join_url was never read anywhere (invite links use the #online-class-<id> hash); drop it when present.
  if(columns.has("join_url")){try{(await dbExec(db, "ALTER TABLE online_classes DROP COLUMN join_url"));}catch{/* Older SQLite cannot drop a column; the unused column is harmless. */}}
  if(!columns.has("actual_started_at"))(await dbExec(db, "ALTER TABLE online_classes ADD COLUMN actual_started_at TEXT"));
  if(!columns.has("actual_ended_at"))(await dbExec(db, "ALTER TABLE online_classes ADD COLUMN actual_ended_at TEXT"));
  if(!columns.has("extension_minutes"))(await dbExec(db, "ALTER TABLE online_classes ADD COLUMN extension_minutes INTEGER NOT NULL DEFAULT 0"));
  return db;
}

async function finishExpiredClass(id:number){const db=await onlineDb();const now=schoolNow();const row=(await dbGet(db, "SELECT ends_at AS endsAt,extension_minutes AS extensionMinutes,status FROM online_classes WHERE id=?", id)) as {endsAt:string;extensionMinutes:number;status:string}|undefined;if(!row||row.status!=="live")return false;const actualEnd=addLocalMinutes(row.endsAt,row.extensionMinutes);if(now<actualEnd){scheduleExpiry(id,actualEnd);return false;}const endedAt=new Date().toISOString();const result=(await dbRun(db, "UPDATE online_classes SET status='ended',actual_ended_at=COALESCE(actual_ended_at,?) WHERE id=? AND status='live'", endedAt,id));if(!result.changes)return false;const epoch=Date.now();(await dbRun(db, "UPDATE online_attendance SET total_seconds=total_seconds+MAX(0,MIN(75,CAST((?-last_seen_at)/1000 AS INTEGER))),last_seen_at=?,status='teacher_review' WHERE online_class_id=? AND status='collecting'", epoch,epoch,id));const timer=expiryTimers.get(id);if(timer)clearTimeout(timer);expiryTimers.delete(id);await closeLiveKitRoom(id);return true;}
function scheduleExpiry(id:number,localEnd:string){const prior=expiryTimers.get(id);if(prior)clearTimeout(prior);const delay=Math.max(0,localEpoch(localEnd)-Date.now());const timer=setTimeout(()=>{void finishExpiredClass(id);},Math.min(delay,2_147_000_000));expiryTimers.set(id,timer);}
async function reconcileExpiredClasses(){const db=await onlineDb();const now=schoolNow();const scheduled=(await dbAll(db, "SELECT id,ends_at AS endsAt FROM online_classes WHERE status='scheduled'")) as Array<{id:number;endsAt:string}>;for(const row of scheduled)if(now>=row.endsAt)(await dbRun(db, "UPDATE online_classes SET status='ended' WHERE id=? AND status='scheduled'", row.id));const rows=(await dbAll(db, "SELECT id,ends_at AS endsAt,extension_minutes AS extensionMinutes FROM online_classes WHERE status='live'")) as Array<{id:number;endsAt:string;extensionMinutes:number}>;for(const row of rows){const end=addLocalMinutes(row.endsAt,row.extensionMinutes);if(now>=end)await finishExpiredClass(row.id);else if(!expiryTimers.has(row.id))scheduleExpiry(row.id,end);}}

export async function onlineClassesSnapshot(user: AuthenticatedUser) {
  const db = await onlineDb();
  await reconcileExpiredClasses();
  const base = `SELECT o.id,o.course_id AS courseId,o.title,o.description,o.starts_at AS startsAt,o.ends_at AS endsAt,o.actual_started_at AS actualStartedAt,o.actual_ended_at AS actualEndedAt,o.extension_minutes AS extensionMinutes,o.status,
    c.title AS courseTitle,c.grade,c.field_of_study AS fieldOfStudy,c.branch,c.period,u.display_name AS teacherName
    FROM online_classes o JOIN courses c ON c.id=o.course_id JOIN users u ON u.id=c.teacher_id`;
  let rows:any[]=[];
  if (user.role === "admin") rows=(await dbAll(db, `${base} ORDER BY o.starts_at DESC LIMIT 200`)) as any[];
  else if (user.role === "teacher") rows=(await dbAll(db, `${base} WHERE c.teacher_id=? AND NOT EXISTS(SELECT 1 FROM online_class_admin_only_history h WHERE h.online_class_id=o.id) ORDER BY o.starts_at DESC LIMIT 200`, user.id)) as any[];
  else if (user.role === "student") rows=(await dbAll(db, `${base} JOIN student_registrations r ON r.account_user_id=? AND r.status='approved'
    WHERE c.grade=r.grade AND c.field_of_study=r.field_of_study AND c.branch=r.branch AND NOT EXISTS(SELECT 1 FROM online_class_admin_only_history h WHERE h.online_class_id=o.id) ORDER BY o.starts_at DESC LIMIT 200`, user.id)) as any[];
  return rows.map(row=>{const end=addLocalMinutes(row.endsAt,row.extensionMinutes);return {...row,endsAt:end,startsAtEpoch:localEpoch(row.startsAt),endsAtEpoch:localEpoch(end)};});
}

export async function hideOnlineClassHistory(actor:AuthenticatedUser,id:number){const db=await onlineDb();if(actor.role!=="teacher")return {ok:false as const,error:"فقط دبیر می‌تواند سابقهٔ کلاس خودش را پنهان کند."};const row=(await dbGet(db, "SELECT o.status,c.teacher_id AS teacherId FROM online_classes o JOIN courses c ON c.id=o.course_id WHERE o.id=?", id)) as {status:string;teacherId:number}|undefined;if(!row||row.teacherId!==actor.id||row.status!=="ended")return {ok:false as const,error:"فقط سابقهٔ پایان‌یافتهٔ کلاس خودتان قابل حذف از فهرست است."};(await dbRun(db, "INSERT OR IGNORE INTO online_class_admin_only_history(online_class_id,hidden_by,hidden_at) VALUES(?,?,?)", id,actor.id,Date.now()));return {ok:true as const};}

export async function createOnlineClass(actor: AuthenticatedUser, input: { courseId: number; title: string; description: string; durationMinutes: number }) {
  const db = await onlineDb();
  if (actor.role !== "teacher") return { ok: false as const, error: "فقط دبیر می‌تواند جلسهٔ کلاس خود را بسازد." };
  const course = (await dbGet(db, "SELECT id FROM courses WHERE id=? AND teacher_id=?", input.courseId, actor.id));
  if (!course) return { ok: false as const, error: "این کلاس به حساب دبیر شما اختصاص ندارد." };
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 10 || input.durationMinutes > 120) return { ok: false as const, error: "مدت کلاس باید بین ۱۰ تا ۱۲۰ دقیقه باشد." };
  const startsAt = schoolNow();
  const endsAt = addClassDuration(startsAt,input.durationMinutes);
  if (!endsAt) return { ok: false as const, error: "پایان کلاس نباید از نیمه‌شب عبور کند." };
  const actualStartedAt = new Date().toISOString();
  try {
    const id = await dbTransaction(async (tx) => {
      const result = await dbRun(tx, "INSERT INTO online_classes(course_id,title,description,starts_at,ends_at,status,actual_started_at,created_by,created_at) VALUES(?,?,?,?,?,'live',?,?,?)", input.courseId,input.title.trim(),input.description.trim(),startsAt,endsAt,actualStartedAt,actor.id,Date.now());
      return Number(result.lastInsertRowid);
    });
    scheduleExpiry(id,endsAt);
    return { ok: true as const, id, startsAt, endsAt };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "ثبت جلسه انجام نشد." };
  }
}

export async function onlineClassAccess(user: AuthenticatedUser, id: number) {
  const db = await onlineDb();
  await reconcileExpiredClasses();
  const item = (await dbGet(db, `SELECT o.id,o.course_id AS courseId,o.title,o.status,o.starts_at AS startsAt,o.ends_at AS endsAt,o.extension_minutes AS extensionMinutes,c.teacher_id AS teacherId,c.grade,c.field_of_study AS fieldOfStudy,c.branch
    FROM online_classes o JOIN courses c ON c.id=o.course_id WHERE o.id=?`, id)) as {id:number;courseId:number;title:string;status:string;startsAt:string;endsAt:string;extensionMinutes:number;teacherId:number;grade:string;fieldOfStudy:string;branch:string}|undefined;
  if (!item || ["ended","cancelled"].includes(item.status)) return null;
  if (item.status !== "live") return null;
  if(item.status==="live"&&schoolNow()>=addLocalMinutes(item.endsAt,item.extensionMinutes)){await finishExpiredClass(id);return null;}
  // Admins may watch a live class read-only; the LiveKit token enforces it too.
  if (user.role === "admin") return {...item, viewOnly: true};
  if (user.role === "teacher" && user.id === item.teacherId) return item;
  if (user.role !== "student") return null;
  const enrolled = (await dbGet(db, `SELECT id FROM student_registrations WHERE account_user_id=? AND status='approved' AND grade=? AND field_of_study=? AND branch=?`, user.id,item.grade,item.fieldOfStudy,item.branch)) as {id:number}|undefined;
  if(!enrolled||(await dbGet(db, "SELECT 1 FROM online_class_bans WHERE online_class_id=? AND registration_id=?", id,enrolled.id)))return null;return item;
}

export async function onlineClassBans(actor:AuthenticatedUser,id:number){const db=await onlineDb();const item=(await dbGet(db, "SELECT c.teacher_id AS teacherId FROM online_classes o JOIN courses c ON c.id=o.course_id WHERE o.id=?", id)) as {teacherId:number}|undefined;if(!item||actor.role!=="teacher"||actor.id!==item.teacherId)return null;return (await dbAll(db, "SELECT b.registration_id AS registrationId,r.full_name AS fullName,b.banned_at AS bannedAt FROM online_class_bans b JOIN student_registrations r ON r.id=b.registration_id WHERE b.online_class_id=? ORDER BY r.full_name", id));}

export async function updateOnlineClass(actor: AuthenticatedUser, id: number, status: "ended" | "cancelled") {
  const db = await onlineDb();
  const now=new Date().toISOString();
  const apply=async (where:string,args:any[])=>status==="ended"
      ? (await dbRun(db, `UPDATE online_classes SET status='ended',actual_ended_at=?,ends_at=?,extension_minutes=0 WHERE id=? AND status='live' ${where}`, now,schoolNow(),id,...args))
      : (await dbRun(db, `UPDATE online_classes SET status='cancelled' WHERE id=? ${where}`, id,...args));
  const result = actor.role === "teacher"
      ? await apply("AND EXISTS(SELECT 1 FROM courses c WHERE c.id=online_classes.course_id AND c.teacher_id=?)",[actor.id])
      : { changes: 0 };
  if(status==="ended"&&result.changes>0){const endedAt=Date.now();(await dbRun(db, "UPDATE online_attendance SET total_seconds=total_seconds+MAX(0,MIN(75,CAST((?-last_seen_at)/1000 AS INTEGER))),last_seen_at=?,status='teacher_review' WHERE online_class_id=? AND status='collecting'", endedAt,endedAt,id));const timer=expiryTimers.get(id);if(timer)clearTimeout(timer);expiryTimers.delete(id);await closeLiveKitRoom(id);}
  return result.changes > 0;
}

export async function extendOnlineClass(actor:AuthenticatedUser,id:number){const db=await onlineDb();if(actor.role!=="teacher")return {ok:false as const,error:"فقط دبیر همان کلاس می‌تواند زمان جلسه را تغییر دهد."};const row=(await dbGet(db, "SELECT o.ends_at AS endsAt,o.extension_minutes AS extensionMinutes,o.status,c.teacher_id AS teacherId FROM online_classes o JOIN courses c ON c.id=o.course_id WHERE o.id=?", id)) as {endsAt:string;extensionMinutes:number;status:string;teacherId:number}|undefined;if(!row||row.status!=="live"||row.teacherId!==actor.id)return {ok:false as const,error:"جلسهٔ زندهٔ متعلق به شما پیدا نشد."};if(row.extensionMinutes>0)return {ok:false as const,error:"تمدید جلسه فقط یک‌بار و به‌مدت ۵ دقیقه ممکن است."};const currentEnd=addLocalMinutes(row.endsAt,row.extensionMinutes);if(schoolNow()>=currentEnd)return {ok:false as const,error:"زمان انتخاب‌شده گذشته است؛ کلاس پایان یافته."};const totalExtension=row.extensionMinutes+5;const changed=(await dbRun(db, "UPDATE online_classes SET extension_minutes=? WHERE id=? AND status='live'", totalExtension,id));if(changed.changes!==1)return {ok:false as const,error:"تغییر زمان ثبت نشد؛ جلسه پایان یافته است."};const endsAt=addLocalMinutes(row.endsAt,totalExtension);scheduleExpiry(id,endsAt);return {ok:true as const,endsAt,extensionMinutes:totalExtension};}


export type OnlineClassAdmissionStatus = "pending" | "admitted" | "denied";
export async function onlineClassTeacherId(classId:number){const db=await onlineDb();const row=(await dbGet(db, "SELECT c.teacher_id AS teacherId FROM online_classes o JOIN courses c ON c.id=o.course_id WHERE o.id=?", classId)) as {teacherId:number}|undefined;return row?.teacherId;}
export async function getOnlineClassAdmission(classId:number,userId:number){const db=await onlineDb();return (await dbGet(db, "SELECT status FROM online_class_admissions WHERE online_class_id=? AND user_id=?", classId,userId)) as {status:OnlineClassAdmissionStatus}|undefined;}
export async function ensureOnlineClassAdmission(classId:number,userId:number){const db=await onlineDb();const now=Date.now();(await dbRun(db, "INSERT OR IGNORE INTO online_class_admissions(online_class_id,user_id,status,created_at,updated_at) VALUES(?,?,'pending',?,?)", classId,userId,now,now));return "pending" as const;}
export async function listOnlineClassAdmissions(classId:number){const db=await onlineDb();return (await dbAll(db, "SELECT a.user_id AS userId,u.display_name AS displayName,a.status,a.created_at AS requestedAt FROM online_class_admissions a JOIN users u ON u.id=a.user_id WHERE a.online_class_id=? AND a.status IN ('pending','denied') ORDER BY a.created_at", classId)) as Array<{userId:number;displayName:string;status:string;requestedAt:number}>;}
export async function decideOnlineClassAdmission(actor:AuthenticatedUser,classId:number,userId:number,status:"admitted"|"denied"){const db=await onlineDb();const teacherId=await onlineClassTeacherId(classId);if(!teacherId||actor.role!=="teacher"||actor.id!==teacherId)return null;const now=Date.now();if(status==="admitted"){(await dbRun(db, "INSERT INTO online_class_admissions(online_class_id,user_id,status,decided_by,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(online_class_id,user_id) DO UPDATE SET status=excluded.status,decided_by=excluded.decided_by,updated_at=excluded.updated_at", classId,userId,status,actor.id,now,now));return status;}const changed=(await dbRun(db, "UPDATE online_class_admissions SET status='denied',decided_by=?,updated_at=? WHERE online_class_id=? AND user_id=?", actor.id,now,classId,userId));return changed.changes>0?status:null;}
export type OnlineClassPollView={id:number;question:string;options:string[];status:"open"|"closed";counts:number[];totalVotes:number;myVote:number|null};
export async function listOnlineClassPolls(classId:number,userId:number):Promise<OnlineClassPollView[]>{const db=await onlineDb();const polls=(await dbAll(db, "SELECT id,question,options_json AS optionsJson,status FROM online_class_polls WHERE online_class_id=? ORDER BY id", classId)) as Array<{id:number;question:string;optionsJson:string;status:"open"|"closed"}>;const counts=(await dbAll(db, "SELECT poll_id AS pollId,option_index AS optionIndex,COUNT(*) AS count FROM online_class_poll_votes WHERE poll_id IN (SELECT id FROM online_class_polls WHERE online_class_id=?) GROUP BY poll_id,option_index", classId)) as Array<{pollId:number;optionIndex:number;count:number}>;const mine=(await dbAll(db, "SELECT poll_id AS pollId,option_index AS optionIndex FROM online_class_poll_votes WHERE user_id=? AND poll_id IN (SELECT id FROM online_class_polls WHERE online_class_id=?)", userId,classId)) as Array<{pollId:number;optionIndex:number}>;return polls.map(p=>{let list:string[]=[];try{const parsed=JSON.parse(p.optionsJson);if(Array.isArray(parsed))list=parsed.map(x=>String(x));}catch{list=[];}const arr=new Array<number>(list.length).fill(0);for(const c of counts)if(c.pollId===p.id&&c.optionIndex>=0&&c.optionIndex<arr.length)arr[c.optionIndex]=Number(c.count);return {id:p.id,question:p.question,options:list,status:p.status,counts:arr,totalVotes:arr.reduce((a,b)=>a+b,0),myVote:mine.find(m=>m.pollId===p.id)?.optionIndex??null};});}
export async function createOnlineClassPoll(actor:AuthenticatedUser,classId:number,question:string,options:string[]){const db=await onlineDb();const teacherId=await onlineClassTeacherId(classId);if(!teacherId||actor.role!=="teacher"||actor.id!==teacherId)return null;const result=await dbRun(db, "INSERT INTO online_class_polls(online_class_id,question,options_json,created_by,created_at) VALUES(?,?,?,?,?)", classId,question,JSON.stringify(options),actor.id,Date.now());return {id:Number(result.lastInsertRowid),question,options,status:"open" as const};}
export async function voteOnlineClassPoll(classId:number,pollId:number,userId:number,optionIndex:number,role?:string){if(role==="admin")return {ok:false as const,error:"مدیر فقط می‌تواند نتایج نظرسنجی را ببیند و رأی نمی‌دهد."};const db=await onlineDb();const poll=(await dbGet(db, "SELECT id,options_json AS optionsJson,status FROM online_class_polls WHERE id=? AND online_class_id=?", pollId,classId)) as {id:number;optionsJson:string;status:string}|undefined;if(!poll)return {ok:false as const,error:"نظرسنجی پیدا نشد."};if(poll.status!=="open")return {ok:false as const,error:"این نظرسنجی بسته شده است."};let count=0;try{const parsed=JSON.parse(poll.optionsJson);count=Array.isArray(parsed)?parsed.length:0;}catch{count=0;}if(!Number.isInteger(optionIndex)||optionIndex<0||optionIndex>=count)return {ok:false as const,error:"گزینهٔ انتخاب‌شده معتبر نیست."};(await dbRun(db, "INSERT INTO online_class_poll_votes(poll_id,user_id,option_index,voted_at) VALUES(?,?,?,?) ON CONFLICT(poll_id,user_id) DO UPDATE SET option_index=excluded.option_index,voted_at=excluded.voted_at", pollId,userId,optionIndex,Date.now()));return {ok:true as const};}
export async function closeOnlineClassPoll(actor:AuthenticatedUser,classId:number,pollId:number){const db=await onlineDb();const teacherId=await onlineClassTeacherId(classId);if(!teacherId||actor.role!=="teacher"||actor.id!==teacherId)return false;const changed=await dbRun(db, "UPDATE online_class_polls SET status='closed' WHERE id=? AND online_class_id=? AND status='open'", pollId,classId);return changed.changes>0;}

// ---- Class recordings (LiveKit RoomCompositeEgress -> Backblaze B2, free tiers) ----
export type OnlineClassRecordingStatus = "recording" | "stopped" | "completed" | "failed";
export type OnlineClassRecordingView = {id:number;onlineClassId:number;classTitle:string;egressId:string;status:OnlineClassRecordingStatus;filePath:string;startedAt:number;endedAt:number|null;durationSeconds:number|null;downloadUrl?:string};
type RecordingEnv = {ok:true;host:string;key:string;secret:string;bucket:string;endpoint:string;accessKey:string;appKey:string;region:string} | {ok:false;error:string};
function recordingEnv():RecordingEnv{
  const url=process.env.LIVEKIT_URL?.trim(),key=process.env.LIVEKIT_API_KEY?.trim(),secret=process.env.LIVEKIT_API_SECRET?.trim();
  const bucket=process.env.B2_BUCKET?.trim(),endpoint=process.env.B2_ENDPOINT?.trim(),accessKey=process.env.B2_KEY_ID?.trim(),appKey=process.env.B2_APPLICATION_KEY?.trim();
  if(!url||!key||!secret)return {ok:false,error:"کلید LiveKit در تنظیمات سرور نیست؛ ضبط در دسترس نیست."};
  if([url,key,secret].some(v=>/devkey|placeholder/i.test(v)))return {ok:false,error:"کلید LiveKit هنوز مقدار نمونه است؛ ضبط در دسترس نیست."};
  if(!bucket||!endpoint||!accessKey||!appKey)return {ok:false,error:"تنظیمات فضای ذخیره‌سازی ضبط (B2) در سرور کامل نیست."};
  const region=process.env.B2_REGION?.trim()||endpoint.match(/s3\.([a-z0-9-]+)\.backblazeb2/i)?.[1]||"us-east-005";
  return {ok:true,host:url.replace(/^ws:/i,"http:").replace(/^wss:/i,"https:"),key,secret,bucket,endpoint,accessKey,appKey,region};
}
const FREE_EGRESS_MONTHLY_SECONDS = 3300; // LiveKit Build free plan: 60 egress min/month; stop 5 min early.
async function monthlyRecordingSeconds(db:Db):Promise<number>{
  const nowLocal=schoolNow();
  const monthStart=localEpoch(nowLocal.slice(0,7)+"-01T00:00");
  const rows=(await dbAll(db,"SELECT started_at AS startedAt,ended_at AS endedAt,duration_seconds AS durationSeconds,status FROM online_class_recordings WHERE started_at>=?",monthStart)) as Array<{startedAt:number;endedAt:number|null;durationSeconds:number|null;status:string}>;
  let total=0;const now=Date.now();
  for(const r of rows){if(r.status==="recording")total+=Math.max(0,Math.floor((now-r.startedAt)/1000));else if(r.durationSeconds)total+=r.durationSeconds;}
  return total;
}
function recordingErrorMessage(error:unknown):string{
  const msg=error instanceof Error?error.message:"";
  if(/quota|limit[_\s-]?reached|insufficient|exceed/i.test(msg))return "سهمیهٔ رایگان ضبط LiveKit برای این ماه تمام شده است (۶۰ دقیقه در ماه).";
  return "شروع ضبط انجام نشد؛ اتصال به LiveKit برقرار نشد.";
}
async function refreshRecordingRow(env:Extract<RecordingEnv,{ok:true}>,row:{id:number;egressId:string;startedAt:number}):Promise<void>{
  if(!row.egressId||row.egressId.startsWith("pending-"))return;
  try{
    const client=new EgressClient(env.host,env.key,env.secret);
    const list=await client.listEgress({egressId:row.egressId});
    const info=list[0];if(!info)return;
    const db=await onlineDb();
    if(info.status===EgressStatus.EGRESS_COMPLETE||info.status===EgressStatus.EGRESS_FAILED||info.status===EgressStatus.EGRESS_ABORTED||info.status===EgressStatus.EGRESS_LIMIT_REACHED){
      const endedAt=info.endedAt?Math.round(Number(info.endedAt)/1e6):Date.now();
      const duration=info.fileResults?.[0]?.duration?Math.round(Number(info.fileResults[0].duration)/1e9):Math.max(0,Math.round((endedAt-row.startedAt)/1000));
      const filePath=info.fileResults?.[0]?.location||undefined;
      const status=info.status===EgressStatus.EGRESS_COMPLETE?"completed":"failed";
      if(filePath)await dbRun(db,"UPDATE online_class_recordings SET status=?,ended_at=?,duration_seconds=?,file_path=? WHERE id=? AND status='recording'",status,endedAt,duration,filePath,row.id);
      else await dbRun(db,"UPDATE online_class_recordings SET status=?,ended_at=?,duration_seconds=? WHERE id=? AND status='recording'",status,endedAt,duration,row.id);
    }
  }catch{/* Refresh is best-effort; the row stays 'recording' until the next list. */}
}
export async function startOnlineClassRecording(actor:AuthenticatedUser,classId:number){
  const db=await onlineDb();
  const teacherId=await onlineClassTeacherId(classId);
  if(!teacherId||actor.role!=="teacher"||actor.id!==teacherId)return {ok:false as const,error:"فقط دبیر همان کلاس می‌تواند ضبط را شروع کند."};
  const live=await onlineClassAccess(actor,classId);
  if(!live)return {ok:false as const,error:"جلسهٔ زنده‌ای برای این کلاس در حال برگزاری نیست."};
  const active=(await dbGet(db,"SELECT id FROM online_class_recordings WHERE online_class_id=? AND status='recording'",classId)) as {id:number}|undefined;
  if(active)return {ok:false as const,error:"ضبط این کلاس در حال انجام است."};
  const env=recordingEnv();if(!env.ok)return {ok:false as const,error:env.error};
  const concurrent=(await dbGet(db,"SELECT COUNT(*) AS n FROM online_class_recordings WHERE status='recording'")) as {n:number}|undefined;
  if(Number(concurrent?.n||0)>=2)return {ok:false as const,error:"هم‌زمان فقط ۲ ضبط ممکن است؛ ابتدا یک ضبط را متوقف کنید."};
  if((await monthlyRecordingSeconds(db))>=FREE_EGRESS_MONTHLY_SECONDS)return {ok:false as const,error:"سهمیهٔ رایگان ضبط این ماه (۶۰ دقیقه) تقریباً تمام شده است."};
  const startedAt=Date.now();
  const tehranDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(startedAt));
  const filePath=`recordings/class-${classId}/${tehranDate}-${startedAt}.mp4`;
  const inserted=await dbRun(db,"INSERT INTO online_class_recordings(online_class_id,egress_id,status,file_path,started_at,created_by) VALUES(?,?,'recording',?,?,?)",classId,`pending-${classId}-${startedAt}`,filePath,startedAt,actor.id);
  const recordingId=Number(inserted.lastInsertRowid);
  try{
    const client=new EgressClient(env.host,env.key,env.secret);
    const output=new EncodedFileOutput({fileType:EncodedFileType.MP4,filepath:filePath,output:{case:"s3",value:new S3Upload({accessKey:env.accessKey,secret:env.appKey,region:env.region,endpoint:env.endpoint,bucket:env.bucket,forcePathStyle:false})}});
    const info=await client.startRoomCompositeEgress(`school-class-${classId}`,output,{encodingOptions:EncodingOptionsPreset.H264_720P_30});
    await dbRun(db,"UPDATE online_class_recordings SET egress_id=? WHERE id=?",info.egressId,recordingId);
    return {ok:true as const,recordingId,egressId:info.egressId,startedAt,filePath};
  }catch(error){
    await dbRun(db,"UPDATE online_class_recordings SET status='failed',ended_at=? WHERE id=?",Date.now(),recordingId);
    return {ok:false as const,error:recordingErrorMessage(error)};
  }
}
export async function stopOnlineClassRecording(actor:AuthenticatedUser,classId:number){
  const db=await onlineDb();
  const teacherId=await onlineClassTeacherId(classId);
  if(!teacherId||actor.role!=="teacher"||actor.id!==teacherId)return {ok:false as const,error:"فقط دبیر همان کلاس می‌تواند ضبط را متوقف کند."};
  const row=(await dbGet(db,"SELECT id,egress_id AS egressId,started_at AS startedAt FROM online_class_recordings WHERE online_class_id=? AND status='recording' ORDER BY started_at DESC",classId)) as {id:number;egressId:string;startedAt:number}|undefined;
  if(!row)return {ok:false as const,error:"ضبط فعالی برای این کلاس نیست."};
  const env=recordingEnv();if(!env.ok)return {ok:false as const,error:env.error};
  const client=new EgressClient(env.host,env.key,env.secret);
  try{
    const info=await client.stopEgress(row.egressId);
    const endedAt=info.endedAt?Math.round(Number(info.endedAt)/1e6):Date.now();
    const duration=Math.max(0,Math.round((endedAt-row.startedAt)/1000));
    await dbRun(db,"UPDATE online_class_recordings SET status='stopped',ended_at=?,duration_seconds=? WHERE id=? AND status='recording'",endedAt,duration,row.id);
    return {ok:true as const,durationSeconds:duration};
  }catch{
    // Egress may already have ended (room closed): read its final state instead.
    try{
      const list=await client.listEgress({egressId:row.egressId});
      const info=list[0];
      if(info&&(info.status===EgressStatus.EGRESS_COMPLETE||info.status===EgressStatus.EGRESS_FAILED||info.status===EgressStatus.EGRESS_ABORTED)){
        const endedAt=info.endedAt?Math.round(Number(info.endedAt)/1e6):Date.now();
        const duration=Math.max(0,Math.round((endedAt-row.startedAt)/1000));
        await dbRun(db,"UPDATE online_class_recordings SET status=?,ended_at=?,duration_seconds=? WHERE id=? AND status='recording'",info.status===EgressStatus.EGRESS_COMPLETE?"completed":"failed",endedAt,duration,row.id);
        return {ok:true as const,durationSeconds:duration};
      }
    }catch{/* fall through */}
    await dbRun(db,"UPDATE online_class_recordings SET status='stopped',ended_at=?,duration_seconds=? WHERE id=? AND status='recording'",Date.now(),Math.max(0,Math.round((Date.now()-row.startedAt)/1000)),row.id);
    return {ok:true as const,durationSeconds:Math.max(0,Math.round((Date.now()-row.startedAt)/1000))};
  }
}
export async function listOnlineClassRecordings(actor:AuthenticatedUser,classId?:number):Promise<OnlineClassRecordingView[]>{
  const db=await onlineDb();
  const env=recordingEnv();
  const where=actor.role==="admin"?"":"AND EXISTS(SELECT 1 FROM online_classes o JOIN courses c ON c.id=o.course_id WHERE o.id=r.online_class_id AND c.teacher_id=?)";
  const args:any[]=actor.role==="admin"?[]:[actor.id];
  if(classId){args.unshift(classId);}
  const rows=(await dbAll(db,`SELECT r.id,r.online_class_id AS onlineClassId,o.title AS classTitle,r.egress_id AS egressId,r.status,r.file_path AS filePath,r.started_at AS startedAt,r.ended_at AS endedAt,r.duration_seconds AS durationSeconds FROM online_class_recordings r JOIN online_classes o ON o.id=r.online_class_id ${classId?"WHERE r.online_class_id=?":"WHERE 1=1"} ${where} ORDER BY r.started_at DESC LIMIT 100`,...args)) as Array<{id:number;onlineClassId:number;classTitle:string;egressId:string;status:OnlineClassRecordingStatus;filePath:string;startedAt:number;endedAt:number|null;durationSeconds:number|null}>;
  if(env.ok){
    for(const row of rows)if(row.status==="recording")await refreshRecordingRow(env,row);
    const fresh=(await dbAll(db,`SELECT r.id,r.online_class_id AS onlineClassId,o.title AS classTitle,r.egress_id AS egressId,r.status,r.file_path AS filePath,r.started_at AS startedAt,r.ended_at AS endedAt,r.duration_seconds AS durationSeconds FROM online_class_recordings r JOIN online_classes o ON o.id=r.online_class_id ${classId?"WHERE r.online_class_id=?":"WHERE 1=1"} ${where} ORDER BY r.started_at DESC LIMIT 100`,...args)) as typeof rows;
    return fresh.map(r=>({...r,status:r.status as OnlineClassRecordingStatus}));
  }
  return rows.map(r=>({...r,status:r.status as OnlineClassRecordingStatus}));
}
export async function recordingDownloadUrl(actor:AuthenticatedUser,recordingId:number):Promise<{ok:true;url:string;filePath:string}|{ok:false;error:string}>{
  const db=await onlineDb();
  const row=(await dbGet(db,"SELECT r.id,r.file_path AS filePath,r.status,c.teacher_id AS teacherId FROM online_class_recordings r JOIN online_classes o ON o.id=r.online_class_id JOIN courses c ON c.id=o.course_id WHERE r.id=?",recordingId)) as {id:number;filePath:string;status:string;teacherId:number}|undefined;
  if(!row)return {ok:false,error:"ضبط پیدا نشد."};
  if(actor.role!=="admin"&&!(actor.role==="teacher"&&actor.id===row.teacherId))return {ok:false,error:"به این ضبط دسترسی ندارید."};
  if(row.status==="recording")return {ok:false,error:"ضبط هنوز در حال انجام است؛ پس از توقف قابل دانلود است."};
  if(row.status==="failed")return {ok:false,error:"این ضبط ناموفق بوده و فایلی ندارد."};
  const env=recordingEnv();if(!env.ok)return {ok:false,error:env.error};
  try{
    const client=new S3Client({region:env.region,endpoint:env.endpoint,credentials:{accessKeyId:env.accessKey,secretAccessKey:env.appKey},forcePathStyle:false});
    const url=await getSignedUrl(client,new GetObjectCommand({Bucket:env.bucket,Key:row.filePath}),{expiresIn:900});
    return {ok:true,url,filePath:row.filePath};
  }catch{return {ok:false,error:"ساخت لینک دانلود انجام نشد."};}
}
export async function monthlyRecordingUsageSeconds():Promise<number>{const db=await onlineDb();return monthlyRecordingSeconds(db);}

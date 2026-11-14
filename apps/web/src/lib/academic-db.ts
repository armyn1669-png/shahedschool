import { database, ensureDatabaseReady, type AuthenticatedUser } from "@/lib/auth-db";
import { dbGet, dbAll, dbRun, dbExec, dbTransaction, type Db } from "@/lib/db";
const academicSchemaCache=globalThis as typeof globalThis & {__schoolAcademicSchemaVersion?:number;__schoolAcademicDatabases?:WeakSet<object>};
const ACADEMIC_SCHEMA_VERSION=5;

export async function academicDatabase() {
  const db = await ensureDatabaseReady();
  if(academicSchemaCache.__schoolAcademicSchemaVersion!==ACADEMIC_SCHEMA_VERSION){academicSchemaCache.__schoolAcademicSchemaVersion=ACADEMIC_SCHEMA_VERSION;academicSchemaCache.__schoolAcademicDatabases=new WeakSet<object>();}
  const ready=academicSchemaCache.__schoolAcademicDatabases!;if(ready.has(db))return db;
  (await dbExec(db, `CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, grade TEXT NOT NULL, field_of_study TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT '۱', teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, weekday TEXT NOT NULL,
    start_time TEXT NOT NULL DEFAULT '', end_time TEXT NOT NULL DEFAULT '', room TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
    period INTEGER NOT NULL DEFAULT 1, week_pattern TEXT NOT NULL DEFAULT 'every' CHECK(week_pattern IN ('every','a','b'))
  );
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    registration_id INTEGER NOT NULL REFERENCES student_registrations(id) ON DELETE CASCADE,
    attendance_date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('present','absent','late','excused')),
    note TEXT NOT NULL DEFAULT '', recorded_by INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'legacy',
    UNIQUE(course_id, registration_id, attendance_date)
  );
  CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    registration_id INTEGER NOT NULL REFERENCES student_registrations(id) ON DELETE CASCADE,
    title TEXT NOT NULL, score REAL NOT NULL CHECK(score >= 0), max_score REAL NOT NULL CHECK(max_score > 0),
    recorded_by INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attendance_batches(
    id INTEGER PRIMARY KEY,course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,attendance_date TEXT NOT NULL,
    submitted_by INTEGER NOT NULL REFERENCES users(id),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_at INTEGER NOT NULL,reviewed_at INTEGER,reviewed_by INTEGER REFERENCES users(id),source TEXT NOT NULL DEFAULT 'in_person',UNIQUE(course_id,attendance_date)
  );
  CREATE TABLE IF NOT EXISTS attendance_batch_students(
    batch_id INTEGER NOT NULL REFERENCES attendance_batches(id) ON DELETE CASCADE,
    registration_id INTEGER NOT NULL REFERENCES student_registrations(id) ON DELETE CASCADE,
    reported_absent INTEGER NOT NULL DEFAULT 0,reported_status TEXT NOT NULL DEFAULT 'present',PRIMARY KEY(batch_id,registration_id)
  );
  CREATE TABLE IF NOT EXISTS guardian_notifications(
    id INTEGER PRIMARY KEY,registration_id INTEGER NOT NULL REFERENCES student_registrations(id) ON DELETE CASCADE,
    attendance_id INTEGER NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,channel TEXT NOT NULL DEFAULT 'pending',
    message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',created_at INTEGER NOT NULL,sent_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS guardian_eitaa_contacts(
    registration_id INTEGER PRIMARY KEY REFERENCES student_registrations(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS online_attendance(
    id INTEGER PRIMARY KEY,online_class_id INTEGER NOT NULL REFERENCES online_classes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,registration_id INTEGER NOT NULL REFERENCES student_registrations(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,total_seconds INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'collecting' CHECK(status IN ('collecting','teacher_review','approved','rejected')),teacher_confirmed INTEGER NOT NULL DEFAULT 0,
    UNIQUE(online_class_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS attendance_class_sessions(
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,attendance_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('held','no_class')),recorded_by INTEGER NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,
    PRIMARY KEY(course_id,attendance_date)
  );
  CREATE TABLE IF NOT EXISTS attendance_daily_message_log(
    attendance_date TEXT PRIMARY KEY,channel_id TEXT NOT NULL,message TEXT NOT NULL,sent_by INTEGER NOT NULL REFERENCES users(id),sent_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS online_absence_reports(
    id INTEGER PRIMARY KEY,online_class_id INTEGER NOT NULL UNIQUE REFERENCES online_classes(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,attendance_date TEXT NOT NULL,
    submitted_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,report_json TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bell_period_times(period INTEGER PRIMARY KEY CHECK(period BETWEEN 1 AND 8),start_time TEXT NOT NULL,end_time TEXT NOT NULL,updated_by INTEGER NOT NULL REFERENCES users(id),updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS makeup_class_slots(id INTEGER PRIMARY KEY,course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,repeat_mode TEXT NOT NULL CHECK(repeat_mode IN ('once','permanent')),class_date TEXT,weekday TEXT,start_time TEXT NOT NULL,end_time TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,used_by_class_id INTEGER,created_by INTEGER NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS courses_teacher_schedule_idx ON courses(teacher_id, weekday, start_time);
  CREATE INDEX IF NOT EXISTS attendance_student_date_idx ON attendance(registration_id, attendance_date DESC);
  CREATE INDEX IF NOT EXISTS grades_student_created_idx ON grades(registration_id, created_at DESC);`));
  const courseColumns=new Set(((await dbAll(db, "PRAGMA table_info(courses)")) as Array<{name:string}>).map(column=>column.name));
  if(!courseColumns.has("branch"))(await dbExec(db, "ALTER TABLE courses ADD COLUMN branch TEXT NOT NULL DEFAULT '۱'"));
  if(!courseColumns.has("period"))(await dbExec(db, "ALTER TABLE courses ADD COLUMN period INTEGER NOT NULL DEFAULT 1"));
  if(!courseColumns.has("week_pattern"))(await dbExec(db, "ALTER TABLE courses ADD COLUMN week_pattern TEXT NOT NULL DEFAULT 'every'"));
  const attendanceColumns=new Set(((await dbAll(db, "PRAGMA table_info(attendance)")) as Array<{name:string}>).map(column=>column.name));
  if(!attendanceColumns.has("source"))(await dbExec(db, "ALTER TABLE attendance ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy'"));
  if(!attendanceColumns.has("arrival_time"))(await dbExec(db, "ALTER TABLE attendance ADD COLUMN arrival_time TEXT NOT NULL DEFAULT ''"));
  const batchColumns=new Set(((await dbAll(db, "PRAGMA table_info(attendance_batches)")) as Array<{name:string}>).map(column=>column.name));
  if(!batchColumns.has("source"))(await dbExec(db, "ALTER TABLE attendance_batches ADD COLUMN source TEXT NOT NULL DEFAULT 'in_person'"));
  const batchStudentColumns=new Set(((await dbAll(db, "PRAGMA table_info(attendance_batch_students)")) as Array<{name:string}>).map(column=>column.name));
  if(!batchStudentColumns.has("reported_status")){(await dbExec(db, "ALTER TABLE attendance_batch_students ADD COLUMN reported_status TEXT NOT NULL DEFAULT 'present'"));(await dbExec(db, "UPDATE attendance_batch_students SET reported_status=CASE WHEN reported_absent=1 THEN 'absent' ELSE 'present' END"));}
  ready.add(db);
  return db;
}

export async function academicSnapshot(user: AuthenticatedUser) {
  const db = await academicDatabase();
  let courses: any[];
  let students: any[] = [];
  let teachers: any[] = [];
  if (user.role === "admin") {
    courses = (await dbAll(db, `SELECT c.id, c.title, c.grade, c.field_of_study AS fieldOfStudy, c.branch, c.weekday, c.period, c.week_pattern AS weekPattern, c.start_time AS startTime,
      c.end_time AS endTime, c.room, c.teacher_id AS teacherId, u.display_name AS teacherName
      FROM courses c JOIN users u ON u.id=c.teacher_id ORDER BY c.grade,c.branch,c.weekday,c.period`));
    teachers = (await dbAll(db, "SELECT id, display_name AS displayName, username FROM users WHERE role='teacher' AND status='active' ORDER BY display_name"));
    students = (await dbAll(db, "SELECT id, full_name AS fullName, national_id AS nationalId, grade, field_of_study AS fieldOfStudy, branch FROM student_registrations WHERE status='approved' ORDER BY grade,branch,full_name"));
  } else if (user.role === "teacher") {
    courses = (await dbAll(db, `SELECT c.id, c.title, c.grade, c.field_of_study AS fieldOfStudy, c.branch, c.weekday, c.period, c.week_pattern AS weekPattern, c.start_time AS startTime,
      c.end_time AS endTime, c.room, c.teacher_id AS teacherId, u.display_name AS teacherName
      FROM courses c JOIN users u ON u.id=c.teacher_id WHERE c.teacher_id=? ORDER BY c.weekday,c.period`, user.id));
  } else if (user.role === "student") {
    courses = (await dbAll(db, `SELECT c.id, c.title, c.grade, c.field_of_study AS fieldOfStudy, c.branch, c.weekday, c.period, c.week_pattern AS weekPattern, c.start_time AS startTime,
      c.end_time AS endTime, c.room, c.teacher_id AS teacherId, u.display_name AS teacherName
      FROM courses c JOIN users u ON u.id=c.teacher_id JOIN student_registrations r ON r.account_user_id=? AND r.status='approved'
      WHERE c.grade=r.grade AND c.field_of_study=r.field_of_study AND c.branch=r.branch ORDER BY c.weekday,c.period`, user.id));
  } else courses = [];
  return { courses, teachers, students };
}

export async function createCourse(actor: AuthenticatedUser, input: { title: string; grade: string; fieldOfStudy: string; branch:string; teacherId: number; weekday: string; startTime?: string; endTime?: string; room: string; period:number; weekPattern:"every"|"a"|"b" }) {
  const db = await academicDatabase();
  const teacher = (await dbGet(db, "SELECT id FROM users WHERE id=? AND role='teacher' AND status='active'", input.teacherId));
  if (!teacher) return { ok: false as const, error: "حساب دبیر انتخاب‌شده معتبر نیست." };
  if (!Number.isInteger(input.period)||input.period<1||input.period>8||!["every","a","b"].includes(input.weekPattern)) return { ok:false as const,error:"زنگ یا نوبت هفته معتبر نیست." };
  const result = (await dbRun(db, `INSERT INTO courses(title,grade,field_of_study,branch,teacher_id,weekday,start_time,end_time,room,period,week_pattern,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, input.title,input.grade,input.fieldOfStudy,input.branch,input.teacherId,input.weekday,input.startTime||"",input.endTime||"",input.room,input.period,input.weekPattern,Date.now()));
  (await dbRun(db, "INSERT INTO audit_events(actor_user_id,event_type,subject_user_id,created_at) VALUES(?,'course.created',?,?)", actor.id,input.teacherId,Date.now()));
  return { ok: true as const, id: Number(result.lastInsertRowid) };
}

export async function updateCourse(actor:AuthenticatedUser,id:number,input:{title:string;grade:string;fieldOfStudy:string;branch:string;teacherId:number;weekday:string;period:number;weekPattern:"every"|"a"|"b";room:string}){
 const db=await academicDatabase();if(actor.role!=="admin")return {ok:false as const,error:"فقط مدیر می‌تواند برنامه را ویرایش کند."};
 if(!(await dbGet(db, "SELECT id FROM users WHERE id=? AND role='teacher' AND status='active'", input.teacherId)))return {ok:false as const,error:"حساب دبیر معتبر نیست."};
 const result=(await dbRun(db, "UPDATE courses SET title=?,grade=?,field_of_study=?,branch=?,teacher_id=?,weekday=?,period=?,week_pattern=?,room=? WHERE id=?", input.title,input.grade,input.fieldOfStudy,input.branch,input.teacherId,input.weekday,input.period,input.weekPattern,input.room,id));
 return result.changes?{ok:true as const}:{ok:false as const,error:"زنگ موردنظر پیدا نشد."};
}

export async function bellSchedule(actor:AuthenticatedUser){const db=await academicDatabase();if(!["admin","teacher"].includes(actor.role))return [];const rows=(await dbAll(db, "SELECT period,start_time AS startTime,end_time AS endTime FROM bell_period_times ORDER BY period"));return rows.length?rows:Array.from({length:4},(_,i)=>({period:i+1,startTime:"",endTime:""}));}
export async function saveBellPeriod(actor:AuthenticatedUser,input:{period:number;startTime:string;endTime:string}){if(actor.role!=="admin")return {ok:false as const,error:"فقط مدیر می‌تواند ساعت زنگ‌ها را تعیین کند."};if(!Number.isInteger(input.period)||input.period<1||input.period>8||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.endTime)||input.startTime>=input.endTime)return {ok:false as const,error:"شماره یا ساعت زنگ معتبر نیست."};const db=await academicDatabase();(await dbRun(db, "INSERT INTO bell_period_times(period,start_time,end_time,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(period) DO UPDATE SET start_time=excluded.start_time,end_time=excluded.end_time,updated_by=excluded.updated_by,updated_at=excluded.updated_at", input.period,input.startTime,input.endTime,actor.id,Date.now()));return {ok:true as const};}
export async function makeupSlots(actor:AuthenticatedUser){if(!["admin","teacher"].includes(actor.role))return [];const db=await academicDatabase();const query="SELECT m.id,m.course_id AS courseId,m.repeat_mode AS repeatMode,m.class_date AS date,m.weekday,m.start_time AS startTime,m.active,m.used_by_class_id AS usedByClassId,c.title AS course,c.grade,c.branch,u.display_name AS teacherName FROM makeup_class_slots m JOIN courses c ON c.id=m.course_id JOIN users u ON u.id=c.teacher_id";return actor.role==="admin"?(await dbAll(db, `${query} ORDER BY m.created_at DESC`)):(await dbAll(db, `${query} WHERE c.teacher_id=? AND m.active=1 AND (m.used_by_class_id IS NULL OR m.repeat_mode='permanent') ORDER BY m.created_at DESC`, actor.id));}
export async function createMakeupSlot(actor:AuthenticatedUser,input:{courseId:number;repeatMode:"once"|"permanent";date:string;weekday:string;startTime:string}){if(actor.role!=="admin")return {ok:false as const,error:"فقط مدیر می‌تواند کلاس جبرانی تعیین کند."};const db=await academicDatabase();const course=(await dbGet(db, "SELECT id FROM courses WHERE id=?", input.courseId));if(!course)return {ok:false as const,error:"کلاس انتخاب‌شده پیدا نشد."};if(!["once","permanent"].includes(input.repeatMode)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime))return {ok:false as const,error:"ساعت شروع کلاس جبرانی معتبر نیست."};if(input.repeatMode==="once"?!/^\d{4}-\d{2}-\d{2}$/.test(input.date):!["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه"].includes(input.weekday))return {ok:false as const,error:"تاریخ یا روز تکرار کلاس جبرانی معتبر نیست."};(await dbRun(db, "INSERT INTO makeup_class_slots(course_id,repeat_mode,class_date,weekday,start_time,end_time,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)", input.courseId,input.repeatMode,input.repeatMode==="once"?input.date:null,input.repeatMode==="permanent"?input.weekday:null,input.startTime,input.startTime,actor.id,Date.now()));return {ok:true as const};}
export async function deleteMakeupSlot(actor:AuthenticatedUser,id:number){if(actor.role!=="admin")return false;const db=await academicDatabase();return (await dbRun(db, "UPDATE makeup_class_slots SET active=0 WHERE id=? AND used_by_class_id IS NULL", id)).changes>0;}
export async function validateTeacherOnlineSchedule(actor:AuthenticatedUser,courseId:number,date:string,startTime:string){
  const db=await academicDatabase();
  if(actor.role!=="teacher")return {ok:false as const,error:"فقط دبیر می‌تواند جلسهٔ کلاس خود را بسازد."};
  const course=(await dbGet(db, "SELECT id,weekday,period,week_pattern AS weekPattern FROM courses WHERE id=? AND teacher_id=?", courseId,actor.id)) as {id:number;weekday:string;period:number;weekPattern:string}|undefined;
  if(!course)return {ok:false as const,error:"این کلاس به حساب شما اختصاص ندارد."};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime))return {ok:false as const,error:"تاریخ یا ساعت شروع جلسه معتبر نیست."};
  const dayNames=["یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه","شنبه"];
  const day=dayNames[new Date(date+"T12:00:00Z").getUTCDay()];
  const patternOk=course.weekPattern==="every"||((Math.floor((Date.parse(date+"T12:00:00Z")-Date.UTC(new Date(date).getUTCFullYear(),0,1))/604800000)%2===0)?course.weekPattern==="a":course.weekPattern==="b");
  const secondBell=(await dbGet(db, "SELECT start_time AS startTime FROM bell_period_times WHERE period=2")) as {startTime:string}|undefined;
  if(secondBell?.startTime&&startTime<secondBell.startTime)return {ok:true as const,makeupSlotId:null};
  const scheduled=(await dbGet(db, "SELECT start_time AS startTime FROM bell_period_times WHERE period=?", course.period)) as {startTime:string}|undefined;
  const regular=!!scheduled&&day===course.weekday&&patternOk&&scheduled.startTime===startTime;
  if(regular)return {ok:true as const,makeupSlotId:null};
  const once=(await dbGet(db, "SELECT id FROM makeup_class_slots WHERE course_id=? AND active=1 AND repeat_mode='once' AND class_date=? AND start_time=? AND used_by_class_id IS NULL", courseId,date,startTime)) as {id:number}|undefined;
  const recurring=once?undefined:(await dbGet(db, "SELECT id FROM makeup_class_slots WHERE course_id=? AND active=1 AND repeat_mode='permanent' AND weekday=? AND start_time=?", courseId,day,startTime)) as {id:number}|undefined;
  const slot=once||recurring;
  return slot?{ok:true as const,makeupSlotId:once?once.id:null}:{ok:false as const,error:"بعد از شروع زنگ دوم، زمان جلسه باید با زنگ برنامه یا مجوز جبرانی مدیر هماهنگ باشد."};
}

export async function deleteCourse(actor:AuthenticatedUser,id:number){if(actor.role!=="admin")return false;const db=await academicDatabase();return (await dbRun(db, "DELETE FROM courses WHERE id=?", id)).changes>0;}

export async function courseRoster(actor: AuthenticatedUser, courseId: number) {
  const db = await academicDatabase();
  const course = (await dbGet(db, "SELECT * FROM courses WHERE id=?", courseId)) as { id: number; teacher_id: number; grade: string; field_of_study: string; branch:string } | undefined;
  if (!course || (actor.role === "teacher" && course.teacher_id !== actor.id)) return null;
  return (await dbAll(db, `SELECT id AS registrationId, full_name AS fullName, national_id AS nationalId FROM student_registrations
    WHERE status='approved' AND grade=? AND field_of_study=? AND branch=? ORDER BY full_name`, course.grade, course.field_of_study, course.branch));
}

export async function recordAttendance(actor: AuthenticatedUser, input: { courseId: number; registrationId: number; date: string; status: string }) {
  const db = await academicDatabase();
  const roster = await courseRoster(actor, input.courseId);
  if (!roster || !roster.some((student: any) => student.registrationId === input.registrationId)) return { ok: false as const, error: "این دانش‌آموز در کلاس انتخاب‌شده نیست یا دسترسی ندارید." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !["present","absent","late","excused"].includes(input.status)) return { ok: false as const, error: "تاریخ یا وضعیت حضور معتبر نیست." };
  (await dbRun(db, `INSERT INTO attendance(course_id,registration_id,attendance_date,status,recorded_by,created_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(course_id,registration_id,attendance_date) DO UPDATE SET status=excluded.status,recorded_by=excluded.recorded_by`, input.courseId,input.registrationId,input.date,input.status,actor.id,Date.now()));
  return { ok: true as const };
}

export async function submitAttendanceBatch(actor:AuthenticatedUser,input:{courseId:number;date:string;absentRegistrationIds:number[]}){
 if(actor.role==="admin")return {ok:false as const,error:"مدیر حضور را دستی ثبت نمی‌کند؛ از بخش غیبت‌های روزانه فقط غایبان را وارد کنید."};
 const db=await academicDatabase();const course=(await dbGet(db, "SELECT id,teacher_id FROM courses WHERE id=?", input.courseId)) as {id:number;teacher_id:number}|undefined;
 if(!course||(actor.role==="teacher"&&course.teacher_id!==actor.id))return {ok:false as const,error:"کلاس پیدا نشد یا دسترسی ندارید."};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date))return {ok:false as const,error:"تاریخ معتبر نیست."};
 const roster=await courseRoster(actor,input.courseId);if(!roster)return {ok:false as const,error:"فهرست کلاس پیدا نشد."};
 const chosen=new Set(input.absentRegistrationIds);if([...chosen].some(id=>!roster.some((s:any)=>s.registrationId===id)))return {ok:false as const,error:"در فهرست انتخابی دانش‌آموزی خارج از کلاس هست."};
 const batch=(await dbRun(db, `INSERT INTO attendance_batches(course_id,attendance_date,submitted_by,status,created_at,source) VALUES(?,?,?,'pending',?,'in_person') ON CONFLICT(course_id,attendance_date) DO UPDATE SET submitted_by=excluded.submitted_by,status='pending',created_at=excluded.created_at,reviewed_at=NULL,reviewed_by=NULL,source='in_person'`, input.courseId,input.date,actor.id,Date.now()));
 const batchId=Number(batch.lastInsertRowid)||Number(((await dbGet(db, "SELECT id FROM attendance_batches WHERE course_id=? AND attendance_date=?", input.courseId,input.date)) as {id:number}).id);
 (await dbRun(db, "DELETE FROM attendance_batch_students WHERE batch_id=?", batchId));
 (await dbRun(db, "INSERT INTO attendance_class_sessions(course_id,attendance_date,status,recorded_by,created_at) VALUES(?,?,'held',?,?) ON CONFLICT(course_id,attendance_date) DO UPDATE SET status='held',recorded_by=excluded.recorded_by,created_at=excluded.created_at", input.courseId,input.date,actor.id,Date.now()));
 const addSql="INSERT INTO attendance_batch_students(batch_id,registration_id,reported_absent,reported_status) VALUES(?,?,1,'absent')";for(const registrationId of chosen)await dbRun(db, addSql, batchId,registrationId);
 return {ok:true as const,final:false as const};
}

async function finalizeAttendanceNotifications(db:Db,courseId:number,date:string,absentIds:number[]){
 const students=absentIds.length?(await dbAll(db, `SELECT r.id,r.full_name,r.guardian_name,r.guardian_phone FROM student_registrations r WHERE r.id IN (${absentIds.map(()=>"?").join(",")})`, ...absentIds)) as Array<{id:number;full_name:string;guardian_name:string;guardian_phone:string}>:[];
 const course=(await dbGet(db, "SELECT title,grade,branch FROM courses WHERE id=?", courseId)) as {title:string;grade:string;branch:string};
  for(const student of students){const attendance=(await dbGet(db, "SELECT id FROM attendance WHERE course_id=? AND registration_id=? AND attendance_date=?", courseId,student.id,date)) as {id:number};const duplicate=(await dbGet(db, "SELECT id FROM guardian_notifications WHERE registration_id=? AND attendance_id=?", student.id,attendance.id));if(duplicate)continue;const message=`سرپرست گرامی ${student.guardian_name}، فرزند شما ${student.full_name} در تاریخ ${date} در مدرسه حاضر نبوده است. کلاس: ${course.grade}، شعبه ${course.branch}، ${course.title}.`;const notificationId=Number((await dbRun(db, "INSERT INTO guardian_notifications(registration_id,attendance_id,message,created_at) VALUES(?,?,?,?)", student.id,attendance.id,message,Date.now())).lastInsertRowid);const token=process.env.EITAAYAR_BOT_TOKEN||process.env.EITAAYAR_API_TOKEN||process.env.EITAAYAR_TOKEN;const contact=(await dbGet(db, "SELECT chat_id AS chatId FROM guardian_eitaa_contacts WHERE registration_id=?", student.id)) as {chatId:string}|undefined;if(!token||!contact?.chatId)continue;try{const response=await fetch(`https://eitaayar.ir/api/${encodeURIComponent(token)}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({chat_id:contact.chatId,text:message,title:"گزارش حضور و غیاب مدرسه"}),signal:AbortSignal.timeout(10000)});const payload=await response.json() as {ok?:boolean};if(!response.ok||payload.ok!==true)throw new Error("ارسال در ایتایار تأیید نشد.");(await dbRun(db, "UPDATE guardian_notifications SET channel='eitaayar',status='sent',sent_at=? WHERE id=?", Date.now(),notificationId));}catch{(await dbRun(db, "UPDATE guardian_notifications SET channel='eitaayar',status='failed' WHERE id=?", notificationId));}}
}

export async function setGuardianEitaaChatId(actor:AuthenticatedUser,registrationId:number,chatId:string){if(actor.role!=="admin")return {ok:false as const,error:"فقط مدیر می‌تواند شناسهٔ مقصد را ثبت کند."};const db=await academicDatabase();if(!(await dbGet(db, "SELECT id FROM student_registrations WHERE id=? AND status='approved'", registrationId)))return {ok:false as const,error:"دانش‌آموز تأییدشده پیدا نشد."};if(chatId){(await dbRun(db, "INSERT INTO guardian_eitaa_contacts(registration_id,chat_id,updated_at) VALUES(?,?,?) ON CONFLICT(registration_id) DO UPDATE SET chat_id=excluded.chat_id,updated_at=excluded.updated_at", registrationId,chatId,Date.now()));}else (await dbRun(db, "DELETE FROM guardian_eitaa_contacts WHERE registration_id=?", registrationId));return {ok:true as const};}

export async function guardianNotificationQueue(actor:AuthenticatedUser){if(actor.role!=="admin")return [];const db=await academicDatabase();return (await dbAll(db, `SELECT n.id,n.message,n.status,n.created_at AS createdAt,r.full_name AS studentName,r.guardian_name AS guardianName,r.guardian_phone AS guardianPhone,COALESCE(g.chat_id,'') AS chatId FROM guardian_notifications n JOIN student_registrations r ON r.id=n.registration_id LEFT JOIN guardian_eitaa_contacts g ON g.registration_id=r.id ORDER BY n.created_at DESC LIMIT 200`));}

export async function retryGuardianNotification(actor:AuthenticatedUser,id:number){if(actor.role!=="admin")return {ok:false as const,error:"فقط مدیر می‌تواند ارسال پیام را مدیریت کند."};const db=await academicDatabase();const row=(await dbGet(db, `SELECT n.id,n.message,n.status,COALESCE(g.chat_id,'') AS chatId FROM guardian_notifications n LEFT JOIN guardian_eitaa_contacts g ON g.registration_id=n.registration_id WHERE n.id=?`, id)) as {id:number;message:string;status:string;chatId:string}|undefined;if(!row)return {ok:false as const,error:"پیام پیدا نشد."};if(row.status==="sent")return {ok:false as const,error:"این پیام قبلاً ارسال شده است."};const token=process.env.EITAAYAR_BOT_TOKEN||process.env.EITAAYAR_API_TOKEN||process.env.EITAAYAR_TOKEN;if(!token)return {ok:false as const,error:"کلید ایتایار در تنظیمات سرور ثبت نشده است."};if(!row.chatId)return {ok:false as const,error:"شناسهٔ گفت‌وگوی ایتایار سرپرست ثبت نشده است."};try{const response=await fetch(`https://eitaayar.ir/api/${encodeURIComponent(token)}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({chat_id:row.chatId,text:row.message,title:"گزارش حضور و غیاب مدرسه"}),signal:AbortSignal.timeout(10000)});const payload=await response.json() as {ok?:boolean};if(!response.ok||payload.ok!==true){(await dbRun(db, "UPDATE guardian_notifications SET channel='eitaayar',status='failed' WHERE id=?", id));return {ok:false as const,error:"پاسخ ایتایار ارسال پیام را تأیید نکرد. کلید و شناسهٔ مقصد را بررسی کنید."};}(await dbRun(db, "UPDATE guardian_notifications SET channel='eitaayar',status='sent',sent_at=? WHERE id=?", Date.now(),id));return {ok:true as const};}catch{(await dbRun(db, "UPDATE guardian_notifications SET channel='eitaayar',status='failed' WHERE id=?", id));return {ok:false as const,error:"اتصال به ایتایار برقرار نشد. اینترنت سرور و دسترسی سرویس را بررسی کنید."};}}

export async function reviewAttendanceBatch(actor:AuthenticatedUser,batchId:number,approve:boolean){
 if(actor.role!=="admin")return {ok:false as const,error:"فقط مدیر می‌تواند گزارش غیبت را نهایی کند."};const db=await academicDatabase();const batch=(await dbGet(db, "SELECT * FROM attendance_batches WHERE id=? AND status='pending'", batchId)) as {id:number;course_id:number;attendance_date:string;submitted_by:number;source:string}|undefined;if(!batch)return {ok:false as const,error:"گزارش در انتظار بررسی پیدا نشد."};
 if(batch.source==="online")return {ok:false as const,error:"گزارش آنلاین در فهرست موقت ۲۴ ساعتهٔ مدیر بررسی می‌شود و به سوابق دائمی اضافه نمی‌شود."};
 const items=(await dbAll(db, "SELECT registration_id AS id,reported_status AS status FROM attendance_batch_students WHERE batch_id=? AND reported_status IN ('absent','late')", batchId)) as Array<{id:number;status:"absent"|"late"}>;
 if(approve){(await dbRun(db, "DELETE FROM attendance WHERE course_id=? AND attendance_date=? AND source=?", batch.course_id,batch.attendance_date,batch.source));for(const item of items)(await dbRun(db, `INSERT INTO attendance(course_id,registration_id,attendance_date,status,recorded_by,created_at,source) VALUES(?,?,?,?,?,?,?) ON CONFLICT(course_id,registration_id,attendance_date) DO UPDATE SET status=excluded.status,recorded_by=excluded.recorded_by,source=excluded.source`, batch.course_id,item.id,batch.attendance_date,item.status,batch.submitted_by,Date.now(),batch.source));}
 (await dbRun(db, "UPDATE attendance_batches SET status=?,reviewed_at=?,reviewed_by=? WHERE id=?", approve?"approved":"rejected",Date.now(),actor.id,batchId));return {ok:true as const};
}

export async function pendingAttendanceBatches(actor:AuthenticatedUser){if(actor.role!=="admin")return [];const db=await academicDatabase();return (await dbAll(db, `SELECT b.id,b.attendance_date AS date,c.title AS course,c.grade,c.branch,c.period,u.display_name AS teacherName,b.source,(SELECT COUNT(*) FROM attendance_batch_students s WHERE s.batch_id=b.id AND s.reported_status='absent') AS absentCount,(SELECT COUNT(*) FROM attendance_batch_students s WHERE s.batch_id=b.id AND s.reported_status='late') AS lateCount FROM attendance_batches b JOIN courses c ON c.id=b.course_id JOIN users u ON u.id=b.submitted_by WHERE b.status='pending' AND b.source<>'online' ORDER BY b.created_at DESC`));}

export async function recordGrade(actor: AuthenticatedUser, input: { courseId: number; registrationId: number; title: string; score: number; maxScore: number }) {
  const db = await academicDatabase();
  const roster = await courseRoster(actor, input.courseId);
  if (!roster || !roster.some((student: any) => student.registrationId === input.registrationId)) return { ok: false as const, error: "این دانش‌آموز در کلاس انتخاب‌شده نیست یا دسترسی ندارید." };
  if (!input.title || input.title.length > 80 || !Number.isFinite(input.score) || !Number.isFinite(input.maxScore) || input.score < 0 || input.maxScore <= 0 || input.score > input.maxScore) return { ok: false as const, error: "عنوان یا نمره معتبر نیست." };
  (await dbRun(db, "INSERT INTO grades(course_id,registration_id,title,score,max_score,recorded_by,created_at) VALUES(?,?,?,?,?,?,?)", input.courseId,input.registrationId,input.title,input.score,input.maxScore,actor.id,Date.now()));
  return { ok: true as const };
}

export async function classRecords(user: AuthenticatedUser) {
  const db = await academicDatabase();
  const registration = (await dbGet(db, "SELECT id FROM student_registrations WHERE account_user_id=? AND status='approved'", user.id)) as { id: number } | undefined;
  if (!registration) return { attendance: [], grades: [] };
  const attendance = (await dbAll(db, `SELECT a.attendance_date AS date,a.status,c.title AS course FROM attendance a JOIN courses c ON c.id=a.course_id WHERE a.registration_id=? ORDER BY a.attendance_date DESC`, registration.id));
  const grades = (await dbAll(db, `SELECT g.title,g.score,g.max_score AS maxScore,g.created_at AS createdAt,c.title AS course FROM grades g JOIN courses c ON c.id=g.course_id WHERE g.registration_id=? ORDER BY g.created_at DESC`, registration.id));
  return { attendance, grades };
}

export async function attendanceHistory(actor:AuthenticatedUser,registrationId?:number,courseId?:number){
 const db=await academicDatabase();
 if(actor.role==="student"){const reg=(await dbGet(db, "SELECT id FROM student_registrations WHERE account_user_id=? AND status='approved'", actor.id)) as {id:number}|undefined;if(!reg)return [];return (await dbAll(db, "SELECT a.id,a.attendance_date AS date,a.status,a.note,a.arrival_time AS arrivalTime,a.registration_id AS registrationId,c.id AS courseId,c.title AS course,c.grade,c.field_of_study AS fieldOfStudy,c.branch,c.period FROM attendance a JOIN courses c ON c.id=a.course_id WHERE a.registration_id=? ORDER BY a.attendance_date DESC", reg.id));}
 if(actor.role==="admin")return (await dbAll(db, `SELECT a.id,a.attendance_date AS date,a.status,a.note,a.arrival_time AS arrivalTime,r.full_name AS fullName,r.id AS registrationId,c.id AS courseId,c.title AS course,c.grade,c.field_of_study AS fieldOfStudy,c.branch,c.period FROM attendance a JOIN student_registrations r ON r.id=a.registration_id JOIN courses c ON c.id=a.course_id WHERE a.status IN ('absent','late','excused') AND (? IS NULL OR r.id=?) AND (? IS NULL OR c.id=?) ORDER BY a.attendance_date DESC,a.arrival_time,r.full_name LIMIT 1000`, registrationId??null,registrationId??null,courseId??null,courseId??null));
 if(actor.role==="teacher")return (await dbAll(db, `SELECT a.id,a.attendance_date AS date,a.status,a.note,a.arrival_time AS arrivalTime,r.full_name AS fullName,r.id AS registrationId,c.id AS courseId,c.title AS course,c.grade,c.field_of_study AS fieldOfStudy,c.branch,c.period FROM attendance a JOIN student_registrations r ON r.id=a.registration_id JOIN courses c ON c.id=a.course_id WHERE c.teacher_id=? AND a.status IN ('absent','late','excused') AND (? IS NULL OR r.id=?) AND (? IS NULL OR c.id=?) ORDER BY a.attendance_date DESC,r.full_name LIMIT 1000`, actor.id,registrationId??null,registrationId??null,courseId??null,courseId??null));
 return [];
}

export async function excuseAttendance(actor:AuthenticatedUser,id:number,note:string){if(actor.role!=="admin")return {ok:false as const,error:"فقط مدیر می‌تواند غیبت را موجه کند."};const db=await academicDatabase();const result=(await dbRun(db, "UPDATE attendance SET status='excused',note=? WHERE id=? AND status='absent'", note.trim().slice(0,500),id));return result.changes?{ok:true as const}:{ok:false as const,error:"غیبت پیدا نشد یا قبلاً اصلاح شده است."};}

export async function dailyAttendanceSnapshot(actor:AuthenticatedUser,date:string,courseId?:number){
 if(actor.role!=="admin")return {ok:false as const,error:"فقط مدیر می‌تواند غیبت‌های روزانه را ببیند."};if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return {ok:false as const,error:"تاریخ معتبر نیست."};const db=await academicDatabase();const courses=(await dbAll(db, `SELECT c.id,c.title,c.grade,c.field_of_study AS fieldOfStudy,c.branch,c.period,c.weekday,u.display_name AS teacherName FROM courses c JOIN users u ON u.id=c.teacher_id ORDER BY c.grade,c.branch,c.period,c.title`)) as Array<{id:number;title:string;grade:string;fieldOfStudy:string;branch:string;period:number;weekday:string;teacherName:string}>;const selected=courseId?courses.find(c=>c.id===courseId):undefined;if(courseId&&!selected)return {ok:false as const,error:"کلاس انتخاب‌شده پیدا نشد."};const roster=selected?(await dbAll(db, "SELECT id AS registrationId,full_name AS fullName FROM student_registrations WHERE status='approved' AND grade=? AND field_of_study=? AND branch=? ORDER BY full_name", selected.grade,selected.fieldOfStudy,selected.branch)):[];const absences=(await dbAll(db, `SELECT a.id,a.status,a.note,a.arrival_time AS arrivalTime,a.source,a.attendance_date AS date,r.full_name AS fullName,r.id AS registrationId,c.id AS courseId,c.title AS course,c.grade,c.branch,c.period,c.field_of_study AS fieldOfStudy FROM attendance a JOIN student_registrations r ON r.id=a.registration_id JOIN courses c ON c.id=a.course_id WHERE a.attendance_date=? AND a.status IN ('absent','late','excused') ORDER BY a.arrival_time,c.field_of_study,c.grade,c.branch,c.period,r.full_name`, date));const settings=(await dbGet(db, "SELECT setting_value AS value FROM app_settings WHERE setting_key='attendance_channel_id'")) as {value:string}|undefined;const classesSetting=(await dbGet(db, "SELECT setting_value AS value FROM app_settings WHERE setting_key='attendance_selected_classes'")) as {value:string}|undefined;let selectedClassKeys:string[]=[];try{selectedClassKeys=JSON.parse(classesSetting?.value||"[]")}catch{}const sent=(await dbGet(db, "SELECT sent_at AS sentAt FROM attendance_daily_message_log WHERE attendance_date=?", date)) as {sentAt:number}|undefined;const sessions=(await dbAll(db, "SELECT course_id AS courseId,status FROM attendance_class_sessions WHERE attendance_date=?", date));return {ok:true as const,courses,roster,absences,sessions,channelId:settings?.value||"",selectedClassKeys,sentAt:sent?.sentAt||null};
}

export async function recordManualDailyAttendance(actor:AuthenticatedUser,input:{courseId:number;date:string;absentRegistrationIds:number[];noClass:boolean}){
 if(actor.role!=="admin")return {ok:false as const,error:"فقط مدیر می‌تواند غیبت حضوری را ثبت کند."};if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date))return {ok:false as const,error:"تاریخ معتبر نیست."};const db=await academicDatabase();const course=(await dbGet(db, "SELECT id,grade,field_of_study AS fieldOfStudy,branch FROM courses WHERE id=?", input.courseId)) as {id:number;grade:string;fieldOfStudy:string;branch:string}|undefined;if(!course)return {ok:false as const,error:"کلاس پیدا نشد."};const roster=(await dbAll(db, "SELECT id FROM student_registrations WHERE status='approved' AND grade=? AND field_of_study=? AND branch=?", course.grade,course.fieldOfStudy,course.branch)) as Array<{id:number}>;const ids=[...new Set(input.absentRegistrationIds)];if(ids.some(id=>!Number.isSafeInteger(id)||!roster.some(r=>r.id===id)))return {ok:false as const,error:"فهرست دانش‌آموزان معتبر نیست."};const now=Date.now();const tx=async ()=>{(await dbRun(db, "INSERT INTO attendance_class_sessions(course_id,attendance_date,status,recorded_by,created_at) VALUES(?,?,?, ?,?) ON CONFLICT(course_id,attendance_date) DO UPDATE SET status=excluded.status,recorded_by=excluded.recorded_by,created_at=excluded.created_at", course.id,input.date,input.noClass?"no_class":"held",actor.id,now));if(input.noClass){(await dbRun(db, "DELETE FROM attendance WHERE course_id=? AND attendance_date=? AND source='manual'", course.id,input.date));return;}if(ids.length){const placeholders=ids.map(()=>"?").join(",");(await dbRun(db, `DELETE FROM attendance WHERE course_id=? AND attendance_date=? AND source='manual' AND registration_id NOT IN (${placeholders})`, course.id,input.date,...ids));}else (await dbRun(db, "DELETE FROM attendance WHERE course_id=? AND attendance_date=? AND source='manual'", course.id,input.date));const addSql="INSERT INTO attendance(course_id,registration_id,attendance_date,status,recorded_by,created_at,source) VALUES(?,?,?,'absent',?,?,'manual') ON CONFLICT(course_id,registration_id,attendance_date) DO UPDATE SET status='absent',note='',recorded_by=excluded.recorded_by,created_at=excluded.created_at,source='manual'";for(const id of ids)await dbRun(db, addSql, course.id,id,input.date,actor.id,now);};await tx();return {ok:true as const,absentCount:input.noClass?0:ids.length};
}

export async function recordManualAttendanceBatch(actor:AuthenticatedUser,input:{date:string;records:Array<{courseId:number;absentRegistrationIds:number[]}>}){if(actor.role!=="admin")return {ok:false as const,error:"فقط مدیر می‌تواند غیبت حضوری را ثبت کند."};if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Array.isArray(input.records)||!input.records.length)return {ok:false as const,error:"تاریخ یا فهرست کلاس‌ها معتبر نیست."};const db=await academicDatabase(),idsSeen=new Set<number>(),prepared:Array<{courseId:number;ids:number[]}>=[];for(const row of input.records){const courseId=Number(row.courseId),ids=[...new Set(row.absentRegistrationIds.map(Number))];if(!Number.isSafeInteger(courseId)||courseId<1||idsSeen.has(courseId))return {ok:false as const,error:"کلاس تکراری یا نامعتبر است."};idsSeen.add(courseId);const course=(await dbGet(db, "SELECT id,grade,field_of_study AS fieldOfStudy,branch FROM courses WHERE id=?", courseId)) as {id:number;grade:string;fieldOfStudy:string;branch:string}|undefined;if(!course)return {ok:false as const,error:"یکی از کلاس‌های انتخاب‌شده پیدا نشد."};const roster=(await dbAll(db, "SELECT id FROM student_registrations WHERE status='approved' AND grade=? AND field_of_study=? AND branch=?", course.grade,course.fieldOfStudy,course.branch)) as Array<{id:number}>;if(ids.some(id=>!Number.isSafeInteger(id)||!roster.some(r=>r.id===id)))return {ok:false as const,error:"فهرست دانش‌آموزان یکی از کلاس‌ها معتبر نیست."};prepared.push({courseId,ids});}const now=Date.now();try{
  await dbTransaction(async (tx)=>{
    for(const row of prepared){
      await dbRun(tx, "INSERT INTO attendance_class_sessions(course_id,attendance_date,status,recorded_by,created_at) VALUES(?,?,'held',?,?) ON CONFLICT(course_id,attendance_date) DO UPDATE SET status='held',recorded_by=excluded.recorded_by,created_at=excluded.created_at", row.courseId,input.date,actor.id,now);
      if(row.ids.length){const marks=row.ids.map(()=>"?").join(",");await dbRun(tx, `DELETE FROM attendance WHERE course_id=? AND attendance_date=? AND source='manual' AND registration_id NOT IN (${marks})`, row.courseId,input.date,...row.ids)}
      else await dbRun(tx, "DELETE FROM attendance WHERE course_id=? AND attendance_date=? AND source='manual'", row.courseId,input.date);
      for(const id of row.ids)await dbRun(tx, "INSERT INTO attendance(course_id,registration_id,attendance_date,status,recorded_by,created_at,source) VALUES(?,?,?,'absent',?,?,'manual') ON CONFLICT(course_id,registration_id,attendance_date) DO UPDATE SET status='absent',note='',recorded_by=excluded.recorded_by,created_at=excluded.created_at,source='manual'", row.courseId,id,input.date,actor.id,now);
    }
  });
  return {ok:true as const,classCount:prepared.length,absentCount:prepared.reduce((n,x)=>n+x.ids.length,0)};
}catch(e){return {ok:false as const,error:e instanceof Error?e.message:"ثبت گروهی حضور و غیاب انجام نشد."};}}

export async function recordManualLate(actor:AuthenticatedUser,input:{courseId:number;registrationId:number;date:string;arrivalTime:string;note:string}){if(actor.role!=="admin")return {ok:false as const,error:"فقط مدیر می‌تواند تأخیر را ثبت کند."};if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.arrivalTime))return {ok:false as const,error:"تاریخ یا ساعت ورود معتبر نیست."};const db=await academicDatabase(),course=(await dbGet(db, "SELECT grade,field_of_study AS fieldOfStudy,branch FROM courses WHERE id=?", input.courseId)) as {grade:string;fieldOfStudy:string;branch:string}|undefined;if(!course)return {ok:false as const,error:"کلاس پیدا نشد."};const student=(await dbGet(db, "SELECT id FROM student_registrations WHERE id=? AND status='approved' AND grade=? AND field_of_study=? AND branch=?", input.registrationId,course.grade,course.fieldOfStudy,course.branch));if(!student)return {ok:false as const,error:"دانش‌آموز در این کلاس نیست."};(await dbRun(db, "INSERT INTO attendance(course_id,registration_id,attendance_date,status,note,recorded_by,created_at,source,arrival_time) VALUES(?,?,?,'late',?,?,?,'manual',?) ON CONFLICT(course_id,registration_id,attendance_date) DO UPDATE SET status='late',note=excluded.note,recorded_by=excluded.recorded_by,created_at=excluded.created_at,source='manual',arrival_time=excluded.arrival_time", input.courseId,input.registrationId,input.date,input.note.trim().slice(0,500),actor.id,Date.now(),input.arrivalTime));return {ok:true as const};}

export async function saveAttendanceChannel(actor:AuthenticatedUser,channelId:string){if(actor.role!=="admin")return {ok:false as const,error:"فقط مدیر می‌تواند مقصد گزارش را تنظیم کند."};const value=channelId.trim().slice(0,160);const db=await academicDatabase();(await dbRun(db, "INSERT INTO app_settings(setting_key,setting_value) VALUES('attendance_channel_id',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value", value));return {ok:true as const};}

export async function saveSelectedAttendanceClasses(actor:AuthenticatedUser,keys:string[]){if(actor.role!=="admin")return {ok:false as const,error:"فقط مدیر می‌تواند کلاس‌های گزارش را تعیین کند."};if(!Array.isArray(keys)||keys.length>200||keys.some(k=>typeof k!=="string"||k.length>220))return {ok:false as const,error:"فهرست کلاس‌ها معتبر نیست."};const db=await academicDatabase(),valid=new Set(((await dbAll(db, "SELECT DISTINCT grade,field_of_study AS fieldOfStudy,branch FROM courses")) as Array<{grade:string;fieldOfStudy:string;branch:string}>).map(c=>`${c.grade}|${c.fieldOfStudy}|${c.branch}`));const unique=[...new Set(keys)];if(unique.some(k=>!valid.has(k)))return {ok:false as const,error:"یکی از کلاس‌های انتخاب‌شده در برنامهٔ مدرسه نیست."};(await dbRun(db, "INSERT INTO app_settings(setting_key,setting_value) VALUES('attendance_selected_classes',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value", JSON.stringify(unique)));return {ok:true as const,count:unique.length};}

export async function temporaryOnlineAbsenceReports(actor:AuthenticatedUser){if(actor.role!=="admin")return [];const db=await academicDatabase(),now=Date.now();(await dbRun(db, "DELETE FROM online_absence_reports WHERE expires_at<=?", now));const rows=(await dbAll(db, `SELECT r.id,r.attendance_date AS date,r.report_json AS reportJson,r.created_at AS createdAt,r.expires_at AS expiresAt,c.title AS course,c.grade,c.field_of_study AS fieldOfStudy,c.branch,c.period,u.display_name AS teacherName FROM online_absence_reports r JOIN courses c ON c.id=r.course_id JOIN users u ON u.id=r.submitted_by WHERE r.expires_at>? ORDER BY r.created_at DESC`, now)) as Array<{id:number;date:string;reportJson:string;createdAt:number;expiresAt:number;course:string;grade:string;fieldOfStudy:string;branch:string;period:number;teacherName:string}>;return rows.map(r=>({...r,students:(()=>{try{return JSON.parse(r.reportJson)}catch{return []}})()}));}

export async function dismissTemporaryOnlineReport(actor:AuthenticatedUser,id:number){if(actor.role!=="admin")return {ok:false as const,error:"فقط مدیر می‌تواند گزارش موقت را پاک کند."};const db=await academicDatabase();(await dbRun(db, "DELETE FROM online_absence_reports WHERE id=?", id));return {ok:true as const};}

export async function sendDailyAbsenceReport(actor:AuthenticatedUser,date:string){
 if(actor.role!=="admin")return {ok:false as const,error:"فقط مدیر می‌تواند گزارش روزانه را ارسال کند."};if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return {ok:false as const,error:"تاریخ معتبر نیست."};const db=await academicDatabase();if((await dbGet(db, "SELECT 1 FROM attendance_daily_message_log WHERE attendance_date=?", date)))return {ok:false as const,error:"گزارش این تاریخ قبلاً ارسال شده است."};const setting=(await dbGet(db, "SELECT setting_value AS value FROM app_settings WHERE setting_key='attendance_channel_id'")) as {value:string}|undefined;const channelId=(setting?.value||process.env.EITAAYAR_ATTENDANCE_CHANNEL_ID||"").trim();if(!channelId)return {ok:false as const,error:"ابتدا شناسهٔ کانال مقصد را ذخیره کنید."};const token=process.env.EITAAYAR_BOT_TOKEN||process.env.EITAAYAR_API_TOKEN||process.env.EITAAYAR_TOKEN;if(!token)return {ok:false as const,error:"توکن ایتایار در تنظیمات سرور موجود نیست؛ آن را با نام EITAAYAR_BOT_TOKEN در فایل .env.local بگذارید و سرور را دوباره اجرا کنید."};const selectedSetting=(await dbGet(db, "SELECT setting_value AS value FROM app_settings WHERE setting_key='attendance_selected_classes'")) as {value:string}|undefined;let keys:string[]=[];try{keys=JSON.parse(selectedSetting?.value||"[]")}catch{}if(!keys.length)return {ok:false as const,error:"مدیر هنوز کلاس‌های مشمول گزارش را انتخاب نکرده است."};const allowed=new Set(keys);const rows=((await dbAll(db, `SELECT r.full_name AS fullName,a.status,c.title AS course,c.grade,c.field_of_study AS fieldOfStudy,c.branch,c.period FROM attendance a JOIN student_registrations r ON r.id=a.registration_id JOIN courses c ON c.id=a.course_id WHERE a.attendance_date=? AND a.status IN ('absent','late') ORDER BY c.period,c.grade,c.branch,a.status,r.full_name`, date)) as Array<{fullName:string;status:string;course:string;grade:string;fieldOfStudy:string;branch:string;period:number}>).filter(r=>allowed.has(`${r.grade}|${r.fieldOfStudy}|${r.branch}`));if(!rows.length)return {ok:false as const,error:"برای کلاس‌های انتخاب‌شده در این تاریخ غیبت یا تأخیری ثبت نشده است."};const lines=rows.map(r=>`${r.grade} ${r.fieldOfStudy} شعبهٔ ${r.branch} · ${r.course} · زنگ ${r.period}: ${r.status==="late"?"تأخیری":"غایب"} ${r.fullName}`);const textMessage=`فهرست غایبین و تأخیری‌های روز ${date}\n${lines.join("\n")}`;try{const response=await fetch(`https://eitaayar.ir/api/${encodeURIComponent(token)}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({chat_id:channelId,text:textMessage,title:"گزارش روزانهٔ حضور و غیاب"}),signal:AbortSignal.timeout(12000)});let payload:{ok?:boolean};try{payload=await response.json() as {ok?:boolean}}catch{return {ok:false as const,error:"پاسخ ایتایار قابل خواندن نبود؛ ارسال را بررسی کنید."}}if(!response.ok||payload.ok!==true)return {ok:false as const,error:"ایتایار ارسال گزارش را تأیید نکرد؛ دسترسی ربات به کانال و شناسهٔ مقصد را بررسی کنید."};(await dbRun(db, "INSERT INTO attendance_daily_message_log(attendance_date,channel_id,message,sent_by,sent_at) VALUES(?,?,?,?,?)", date,channelId,textMessage,actor.id,Date.now()));return {ok:true as const};}catch{return {ok:false as const,error:"اتصال به ایتایار برقرار نشد؛ گزارش در سایت محفوظ است و ارسال نشده."}}
}


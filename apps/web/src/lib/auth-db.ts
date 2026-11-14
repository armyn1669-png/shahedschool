import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { getClient, isLocalDatabase, dbGet, dbAll, dbRun, dbExec, dbTransaction, TxReturn, type Client, type Db } from "./db";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const COOKIE_NAME = "school_session";

export const roleLabels = {
  admin: "مدیر مدرسه",
  teacher: "دبیر",
  student: "دانش‌آموز",
  guardian: "والد یا سرپرست",
} as const;

export type SchoolRole = keyof typeof roleLabels;
export type AuthenticatedUser = { id: number; username: string; role: SchoolRole; displayName: string; adminScope?: "site" | "school" | null; adminTitle?: string };

type UserRow = { id: number; username: string; role: SchoolRole; display_name: string; password_salt: string; password_hash: string; status: string; admin_scope?: "site" | "school" | null; admin_title?: string };
type SessionRow = { id: number; user_id: number; expires_at: number; revoked_at: number | null; username: string; role: SchoolRole; display_name: string; status: string; admin_scope?: "site" | "school" | null; admin_title?: string };

const runtime = globalThis as typeof globalThis & { __schoolDatabaseReady?: Promise<void>; __schoolDatabaseSchemaVersion?: number };
const SCHOOL_DATABASE_SCHEMA_VERSION=4;

async function migrateRegistrationColumns(db: Db) {
  (await dbExec(db, `CREATE TABLE IF NOT EXISTS student_registrations (
    id INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    national_id TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    grade TEXT NOT NULL,
    field_of_study TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT '۱',
    guardian_name TEXT NOT NULL,
    guardian_phone TEXT NOT NULL,
    address TEXT NOT NULL,
    password_salt TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    account_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    created_at INTEGER NOT NULL,
    reviewed_at INTEGER,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    profile_updated_at INTEGER
  )`));
  (await dbExec(db, "CREATE INDEX IF NOT EXISTS student_registrations_status_created_idx ON student_registrations(status, created_at DESC)"));
  const columns = new Set(((await dbAll(db, "PRAGMA table_info(student_registrations)")) as Array<{ name: string }>).map((column) => column.name));
  if (!columns.has("password_salt")) (await dbExec(db, "ALTER TABLE student_registrations ADD COLUMN password_salt TEXT NOT NULL DEFAULT ''"));
  if (!columns.has("password_hash")) (await dbExec(db, "ALTER TABLE student_registrations ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''"));
  if (!columns.has("account_user_id")) (await dbExec(db, "ALTER TABLE student_registrations ADD COLUMN account_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL"));
  if (!columns.has("branch")) (await dbExec(db, "ALTER TABLE student_registrations ADD COLUMN branch TEXT NOT NULL DEFAULT '۱'"));
  if (!columns.has("profile_updated_at")) (await dbExec(db, "ALTER TABLE student_registrations ADD COLUMN profile_updated_at INTEGER"));
}

async function migrateUserColumns(db: Db) {
  const columns = new Set(((await dbAll(db, "PRAGMA table_info(users)")) as Array<{ name: string }>).map((column) => column.name));
  if (!columns.has("phone")) (await dbExec(db, "ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''"));
  if (!columns.has("national_id")) (await dbExec(db, "ALTER TABLE users ADD COLUMN national_id TEXT NOT NULL DEFAULT ''"));
  if (!columns.has("admin_title")) (await dbExec(db, "ALTER TABLE users ADD COLUMN admin_title TEXT NOT NULL DEFAULT 'مدیر'"));
  if (!columns.has("admin_scope")) (await dbExec(db, "ALTER TABLE users ADD COLUMN admin_scope TEXT NOT NULL DEFAULT 'school'"));
  const siteAdmin=(await dbGet(db, "SELECT id FROM users WHERE role='admin' AND admin_scope='site' LIMIT 1")) as {id:number}|undefined;
  if(!siteAdmin){const firstAdmin=(await dbGet(db, "SELECT id FROM users WHERE role='admin' ORDER BY created_at,id LIMIT 1")) as {id:number}|undefined;if(firstAdmin)(await dbRun(db, "UPDATE users SET admin_scope='site',admin_title='مدیر سایت' WHERE id=?", firstAdmin.id));}
}

async function migrateTeacherRegistrationColumns(db: Db) {
  const teacherColumns = new Set(((await dbAll(db, "PRAGMA table_info(teacher_registrations)")) as Array<{ name: string }>).map((column) => column.name));
  if (!teacherColumns.has("national_id")) (await dbExec(db, "ALTER TABLE teacher_registrations ADD COLUMN national_id TEXT NOT NULL DEFAULT ''"));
}

function normalizeUsername(username: string) {
  return username.trim().normalize("NFKC").replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).toLowerCase();
}

/**
 * The ready database client. The schema is created on first use (inside
 * ensureDatabaseReady), so calling database() is safe from anywhere:
 * it awaits that initialisation. Returns the shared libsql client
 * (a local SQLite file when TURSO_DATABASE_URL is unset, a hosted
 * Turso database otherwise).
 */
export async function database(): Promise<Client> {
  return ensureDatabaseReady();
}

async function passwordDigest(password: string, salt: Buffer) {
  const key = await new Promise<Buffer>((resolveKey, rejectKey) => {
    scryptCallback(password, salt, 64, (error, derivedKey) => {
      if (error) rejectKey(error);
      else resolveKey(derivedKey);
    });
  });
  return key.toString("hex");
}

export async function ensureDatabaseReady(): Promise<Client> {
  if (!runtime.__schoolDatabaseReady) {
    runtime.__schoolDatabaseReady = (async () => {
      const client = getClient();
      if (isLocalDatabase()) {
        // Local file only: a hosted libsql server manages journaling and
        // connection settings itself, so these pragmas are not meaningful
        // (and not all are accepted) over the remote protocol.
        // (libsql also enforces foreign keys by default on local files.)
        await dbExec(client, "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
      }
      await dbExec(client, `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      national_id TEXT NOT NULL DEFAULT '',
      admin_title TEXT NOT NULL DEFAULT 'مدیر',
        admin_scope TEXT NOT NULL DEFAULT 'school',
      role TEXT NOT NULL CHECK (role IN ('admin','teacher','student','guardian')),
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY,
      identity_key TEXT NOT NULL,
      attempted_at INTEGER NOT NULL,
      succeeded INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS login_attempts_identity_time_idx ON login_attempts(identity_key, attempted_at);
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      subject_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS student_registrations (
      id INTEGER PRIMARY KEY,
      full_name TEXT NOT NULL,
      national_id TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      grade TEXT NOT NULL,
      field_of_study TEXT NOT NULL,
      branch TEXT NOT NULL DEFAULT '۱',
      guardian_name TEXT NOT NULL,
      guardian_phone TEXT NOT NULL,
      address TEXT NOT NULL,
      password_salt TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL DEFAULT '',
      account_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      created_at INTEGER NOT NULL,
      reviewed_at INTEGER,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      profile_updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS student_registrations_status_created_idx ON student_registrations(status, created_at DESC);
    CREATE TABLE IF NOT EXISTS teacher_registrations (
      id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, username TEXT NOT NULL UNIQUE, phone TEXT NOT NULL,
      password_salt TEXT NOT NULL, password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      created_at INTEGER NOT NULL, reviewed_at INTEGER, reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS teacher_registrations_status_created_idx ON teacher_registrations(status, created_at DESC);
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      grade TEXT NOT NULL,
      field_of_study TEXT NOT NULL,
      branch TEXT NOT NULL DEFAULT '۱',
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      weekday TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      room TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      registration_id INTEGER NOT NULL REFERENCES student_registrations(id) ON DELETE CASCADE,
      attendance_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('present','absent','late','excused')),
      note TEXT NOT NULL DEFAULT '',
      recorded_by INTEGER NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL,
      UNIQUE(course_id, registration_id, attendance_date)
    );
    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      registration_id INTEGER NOT NULL REFERENCES student_registrations(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      score REAL NOT NULL CHECK(score >= 0),
      max_score REAL NOT NULL CHECK(max_score > 0),
      recorded_by INTEGER NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS courses_teacher_schedule_idx ON courses(teacher_id, weekday, start_time);
    CREATE INDEX IF NOT EXISTS attendance_student_date_idx ON attendance(registration_id, attendance_date DESC);
    CREATE INDEX IF NOT EXISTS grades_student_created_idx ON grades(registration_id, created_at DESC);
  `);
      await migrateUserColumns(client);
      await migrateRegistrationColumns(client);
      await migrateTeacherRegistrationColumns(client);
      runtime.__schoolDatabaseSchemaVersion = SCHOOL_DATABASE_SCHEMA_VERSION;
      const count = ((await dbGet(client, "SELECT COUNT(*) AS count FROM users")) as { count: number }).count;
      if (count === 0 && process.env.SCHOOL_ADMIN_USERNAME && process.env.SCHOOL_ADMIN_PASSWORD) {
        const username = normalizeUsername(process.env.SCHOOL_ADMIN_USERNAME);
        const password = process.env.SCHOOL_ADMIN_PASSWORD;
        if (!/^[\p{L}\p{N}._-]{3,32}$/u.test(username) || password.length < 12) {
          throw new Error("تنظیم حساب مدیر معتبر نیست؛ نام کاربری ۳ تا ۳۲ نویسه و گذرواژه دست‌کم ۱۲ نویسه باشد.");
        }
        const salt = randomBytes(16);
        const hash = await passwordDigest(password, salt);
        await dbRun(client, "INSERT INTO users (username, display_name, admin_title, admin_scope, role, password_salt, password_hash, created_at) VALUES (?, ?, 'مدیر سایت', 'site', 'admin', ?, ?, ?)", username, username, salt.toString("hex"), hash, Date.now());
        await dbRun(client, "INSERT INTO audit_events (actor_user_id, event_type, created_at) VALUES (NULL, 'admin.bootstrap', ?)", Date.now());
      }
    })();
  }
  await runtime.__schoolDatabaseReady;
  if (runtime.__schoolDatabaseSchemaVersion !== SCHOOL_DATABASE_SCHEMA_VERSION) {
    // Schema version changed after initialisation (e.g. a dev-server reload
    // with a bumped version): re-run the column migrations.
    const client = getClient();
    await migrateUserColumns(client);
    await migrateRegistrationColumns(client);
    await migrateTeacherRegistrationColumns(client);
    runtime.__schoolDatabaseSchemaVersion = SCHOOL_DATABASE_SCHEMA_VERSION;
  }
  return getClient();
}

function safeEqualHex(expectedHex: string, actualHex: string) {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function normalizePhone(phone: string) {
  const value = phone.trim().replace(/[\s()-]/g, "").replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/^\+98/, "0").replace(/^0098/, "0");
  return /^09\d{9}$/.test(value) ? value : "";
}

export async function createInitialAdmin(usernameInput: string, password: string, setupToken: string, phoneInput: string) {
  const db = await ensureDatabaseReady();
  const configuredToken = process.env.SCHOOL_SETUP_TOKEN || "";
  if (!configuredToken || !setupToken || !safeEqualHex(createHash("sha256").update(configuredToken).digest("hex"), createHash("sha256").update(setupToken).digest("hex"))) {
    return { ok: false as const, error: "کد محرمانهٔ راه‌اندازی درست نیست." };
  }
  if ((await dbGet(db, "SELECT 1 FROM app_settings WHERE setting_key = 'initial_admin_created'"))) {
    return { ok: false as const, error: "راه‌اندازی اولیه قبلاً انجام شده است." };
  }
  const username = normalizeUsername(usernameInput);
  const phone = normalizePhone(phoneInput);
  if (!phone) return { ok: false as const, error: "شمارهٔ همراه مدیر را به‌صورت معتبر وارد کنید." };
  if (!/^[\p{L}\p{N}._-]{3,32}$/u.test(username)) {
    return { ok: false as const, error: "نام کاربری باید ۳ تا ۳۲ حرف، عدد یا نشانهٔ نقطه، خط تیره و زیرخط باشد." };
  }
  if (password.length < 12 || password.length > 128) {
    return { ok: false as const, error: "گذرواژه باید دست‌کم ۱۲ و حداکثر ۱۲۸ نویسه داشته باشد." };
  }

  try {
    return await dbTransaction(async (tx) => {
      const count = ((await dbGet(tx, "SELECT COUNT(*) AS count FROM users")) as { count: number }).count;
      if (count !== 0) {
        throw new TxReturn({ ok: false as const, error: "حساب مدیر از قبل ساخته شده است." });
      }
      const salt = randomBytes(16);
      const hash = await passwordDigest(password, salt);
      const result = await dbRun(tx, "INSERT INTO users (username, display_name, phone, admin_title, admin_scope, role, password_salt, password_hash, created_at) VALUES (?, ?, ?, 'مدیر سایت', 'site', 'admin', ?, ?, ?)", username, usernameInput.trim(), phone, salt.toString("hex"), hash, Date.now());
      const userId = Number(result.lastInsertRowid);
      await dbRun(tx, "INSERT INTO app_settings (setting_key, setting_value) VALUES ('initial_admin_created', 'true')");
      await dbRun(tx, "INSERT INTO audit_events (actor_user_id, event_type, subject_user_id, created_at) VALUES (?, 'admin.setup', ?, ?)", userId, userId, Date.now());
      return { ok: true as const, user: { id: userId, username, role: "admin" as const, displayName: usernameInput.trim(), adminScope:"site" as const, adminTitle:"مدیر سایت" } };
    });
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) return { ok: false as const, error: "این نام کاربری قبلاً استفاده شده است." };
    throw error;
  }
}

export async function authenticate(usernameInput: string, password: string, identityKey: string) {
  const db = await ensureDatabaseReady();
  const now = Date.now();
  (await dbRun(db, "DELETE FROM login_attempts WHERE attempted_at < ?", now - LOGIN_WINDOW_MS));
  const failures = ((await dbGet(db, "SELECT COUNT(*) AS count FROM login_attempts WHERE identity_key = ? AND succeeded = 0 AND attempted_at >= ?", identityKey, now - LOGIN_WINDOW_MS)) as { count: number }).count;
  if (failures >= LOGIN_MAX_FAILURES) return { ok: false as const, limited: true as const };

  const user = (await dbGet(db, "SELECT id, username, role, display_name, password_salt, password_hash, status, admin_scope, admin_title FROM users WHERE username = ?", normalizeUsername(usernameInput))) as UserRow | undefined;
  let valid = false;
  if (user && user.status === "active") {
    const digest = await passwordDigest(password, Buffer.from(user.password_salt, "hex"));
    valid = safeEqualHex(user.password_hash, digest);
  } else {
    await passwordDigest(password || "invalid", Buffer.alloc(16, 31));
  }
  (await dbRun(db, "INSERT INTO login_attempts (identity_key, attempted_at, succeeded) VALUES (?, ?, ?)", identityKey, now, valid ? 1 : 0));
  if (!valid || !user) return { ok: false as const, limited: false as const };
  (await dbRun(db, "DELETE FROM login_attempts WHERE identity_key = ?", identityKey));
  (await dbRun(db, "INSERT INTO audit_events (actor_user_id, event_type, subject_user_id, created_at) VALUES (?, 'auth.login', ?, ?)", user.id, user.id, now));
  return { ok: true as const, user: { id: user.id, username: user.username, role: user.role, displayName: user.display_name, adminScope:user.role==="admin"?(user.admin_scope||"school"):null, adminTitle:user.role==="admin"?(user.admin_title||"مدیر"):undefined } satisfies AuthenticatedUser };
}

export type StudentRegistrationInput = {
  fullName: string;
  nationalId: string;
  phone: string;
  grade: string;
  fieldOfStudy: string;
  branch: string;
  guardianName: string;
  guardianPhone: string;
  address: string;
};

export async function registerStudent(input: StudentRegistrationInput) {
  const db = await database();
  if ((await dbGet(db, "SELECT 1 FROM users WHERE username = ?", input.nationalId))) return { ok: false as const, error: "برای این کد ملی قبلاً حساب کاربری وجود دارد." };
  const salt = randomBytes(16);
  const hash = await passwordDigest(input.nationalId, salt);
  try {
    const result = (await dbRun(db, `INSERT INTO student_registrations
      (full_name, national_id, phone, grade, field_of_study, branch, guardian_name, guardian_phone, address, password_salt, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, input.fullName, input.nationalId, input.phone, input.grade, input.fieldOfStudy, input.branch, input.guardianName, input.guardianPhone, input.address, salt.toString("hex"), hash, Date.now()));
    return { ok: true as const, id: Number(result.lastInsertRowid) };
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) return { ok: false as const, error: "برای این کد ملی قبلاً درخواست ثبت شده است." };
    throw error;
  }
}

export async function createTeacherAccount(displayNameInput: string, nationalIdInput: string, phoneInput: string) {
  const db = await ensureDatabaseReady();
  const displayName = displayNameInput.trim().slice(0, 100);
  const nationalId=nationalIdInput.replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const username = nationalId;
  const phone = normalizePhone(phoneInput);
  if (!phone) return { ok: false as const, error: "شمارهٔ همراه دبیر را به‌صورت معتبر وارد کنید." };
  if (displayName.length < 3 || !/^\d{10}$/.test(nationalId)) return { ok: false as const, error: "نام کامل و کد ملی ۱۰ رقمی معتبر وارد کنید." };
  const salt = randomBytes(16);
  const hash = await passwordDigest(nationalId, salt);
  try {
    const result = (await dbRun(db, "INSERT INTO users (username, national_id, display_name, phone, role, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, 'teacher', ?, ?, ?)", username, nationalId, displayName, phone, salt.toString("hex"), hash, Date.now()));
    (await dbRun(db, "INSERT INTO audit_events (actor_user_id, event_type, subject_user_id, created_at) VALUES (?, 'teacher.created', ?, ?)", null, Number(result.lastInsertRowid), Date.now()));
    return { ok: true as const, username };
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) return { ok: false as const, error: "این نام کاربری قبلاً استفاده شده است." };
    throw error;
  }
}

export async function registerTeacher(input: { displayName: string; nationalId:string; phone: string }) {
  const db = await ensureDatabaseReady();
  const displayName = input.displayName.trim().slice(0, 100), nationalId=input.nationalId.replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))), username=nationalId, phone = normalizePhone(input.phone);
  if (!phone) return { ok: false as const, error: "شمارهٔ همراه را به‌صورت معتبر وارد کنید." };
  if (displayName.length < 3 || !/^\d{10}$/.test(nationalId)) return { ok: false as const, error: "نام کامل یا کد ملی ۱۰ رقمی معتبر نیست." };
  const salt = randomBytes(16), hash = await passwordDigest(nationalId, salt);
  try {
    (await dbRun(db, "INSERT INTO teacher_registrations(full_name,username,phone,password_salt,password_hash,created_at,national_id) VALUES(?,?,?,?,?,?,?)", displayName, username, phone, salt.toString("hex"), hash, Date.now(),nationalId));
    return { ok: true as const };
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) return { ok: false as const, error: "برای این نام کاربری قبلاً درخواست ثبت شده یا حسابی وجود دارد." };
    throw error;
  }
}

export async function listTeacherRegistrations() {
  const db = await ensureDatabaseReady();
  return (await dbAll(db, "SELECT id,full_name AS fullName,COALESCE(NULLIF(national_id,''),username) AS nationalId,phone,status,created_at AS createdAt FROM teacher_registrations ORDER BY created_at DESC LIMIT 200"));
}

export async function listTeacherAccounts(){const db=await ensureDatabaseReady();return (await dbAll(db, "SELECT id,display_name AS displayName,COALESCE(NULLIF(national_id,''),username) AS nationalId,phone,created_at AS createdAt FROM users WHERE role='teacher' AND status='active' ORDER BY display_name")) as Array<{id:number;displayName:string;nationalId:string;phone:string;createdAt:number}>;}

export async function listAdminAccounts(){const db=await ensureDatabaseReady();return (await dbAll(db, "SELECT id,username,display_name AS displayName,admin_title AS adminTitle,admin_scope AS adminScope,phone,status,created_at AS createdAt FROM users WHERE role='admin' ORDER BY CASE WHEN admin_scope='site' THEN 0 ELSE 1 END,created_at")) as Array<{id:number;username:string;displayName:string;adminTitle:string;adminScope:"site"|"school";phone:string;status:string;createdAt:number}>;}

export async function createAdminAccount(actor:AuthenticatedUser,input:{usernameInput:string;password:string;displayNameInput:string;phoneInput:string;adminTitle:"مدیر"|"ناظم"}){
  if(actor.role!=="admin"||actor.adminScope!=="site")return {ok:false as const,error:"فقط مدیر سایت می‌تواند حساب مدیر یا ناظم بسازد."};
  const username=normalizeUsername(input.usernameInput),displayName=input.displayNameInput.trim(),phone=normalizePhone(input.phoneInput);
  if(!["مدیر","ناظم"].includes(input.adminTitle))return {ok:false as const,error:"سمت انتخاب‌شده معتبر نیست."};
  if(!/^[\p{L}\p{N}._-]{3,32}$/u.test(username))return {ok:false as const,error:"نام کاربری باید ۳ تا ۳۲ نویسهٔ معتبر باشد."};
  if(displayName.length<2||displayName.length>100)return {ok:false as const,error:"نام و نام خانوادگی را کامل وارد کنید."};
  if(input.password.length<12||input.password.length>128)return {ok:false as const,error:"گذرواژه باید دست‌کم ۱۲ نویسه داشته باشد."};
  if(input.phoneInput.trim()&&!phone)return {ok:false as const,error:"شمارهٔ همراه معتبر نیست."};
  await ensureDatabaseReady();
  try{
    return await dbTransaction(async (tx)=>{
      const count=((await dbGet(tx, "SELECT COUNT(*) AS count FROM users WHERE role='admin'")) as {count:number}).count;
      if(count>=4)throw new TxReturn({ok:false as const,error:"حداکثر چهار حساب مدیر سایت، مدیر و ناظم مجاز است."});
      const salt=randomBytes(16),hash=await passwordDigest(input.password,salt),result=await dbRun(tx, "INSERT INTO users(username,display_name,admin_title,admin_scope,phone,role,password_salt,password_hash,created_at) VALUES(?,?,?,'school',?,'admin',?,?,?)", username,displayName,input.adminTitle,phone,salt.toString("hex"),hash,Date.now()),id=Number(result.lastInsertRowid);
      await dbRun(tx, "INSERT INTO audit_events(actor_user_id,event_type,subject_user_id,created_at) VALUES(?,'admin.account.created',?,?)", actor.id,id,Date.now());
      return {ok:true as const,id};
    });
  }catch(error){
    if(String(error).includes("UNIQUE constraint failed"))return {ok:false as const,error:"این نام کاربری قبلاً استفاده شده است."};
    throw error;
  }
}

export async function reviewTeacherRegistration(id: number, status: "approved" | "rejected", adminId: number) {
  await ensureDatabaseReady();
  try {
    return await dbTransaction(async (tx) => {
      const reg = (await dbGet(tx, "SELECT * FROM teacher_registrations WHERE id=? AND status='pending'", id)) as { id:number;full_name:string;username:string;phone:string;password_salt:string;password_hash:string;national_id:string } | undefined;
      if (!reg) { throw new TxReturn({ ok:false as const,error:"درخواست در انتظار بررسی پیدا نشد." }); }
      if (status === "approved") {
        if ((await dbGet(tx, "SELECT 1 FROM users WHERE username=?", reg.username))) throw new Error("این نام کاربری قبلاً برای یک حساب استفاده شده است.");
        const created = (await dbRun(tx, "INSERT INTO users(username,national_id,display_name,phone,role,password_salt,password_hash,created_at) VALUES(?,?,?,?,'teacher',?,?,?)", reg.national_id,reg.national_id,reg.full_name,reg.phone,reg.password_salt,reg.password_hash,Date.now()));
        (await dbRun(tx, "INSERT INTO audit_events(actor_user_id,event_type,subject_user_id,created_at) VALUES(?,'teacher.approved',?,?)", adminId,Number(created.lastInsertRowid),Date.now()));
      }
      (await dbRun(tx, "UPDATE teacher_registrations SET status=?,reviewed_at=?,reviewed_by=? WHERE id=?", status,Date.now(),adminId,id));
      return { ok:true as const };
    });
  } catch (error) { return { ok:false as const,error:error instanceof Error?error.message:"بررسی درخواست انجام نشد." }; }
}

export async function updateStaffPhone(userId: number, phoneInput: string) {
  const phone = normalizePhone(phoneInput);
  if (!phone) return { ok: false as const, error: "شمارهٔ همراه را به‌صورت معتبر وارد کنید." };
  const result = (await dbRun((await ensureDatabaseReady()), "UPDATE users SET phone=? WHERE id=? AND role IN ('admin','teacher') AND status='active'", phone, userId));
  return result.changes ? { ok: true as const, phone } : { ok: false as const, error: "حساب کارکنان پیدا نشد." };
}

export async function staffContact(userId: number) {
  return (await dbGet((await ensureDatabaseReady()), "SELECT display_name AS displayName, phone FROM users WHERE id=? AND role IN ('admin','teacher') AND status='active'", userId)) as { displayName: string; phone: string } | undefined;
}

export async function updateTeacherCredentials(actor: AuthenticatedUser, input: { userId: number; username: string; password?: string;displayName?:string;phone?:string }) {
  const db = await ensureDatabaseReady();
  const username = normalizeUsername(input.username);
  if (!/^\d{10}$/.test(username)) return { ok:false as const,error:"نام کاربری دبیر باید کد ملی ۱۰ رقمی باشد." };
  if (input.password && (input.password.length < 12 || input.password.length > 128)) return { ok:false as const,error:"گذرواژه باید ۱۲ تا ۱۲۸ نویسه باشد." };
  const targetId = actor.role === "admin" ? input.userId : actor.id;
  const target = (await dbGet(db, "SELECT id FROM users WHERE id=? AND role='teacher' AND status='active'", targetId));
  if (!target) return { ok:false as const,error:"حساب دبیر پیدا نشد." };
  try {
  const displayName=input.displayName?.trim().slice(0,100),phone=input.phone===undefined?undefined:normalizePhone(input.phone);
  if(displayName!==undefined&&displayName.length<3)return {ok:false as const,error:"نام دبیر را کامل وارد کنید."};
  if(phone==="")return {ok:false as const,error:"شمارهٔ همراه معتبر نیست."};
  if (input.password) {
      const salt=randomBytes(16), hash=await passwordDigest(input.password,salt);
      (await dbRun(db, "UPDATE users SET username=?,national_id=?,password_salt=?,password_hash=?,display_name=COALESCE(?,display_name),phone=COALESCE(?,phone) WHERE id=? AND role='teacher'", username,username,salt.toString("hex"),hash,displayName??null,phone??null,targetId));
      (await dbRun(db, "UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", Date.now(),targetId));
    } else {const salt=randomBytes(16),hash=await passwordDigest(username,salt);(await dbRun(db, "UPDATE users SET username=?,national_id=?,password_salt=?,password_hash=?,display_name=COALESCE(?,display_name),phone=COALESCE(?,phone) WHERE id=? AND role='teacher'", username,username,salt.toString("hex"),hash,displayName??null,phone??null,targetId));}
    (await dbRun(db, "INSERT INTO audit_events(actor_user_id,event_type,subject_user_id,created_at) VALUES(?,'teacher.credentials.updated',?,?)", actor.id,targetId,Date.now()));
    return {ok:true as const,username};
  } catch(error) {
    if(String(error).includes("UNIQUE constraint failed")) return {ok:false as const,error:"این نام کاربری قبلاً استفاده شده است."};
    throw error;
  }
}

export async function updateOwnTeacherCredentials(userId:number,input:{username:string;currentPassword:string;newPassword:string}) {
  const db=await ensureDatabaseReady(),username=normalizeUsername(input.username);
  if(!/^[\p{L}\p{N}._-]{3,32}$/u.test(username))return {ok:false as const,error:"نام کاربری باید ۳ تا ۳۲ حرف یا عدد و بدون فاصله باشد."};
  const user=(await dbGet(db, "SELECT password_salt,password_hash FROM users WHERE id=? AND role='teacher'", userId)) as {password_salt:string;password_hash:string}|undefined;
  if(!user)return {ok:false as const,error:"حساب دبیر پیدا نشد."};
  const current=await passwordDigest(input.currentPassword,Buffer.from(user.password_salt,"hex"));
  if(!safeEqualHex(user.password_hash,current))return {ok:false as const,error:"گذرواژهٔ فعلی درست نیست."};
  if(input.newPassword.length<12||input.newPassword.length>128)return {ok:false as const,error:"گذرواژهٔ جدید باید ۱۲ تا ۱۲۸ نویسه باشد."};
  try{const salt=randomBytes(16),hash=await passwordDigest(input.newPassword,salt);(await dbRun(db, "UPDATE users SET username=?,password_salt=?,password_hash=? WHERE id=?", username,salt.toString("hex"),hash,userId));(await dbRun(db, "UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", Date.now(),userId));return {ok:true as const,username};}
  catch(error){if(String(error).includes("UNIQUE constraint failed"))return {ok:false as const,error:"این نام کاربری قبلاً استفاده شده است."};throw error;}
}

export async function studentProfile(userId: number) {
  const db = await ensureDatabaseReady();
  return (await dbGet(db, `SELECT r.full_name AS fullName, r.national_id AS nationalId, r.phone, r.grade,
    r.field_of_study AS fieldOfStudy, r.branch, r.guardian_name AS guardianName, r.guardian_phone AS guardianPhone
    FROM student_registrations r WHERE r.account_user_id = ? AND r.status = 'approved'`, userId)) as {
      fullName: string; nationalId: string; phone: string; grade: string; fieldOfStudy: string; branch:string; guardianName: string; guardianPhone: string;
    } | undefined;
}

export async function studentNeedsYearUpdate(userId:number){const db=await ensureDatabaseReady();const cutoff=(await dbGet(db, "SELECT setting_value AS value FROM app_settings WHERE setting_key='school_year_update_at'")) as {value:string}|undefined;if(!cutoff)return false;const at=Number(cutoff.value);if(!Number.isFinite(at)||Date.now()<at)return false;const row=(await dbGet(db, "SELECT created_at AS createdAt,profile_updated_at AS updatedAt FROM student_registrations WHERE account_user_id=? AND status='approved'", userId)) as {createdAt:number;updatedAt:number|null}|undefined;return !!row&&row.createdAt<at&&(!row.updatedAt||row.updatedAt<at);}

export async function updateCurrentStudentYear(userId:number,input:{grade:string;fieldOfStudy:string;branch:string}){const db=await ensureDatabaseReady();if(!input.grade.trim()||!input.fieldOfStudy.trim()||!input.branch.trim())return {ok:false as const,error:"پایه، رشته و شعبه را کامل انتخاب کنید."};const result=(await dbRun(db, "UPDATE student_registrations SET grade=?,field_of_study=?,branch=?,profile_updated_at=? WHERE account_user_id=? AND status='approved'", input.grade.trim(),input.fieldOfStudy.trim(),input.branch.trim(),Date.now(),userId));if(!result.changes)return {ok:false as const,error:"پروندهٔ دانش‌آموز تأییدشده پیدا نشد."};(await dbRun(db, "INSERT INTO audit_events(actor_user_id,event_type,subject_user_id,created_at) VALUES(?,?,?,?)", userId,"student.school_year.updated",userId,Date.now()));return {ok:true as const};}

export async function listStudentRegistrations() {
  return (await dbAll(await database(), `SELECT id, full_name AS fullName, national_id AS nationalId, national_id AS username, phone, grade,
    field_of_study AS fieldOfStudy, branch, guardian_name AS guardianName, guardian_phone AS guardianPhone,
    address, status, created_at AS createdAt FROM student_registrations ORDER BY created_at DESC`)) as Array<{
      id: number; fullName: string; nationalId: string; username:string; phone: string; grade: string; fieldOfStudy: string; branch:string;
      guardianName: string; guardianPhone: string; address: string; status: string; createdAt: number;
    }>;
}

export async function updateStudentRegistration(id:number, input:{fullName:string;nationalId:string;phone:string;grade:string;fieldOfStudy:string;branch:string;guardianName:string;guardianPhone:string;address:string}, adminId:number) {
  const db=await ensureDatabaseReady();
  const nationalId=input.nationalId.replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if(!Number.isSafeInteger(id)||id<1||input.fullName.trim().length<3||input.fullName.length>100||!/^[0-9]{10}$/.test(nationalId)||!input.grade.trim()||!input.fieldOfStudy.trim()||!input.branch.trim())return {ok:false as const,error:"نام، کد ملی، پایه، رشته و شعبه را درست وارد کنید."};
  const reg=(await dbGet(db, "SELECT account_user_id AS userId,national_id AS nationalId FROM student_registrations WHERE id=?", id)) as {userId:number|null;nationalId:string}|undefined;
  if(!reg)return {ok:false as const,error:"پروندهٔ دانش‌آموز پیدا نشد."};
  try{
    const salt=reg.userId&&nationalId!==reg.nationalId?randomBytes(16):null;
    const hash=salt?await passwordDigest(nationalId,salt):null;
    await dbTransaction(async (tx)=>{
      await dbRun(tx, "UPDATE student_registrations SET full_name=?,national_id=?,phone=?,grade=?,field_of_study=?,branch=?,guardian_name=?,guardian_phone=?,address=? WHERE id=?", input.fullName.trim(),nationalId,input.phone.trim(),input.grade.trim(),input.fieldOfStudy.trim(),input.branch.trim(),input.guardianName.trim(),input.guardianPhone.trim(),input.address.trim(),id);
      if(reg.userId){
        if(salt)await dbRun(tx, "UPDATE users SET username=?,national_id=?,password_salt=?,password_hash=? WHERE id=? AND role='student'", nationalId,nationalId,salt.toString("hex"),hash,reg.userId);
        else await dbRun(tx, "UPDATE users SET display_name=?,phone=? WHERE id=? AND role='student'", input.fullName.trim(),input.phone.trim(),reg.userId);
        if(salt)await dbRun(tx, "UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", Date.now(),reg.userId);
      }
      await dbRun(tx, "INSERT INTO audit_events(actor_user_id,event_type,subject_user_id,created_at) VALUES(?,'student.profile.updated',?,?)", adminId,reg.userId,Date.now());
    });
    return {ok:true as const};
  }catch(e){if(String(e).includes("UNIQUE constraint failed"))return {ok:false as const,error:"این کد ملی قبلاً برای حساب دیگری ثبت شده است."};throw e;}
}

export async function deleteStudentRegistration(id:number,adminId:number){
  const db=await ensureDatabaseReady();
  const row=(await dbGet(db, "SELECT account_user_id AS userId FROM student_registrations WHERE id=?", id)) as {userId:number|null}|undefined;
  if(!row)return {ok:false as const,error:"پروندهٔ دانش‌آموز پیدا نشد."};
  await dbTransaction(async (tx)=>{
    await dbRun(tx, "DELETE FROM student_registrations WHERE id=?", id);
    if(row.userId)await dbRun(tx, "DELETE FROM users WHERE id=? AND role='student'", row.userId);
    await dbRun(tx, "INSERT INTO audit_events(actor_user_id,event_type,subject_user_id,created_at) VALUES(?,'student.account.deleted',NULL,?)", adminId,Date.now());
  });
  return {ok:true as const};
}

export async function resetStudentPassword(registrationId:number,adminId:number){
 const db=await ensureDatabaseReady();
 const reg=(await dbGet(db, "SELECT account_user_id AS userId,national_id AS nationalId FROM student_registrations WHERE id=? AND status='approved'", registrationId)) as {userId:number|null;nationalId:string}|undefined;
 if(!reg?.userId)return {ok:false as const,error:"دانش‌آموز تأییدشده یا حساب ورود او پیدا نشد."};
 const salt=randomBytes(16),hash=await passwordDigest(reg.nationalId,salt);(await dbRun(db, "UPDATE users SET username=?,national_id=?,password_salt=?,password_hash=? WHERE id=? AND role='student'", reg.nationalId,reg.nationalId,salt.toString("hex"),hash,reg.userId));(await dbRun(db, "UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", Date.now(),reg.userId));(await dbRun(db, "INSERT INTO audit_events(actor_user_id,event_type,subject_user_id,created_at) VALUES(?,'student.credentials.reset_to_national_id',?,?)", adminId,reg.userId,Date.now()));return {ok:true as const};
}

export async function syncTeacherLoginToNationalId(userId:number,nationalIdInput:string,adminId:number){const db=await ensureDatabaseReady(),nationalId=nationalIdInput.replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));if(!/^\d{10}$/.test(nationalId))return {ok:false as const,error:"کد ملی باید ۱۰ رقم باشد."};const teacher=(await dbGet(db, "SELECT id FROM users WHERE id=? AND role='teacher' AND status='active'", userId));if(!teacher)return {ok:false as const,error:"حساب دبیر پیدا نشد."};try{const salt=randomBytes(16),hash=await passwordDigest(nationalId,salt);(await dbRun(db, "UPDATE users SET username=?,national_id=?,password_salt=?,password_hash=? WHERE id=?", nationalId,nationalId,salt.toString("hex"),hash,userId));(await dbRun(db, "UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", Date.now(),userId));(await dbRun(db, "INSERT INTO audit_events(actor_user_id,event_type,subject_user_id,created_at) VALUES(?,'teacher.login.reset_to_national_id',?,?)", adminId,userId,Date.now()));return {ok:true as const};}catch(e){if(String(e).includes("UNIQUE constraint failed"))return {ok:false as const,error:"این کد ملی قبلاً برای حساب دیگری ثبت شده است."};throw e;}}

export async function reviewStudentRegistration(id: number, status: "approved" | "rejected", adminId: number) {
  await ensureDatabaseReady();
  return dbTransaction(async (tx): Promise<boolean> => {
    const registration = (await dbGet(tx, "SELECT national_id, full_name, password_salt, password_hash FROM student_registrations WHERE id = ? AND status = 'pending'", id)) as { national_id: string; full_name: string; password_salt: string; password_hash: string } | undefined;
    if (!registration) { throw new TxReturn(false); }
    if (status === "approved") {
      if ((await dbGet(tx, "SELECT 1 FROM users WHERE username = ?", registration.national_id))) throw new Error("این کد ملی از قبل حساب کاربری دارد.");
      const created = (await dbRun(tx, "INSERT INTO users (username, national_id, display_name, role, password_salt, password_hash, created_at) VALUES (?, ?, ?, 'student', ?, ?, ?)", registration.national_id, registration.national_id, registration.full_name, registration.password_salt, registration.password_hash, Date.now()));
      (await dbRun(tx, "UPDATE student_registrations SET account_user_id = ? WHERE id = ?", Number(created.lastInsertRowid), id));
    }
    (await dbRun(tx, "UPDATE student_registrations SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?", status, Date.now(), adminId, id));
    return true;
  });
}

export async function issueSession(userId: number) {
  const db = await ensureDatabaseReady();
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const now = Date.now();
  (await dbRun(db, "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", tokenHash, userId, now + SESSION_LIFETIME_SECONDS * 1000, now));
  return { token: rawToken, maxAge: SESSION_LIFETIME_SECONDS, cookieName: COOKIE_NAME };
}

export async function resolveSession(token: string | undefined): Promise<AuthenticatedUser | null> {
  if (!token) return null;
  const db = await ensureDatabaseReady();
  const hash = createHash("sha256").update(token).digest("hex");
  const session = (await dbGet(db, `SELECT s.id, s.user_id, s.expires_at, s.revoked_at, u.username, u.role, u.display_name, u.status,u.admin_scope,u.admin_title
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`, hash)) as SessionRow | undefined;
  if (!session || session.revoked_at || session.expires_at <= Date.now() || session.status !== "active") return null;
  return { id: session.user_id, username: session.username, role: session.role, displayName: session.display_name, adminScope:session.role==="admin"?(session.admin_scope||"school"):null, adminTitle:session.role==="admin"?(session.admin_title||"مدیر"):undefined };
}

export async function revokeSession(token: string | undefined) {
  if (!token) return;
  const db = await ensureDatabaseReady();
  const hash = createHash("sha256").update(token).digest("hex");
  (await dbRun(db, "UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL", Date.now(), hash));
}

export function sessionCookieOptions(maxAge: number) {
  return { httpOnly: true as const, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge };
}

export { COOKIE_NAME };


import { database, type AuthenticatedUser } from "@/lib/auth-db";
import { academicDatabase } from "@/lib/academic-db";
import { dbGet, dbAll, dbRun, dbExec, dbTransaction, type Db } from "@/lib/db";
const groupsSchemaCache=globalThis as typeof globalThis & {__schoolGroupsSchemaVersion?:number;__schoolGroupsDatabases?:WeakSet<object>};
const GROUPS_SCHEMA_VERSION=2;

export async function groupsDb(){
  const db=await academicDatabase();
  if(groupsSchemaCache.__schoolGroupsSchemaVersion!==GROUPS_SCHEMA_VERSION){groupsSchemaCache.__schoolGroupsSchemaVersion=GROUPS_SCHEMA_VERSION;groupsSchemaCache.__schoolGroupsDatabases=new WeakSet<object>();}
  const ready=groupsSchemaCache.__schoolGroupsDatabases!;if(ready.has(db))return db;
  (await dbExec(db, `CREATE TABLE IF NOT EXISTS school_groups(
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL CHECK(kind IN ('channel','group')),
    visibility TEXT NOT NULL CHECK(visibility IN ('school','selected')), external_url TEXT NOT NULL DEFAULT '', image_data TEXT NOT NULL DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, system_key TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS school_group_courses(
    group_id INTEGER NOT NULL REFERENCES school_groups(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE, PRIMARY KEY(group_id,course_id)
  );
  CREATE TABLE IF NOT EXISTS school_group_members(
    group_id INTEGER NOT NULL REFERENCES school_groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_role TEXT NOT NULL CHECK(member_role IN ('manager','member')),
    added_at INTEGER NOT NULL, PRIMARY KEY(group_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS school_group_targets(
    group_id INTEGER NOT NULL REFERENCES school_groups(id) ON DELETE CASCADE,
    grade TEXT NOT NULL, field_of_study TEXT NOT NULL, branch TEXT NOT NULL,
    PRIMARY KEY(group_id,grade,field_of_study,branch)
  );
  CREATE INDEX IF NOT EXISTS school_group_members_user_idx ON school_group_members(user_id,group_id);`));
  const columns=new Set(((await dbAll(db, "PRAGMA table_info(school_groups)")) as Array<{name:string}>).map(x=>x.name));
  if(!columns.has("system_key"))(await dbExec(db, "ALTER TABLE school_groups ADD COLUMN system_key TEXT NOT NULL DEFAULT ''"));
  (await dbExec(db, "CREATE UNIQUE INDEX IF NOT EXISTS school_groups_system_key_idx ON school_groups(system_key) WHERE system_key<>''"));
  ready.add(db);
  return db;
}

async function seedSchoolChannels(db:Db){
  const owner=(await dbGet(db, "SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1")) as {id:number}|undefined;if(!owner)return;
  const alreadySeeded=!!(await dbGet(db, "SELECT 1 FROM app_settings WHERE setting_key='default_school_channels_seeded'"));
  const defaults:Array<{key:string;name:string;description:string;url:string;image:string;visibility:"school"|"selected";branch?:string}>=[
    {key:"school-cultural",name:"کانال معاونت پرورشی مدرسه شاهد سید احمد خمینی (ره)",description:"اطلاعیه‌ها و برنامه‌های معاونت پرورشی مدرسه.",url:"https://eitaa.com/shahed_seyedahmad_khomeini",image:"/channels/school-cultural.svg",visibility:"school"},
    {key:"math-10-1",name:"دهم ریاضی ۱",description:"کانال اطلاع‌رسانی کلاس دهم ریاضی، شعبهٔ ۱.",url:"https://eitaa.com/joinchat/2045970173C43430e2127",image:"/channels/math-10-1.svg",visibility:"selected",branch:"۱"},
    {key:"math-10-2",name:"دهم ریاضی ۲",description:"کانال اطلاع‌رسانی کلاس دهم ریاضی، شعبهٔ ۲.",url:"https://eitaa.com/joinchat/2057438973Cf9f15cf72b",image:"/channels/math-10-2.svg",visibility:"selected",branch:"۲"}
  ];
  for(const item of defaults){let found=(await dbGet(db, "SELECT id FROM school_groups WHERE system_key=?", item.key)) as {id:number}|undefined;if(!found){const result=(await dbRun(db, "INSERT INTO school_groups(name,description,kind,visibility,external_url,image_data,created_by,created_at,system_key) VALUES(?,?,'channel',?,?,?,?,?,?)", item.name,item.description,item.visibility,item.url,item.image,owner.id,Date.now(),item.key));found={id:Number(result.lastInsertRowid)};}
    if(!found||!item.branch)continue;
    (await dbRun(db, "INSERT OR IGNORE INTO school_group_targets(group_id,grade,field_of_study,branch) VALUES(?,'دهم','ریاضی',?)", found.id,item.branch==="۱"?"1":"2"));
    const courses=(await dbAll(db, "SELECT id,teacher_id AS teacherId,grade,field_of_study AS fieldOfStudy,branch FROM courses WHERE grade='دهم' AND field_of_study LIKE '%ریاضی%' AND branch IN (?,?)", item.branch,item.branch==="۱"?"1":"2")) as Array<{id:number;teacherId:number;grade:string;fieldOfStudy:string;branch:string}>;
    for(const course of courses){(await dbRun(db, "INSERT OR IGNORE INTO school_group_courses(group_id,course_id) VALUES(?,?)", found.id,course.id));(await dbRun(db, "INSERT OR IGNORE INTO school_group_members(group_id,user_id,member_role,added_at) VALUES(?,?,'manager',?)", found.id,course.teacherId,Date.now()));const roster=(await dbAll(db, "SELECT account_user_id AS userId FROM student_registrations WHERE status='approved' AND account_user_id IS NOT NULL AND grade=? AND field_of_study=? AND branch=?", course.grade,course.fieldOfStudy,course.branch)) as Array<{userId:number}>;for(const student of roster)(await dbRun(db, "INSERT OR IGNORE INTO school_group_members(group_id,user_id,member_role,added_at) VALUES(?,?,'member',?)", found.id,student.userId,Date.now()));}
  }
  if(!alreadySeeded)(await dbRun(db, "INSERT OR IGNORE INTO app_settings(setting_key,setting_value) VALUES('default_school_channels_seeded','true')"));
}

export async function schoolGroupsSnapshot(user:AuthenticatedUser){
  const db=await groupsDb();
  await seedSchoolChannels(db);
  const groups=(await dbAll(db, `SELECT g.id,g.name,g.description,g.kind,g.visibility,g.external_url AS externalUrl,CASE WHEN g.image_data LIKE 'data:image/%' THEN '/api/school-groups/'||g.id||'/image' ELSE g.image_data END AS imageData,
    g.created_at AS createdAt,u.display_name AS createdBy,
    (SELECT COUNT(*) FROM school_group_members m WHERE m.group_id=g.id AND m.member_role='member') AS memberCount,
    EXISTS(SELECT 1 FROM school_group_members m WHERE m.group_id=g.id AND m.user_id=?) AS isMember
    FROM school_groups g JOIN users u ON u.id=g.created_by
    WHERE ?='admin' OR g.visibility='school' OR EXISTS(SELECT 1 FROM school_group_members m WHERE m.group_id=g.id AND m.user_id=?) OR EXISTS(SELECT 1 FROM school_group_courses gc JOIN courses sc ON sc.id=gc.course_id WHERE gc.group_id=g.id AND ((?='teacher' AND sc.teacher_id=?) OR (?='student' AND EXISTS(SELECT 1 FROM student_registrations sr WHERE sr.account_user_id=? AND sr.status='approved' AND sr.grade=sc.grade AND sr.field_of_study=sc.field_of_study AND sr.branch=sc.branch))))
    OR (?='student' AND EXISTS(SELECT 1 FROM school_group_targets t JOIN student_registrations r ON r.account_user_id=? AND r.status='approved' WHERE t.group_id=g.id AND (r.grade=t.grade OR r.grade IN ('پایه دهم','۱۰','10')) AND r.field_of_study LIKE '%'||t.field_of_study||'%' AND REPLACE(REPLACE(REPLACE(r.branch,'۱','1'),'۲','2'),' ','')=t.branch))
    ORDER BY g.created_at DESC`, user.id,user.role,user.id,user.role,user.id,user.role,user.id,user.role,user.id));
  if(user.role!=="admin") return {groups,courses:[],staff:[]};
  const courses=(await dbAll(db, `SELECT c.id,c.title,c.grade,c.field_of_study AS fieldOfStudy,c.branch,c.room,u.display_name AS teacherName,
    (SELECT COUNT(*) FROM student_registrations r WHERE r.status='approved' AND r.grade=c.grade AND r.field_of_study=c.field_of_study AND r.branch=c.branch AND r.account_user_id IS NOT NULL) AS studentCount
    FROM courses c JOIN users u ON u.id=c.teacher_id ORDER BY c.grade,c.title,c.room`));
  const staff=(await dbAll(db, "SELECT id,display_name AS displayName,role FROM users WHERE role IN ('admin','teacher') AND status='active' ORDER BY role,display_name"));
  return {groups,courses,staff};
}

export async function schoolGroupImage(user:AuthenticatedUser,id:number){const db=await groupsDb();const row=(await dbGet(db, `SELECT g.image_data AS imageData FROM school_groups g WHERE g.id=? AND ( ?='admin' OR g.visibility='school' OR EXISTS(SELECT 1 FROM school_group_members m WHERE m.group_id=g.id AND m.user_id=?) OR EXISTS(SELECT 1 FROM school_group_courses gc JOIN courses c ON c.id=gc.course_id WHERE gc.group_id=g.id AND ((?='teacher' AND c.teacher_id=?) OR (?='student' AND EXISTS(SELECT 1 FROM student_registrations r WHERE r.account_user_id=? AND r.status='approved' AND r.grade=c.grade AND r.field_of_study=c.field_of_study AND r.branch=c.branch)))) OR (?='student' AND EXISTS(SELECT 1 FROM school_group_targets t JOIN student_registrations r ON r.account_user_id=? AND r.status='approved' WHERE t.group_id=g.id AND (r.grade=t.grade OR r.grade IN ('پایه دهم','۱۰','10')) AND r.field_of_study LIKE '%'||t.field_of_study||'%' AND REPLACE(REPLACE(REPLACE(r.branch,'۱','1'),'۲','2'),' ','')=t.branch))`, id,user.role,user.id,user.role,user.id,user.role,user.id,user.role,user.id)) as {imageData:string}|undefined;if(!row?.imageData)return null;const match=row.imageData.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!match)return null;return {mime:`image/${match[1]}`,bytes:Buffer.from(match[2],"base64")};}

export async function createSchoolGroup(owner:AuthenticatedUser,input:{name:string;description:string;kind:"channel"|"group";visibility:"school"|"selected";externalUrl:string;imageData:string;courseIds:number[];staffIds:number[]}){
  const db=await groupsDb();
  const selectedCourses=[...new Set(input.courseIds)];
  const selectedStaff=[...new Set(input.staffIds)];
  const courses=selectedCourses.length?(await dbAll(db, `SELECT id,grade,field_of_study AS fieldOfStudy,branch,teacher_id AS teacherId FROM courses WHERE id IN (${selectedCourses.map(()=>"?").join(",")})`, ...selectedCourses)) as Array<{id:number;grade:string;fieldOfStudy:string;branch:string;teacherId:number}>:[];
  if(courses.length!==selectedCourses.length)return {ok:false as const,error:"یکی از کلاس‌های انتخاب‌شده دیگر در دسترس نیست."};
  if(input.visibility==="selected"&&!selectedCourses.length&&!selectedStaff.length)return {ok:false as const,error:"برای گروه خصوصی دست‌کم یک کلاس یا دبیر انتخاب کنید."};
  const eitaaUrl=input.externalUrl.trim();
  if(eitaaUrl){try{const url=new URL(eitaaUrl);if(url.protocol!=="https:"||!/(^|\.)eitaa\.com$|(^|\.)eitaa\.ir$/i.test(url.hostname))return {ok:false as const,error:"لینک باید نشانی امن یک صفحه یا کانال ایتا باشد."};}catch{return {ok:false as const,error:"لینک ایتا معتبر نیست."};}}
  if(input.kind==="channel"&&!eitaaUrl)return {ok:false as const,error:"برای ثبت کانال ایتا، لینک کانال را وارد کنید."};
  if(input.imageData&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.imageData))return {ok:false as const,error:"تصویر باید PNG، JPG یا WebP باشد."};
  const managerCandidates=new Set<number>([owner.id,...selectedStaff,...courses.map(c=>c.teacherId)]);
  if(managerCandidates.size>1){const ids=[...managerCandidates];const allowed=(await dbAll(db, `SELECT id FROM users WHERE id IN (${ids.map(()=>"?").join(",")}) AND role IN ('admin','teacher') AND status='active'`, ...ids)) as Array<{id:number}>;if(allowed.length!==ids.length)return {ok:false as const,error:"فقط مدیران و دبیران می‌توانند مدیر گروه باشند."};}
  const groupId=await dbTransaction(async (tx)=>{
    const created=(await dbRun(tx, `INSERT INTO school_groups(name,description,kind,visibility,external_url,image_data,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)`, input.name.trim().slice(0,80),input.description.trim().slice(0,500),input.kind,input.visibility,eitaaUrl,input.imageData,owner.id,Date.now()));
    const id=Number(created.lastInsertRowid),now=Date.now();
    const addMemberSql="INSERT OR IGNORE INTO school_group_members(group_id,user_id,member_role,added_at) VALUES(?,?,?,?)";
    await dbRun(tx, addMemberSql, id,owner.id,"manager",now);
    for(const course of courses){
      (await dbRun(tx, "INSERT INTO school_group_courses(group_id,course_id) VALUES(?,?)", id,course.id));
      await dbRun(tx, addMemberSql, id,course.teacherId,"manager",now);
      const roster=(await dbAll(tx, `SELECT account_user_id AS userId FROM student_registrations WHERE status='approved' AND grade=? AND field_of_study=? AND branch=? AND account_user_id IS NOT NULL`, course.grade,course.fieldOfStudy,course.branch)) as Array<{userId:number}>;
      for(const student of roster)await dbRun(tx, addMemberSql, id,student.userId,"member",now);
    }
    for(const staffId of selectedStaff)await dbRun(tx, addMemberSql, id,staffId,"manager",now);
    return id;
  });
  return {ok:true as const,id:groupId};
}

export async function deleteSchoolGroup(groupId:number){
  const db=await groupsDb();
  return (await dbRun(db, "DELETE FROM school_groups WHERE id=?", groupId)).changes>0;
}

export async function updateSchoolGroup(id:number,input:{name:string;description:string;externalUrl:string;imageData:string}){
 const db=await groupsDb();const current=(await dbGet(db, "SELECT id,kind,image_data AS imageData FROM school_groups WHERE id=?", id)) as {id:number;kind:"channel"|"group";imageData:string}|undefined;if(!current)return {ok:false as const,error:"مورد پیدا نشد."};
 const url=input.externalUrl.trim();if(url){try{const parsed=new URL(url);if(parsed.protocol!=="https:"||!/(^|\.)eitaa\.com$|(^|\.)eitaa\.ir$/i.test(parsed.hostname))return {ok:false as const,error:"لینک باید نشانی امن ایتا باشد."};}catch{return {ok:false as const,error:"لینک ایتا معتبر نیست."};}}if(current.kind==="channel"&&!url)return {ok:false as const,error:"لینک کانال الزامی است."};
 if(input.imageData&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.imageData)&&!/^\/channels\/[a-z0-9-]+\.svg$/.test(input.imageData)&&input.imageData!==`/api/school-groups/${id}/image`)return {ok:false as const,error:"تصویر معتبر نیست."};
 const imageData=input.imageData===`/api/school-groups/${id}/image`?current.imageData:input.imageData;(await dbRun(db, "UPDATE school_groups SET name=?,description=?,external_url=?,image_data=? WHERE id=?", input.name.trim().slice(0,80),input.description.trim().slice(0,500),url,imageData,id));return {ok:true as const};
}

import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { ensureDatabaseReady } from "@/lib/auth-db";
import { academicDatabase } from "@/lib/academic-db";
import { announcementsDb } from "@/lib/announcements";
import { workDb } from "@/lib/learning-work";
import { onlineDb } from "@/lib/online-classes";
import { dbReady } from "@/lib/online-classroom";
import { groupsDb } from "@/lib/school-groups";
import { dbGet, dbAll, dbRun, dbExec, dbTransaction } from "@/lib/db";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){const actor=await currentUser();if(!actor||actor.role!=="admin"||actor.adminScope!=="site")return NextResponse.json({error:"فقط مدیر سایت اجازهٔ پاک‌سازی سامانه را دارد."},{status:403});let body:Record<string,unknown>;try{body=await request.json()}catch{return NextResponse.json({error:"درخواست معتبر نیست."},{status:400})}if(body.confirmation!=="حذف همه اطلاعات مدرسه")return NextResponse.json({error:"عبارت تأیید دقیق نیست."},{status:400});const db=await ensureDatabaseReady();
// Every module creates its tables lazily on first use, and with foreign keys
// ON a DELETE fails when a table that references the target table does not
// exist yet (SQLite needs that table's schema for the FK check) — so the
// wipe first ensures every module's schema exists (school_banners is the
// only exception: nothing references it, so its absence cannot break a
// DELETE, and it is simply absent from the list below when never created).
await academicDatabase();await announcementsDb();await workDb();await onlineDb();await dbReady();await groupsDb();
const tables=((await dbAll(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'users'")) as Array<{name:string}>).map(x=>x.name);try{
  await dbTransaction(async (tx)=>{
    // Foreign keys stay ON: libsql enforces them by default, and the
    // foreign_keys pragma cannot be toggled inside a transaction (it is a
    // no-op there, and a transaction only exists on one connection). So the
    // tables are emptied child-first by retrying any DELETE that hit a
    // foreign-key violation, until a full pass succeeds; the reference graph
    // is acyclic, so the passes converge. A statement that fails is rolled
    // back atomically and leaves the transaction usable.
    for(let pass=0;pass<5;pass++){
      let failed=false;
      for(const table of tables){
        try{
          if(table==="app_settings")await dbRun(tx, "DELETE FROM app_settings WHERE setting_key<>'initial_admin_created'");
          else await dbExec(tx, `DELETE FROM "${table.replaceAll('"','""')}"`);
        }catch{failed=true;}
      }
      if(!failed)break;
      if(pass===4)throw new Error("پاک‌سازی کامل نشد؛ تغییری نیمه‌کاره ثبت نشده است.");
    }
    await dbRun(tx, "DELETE FROM users WHERE role<>'admin'");
  });
  return NextResponse.json({ok:true,adminAccounts:((await dbGet(db, "SELECT COUNT(*) AS count FROM users WHERE role='admin'")) as {count:number}).count},{headers:{"Cache-Control":"no-store"}});
}catch{return NextResponse.json({error:"پاک‌سازی کامل نشد؛ تغییری نیمه‌کاره ثبت نشده است."},{status:500})}}

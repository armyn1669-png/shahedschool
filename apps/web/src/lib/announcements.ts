import { database, ensureDatabaseReady, type AuthenticatedUser } from "@/lib/auth-db";
import { dbGet, dbAll, dbRun, dbExec, dbTransaction, type Db } from "@/lib/db";

export async function announcementsDb() {
  const db = await database();
  const createTable = async (target: Db) => { await dbExec(target, `CREATE TABLE IF NOT EXISTS school_announcements(
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('news','article')),
    image_data TEXT NOT NULL DEFAULT '', pinned INTEGER NOT NULL DEFAULT 0, author_id INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
  )`); };
  await createTable(db);
  const schema = (await dbGet(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='school_announcements'")) as { sql: string } | undefined;
  if (schema?.sql.includes("'research'")) {
    await dbTransaction(async (tx) => {
      await dbExec(tx, "DROP INDEX IF EXISTS school_announcements_feed_idx; ALTER TABLE school_announcements RENAME TO school_announcements_legacy; DROP TABLE IF EXISTS school_announcements; ");
      await createTable(tx);
      await dbExec(tx, "INSERT INTO school_announcements(id,title,body,kind,image_data,pinned,author_id,created_at) SELECT id,title,body,CASE WHEN kind='research' THEN 'article' ELSE kind END,image_data,pinned,author_id,created_at FROM school_announcements_legacy; DROP TABLE school_announcements_legacy;");
    });
  }
  (await dbExec(db, "CREATE INDEX IF NOT EXISTS school_announcements_feed_idx ON school_announcements(pinned DESC,created_at DESC)"));
  return db;
}

export async function announcementsSnapshot(user: AuthenticatedUser) {
  await ensureDatabaseReady();
  const db = await announcementsDb();
  return (await dbAll(db, `SELECT a.id,a.title,a.body,a.kind,CASE WHEN a.image_data='' THEN '' ELSE '/api/announcements/'||a.id||'/image' END AS imageData,a.pinned,a.created_at AS createdAt,u.display_name AS author
    FROM school_announcements a JOIN users u ON u.id=a.author_id ORDER BY a.pinned DESC,a.created_at DESC LIMIT 50`));
}

export async function announcementImage(user:AuthenticatedUser,id:number){await ensureDatabaseReady();const row=(await dbGet(await announcementsDb(), "SELECT image_data AS imageData FROM school_announcements WHERE id=?", id)) as {imageData:string}|undefined;if(!row?.imageData)return null;const match=row.imageData.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!match)return null;return {mime:`image/${match[1]}`,bytes:Buffer.from(match[2],"base64")};}

export async function createAnnouncement(user: AuthenticatedUser, input: { title: string; body: string; kind: "news" | "article"; imageData: string; pinned: boolean }) {
  const db = await announcementsDb();
  const result = (await dbRun(db, "INSERT INTO school_announcements(title,body,kind,image_data,pinned,author_id,created_at) VALUES(?,?,?,?,?,?,?)", input.title.trim(),input.body.trim(),input.kind,input.imageData,input.pinned?1:0,user.id,Date.now()));
  return Number(result.lastInsertRowid);
}

export async function deleteAnnouncement(id: number) {
  return (await dbRun(await announcementsDb(), "DELETE FROM school_announcements WHERE id=?", id)).changes > 0;
}

import { createClient, type Client, type InValue, type Transaction } from "@libsql/client";
import { isAbsolute, resolve } from "node:path";

export type { Client } from "@libsql/client";

/**
 * Database adapter: the app's single way to talk to SQLite.
 *
 * The database is libsql (Turso-compatible, async). When TURSO_DATABASE_URL
 * is set the client talks to that server (TURSO_AUTH_TOKEN for auth).
 * Otherwise it uses a local SQLite file, so local development works exactly
 * as before with ./data/school.sqlite.
 *
 * Libsql speaks the same SQLite dialect, so all SQL text is unchanged from
 * the previous node:sqlite implementation.
 */

export type Db = Client | Transaction;

let client: Client | undefined;

/** Resolve the database URL: a remote Turso/libsql URL, or a local file: URL. */
export function resolveDatabaseUrl(): string {
  const turso = process.env.TURSO_DATABASE_URL?.trim();
  if (turso) return turso;
  const configured = process.env.SCHOOL_DB_PATH || "./data/school.sqlite";
  const path = isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
  return `file:${path}`;
}

export function isLocalDatabase(): boolean {
  return resolveDatabaseUrl().startsWith("file:");
}

/** The shared libsql client (created once per process). */
export function getClient(): Client {
  if (client) return client;
  const url = resolveDatabaseUrl();
  client = url.startsWith("file:")
    ? createClient({ url })
    : createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return client;
}

/** Single-row SELECT. Returns the first row, or undefined when there is none. */
export async function dbGet<T>(db: Db, sql: string, ...args: InValue[]): Promise<T | undefined> {
  const result = await db.execute({ sql, args });
  return result.rows[0] as T | undefined;
}

/** Multi-row SELECT. Returns all rows (empty array when there are none). */
export async function dbAll<T>(db: Db, sql: string, ...args: InValue[]): Promise<T[]> {
  const result = await db.execute({ sql, args });
  return result.rows as T[];
}

/**
 * INSERT / UPDATE / DELETE. Returns the inserted row id (0 when the statement
 * does not insert a row) and the number of affected rows.
 * (libsql returns lastInsertRowid as a bigint; callers keep using Number(...).)
 */
export async function dbRun(
  db: Db,
  sql: string,
  ...args: InValue[]
): Promise<{ lastInsertRowid: number; changes: number }> {
  const result = await db.execute({ sql, args });
  return {
    lastInsertRowid: result.lastInsertRowid === undefined ? 0 : Number(result.lastInsertRowid),
    changes: result.rowsAffected,
  };
}

/** Run one or more statements with no parameters (DDL, PRAGMA). */
export async function dbExec(db: Db, sql: string): Promise<void> {
  await db.executeMultiple(sql);
}

/**
 * Run `fn` inside a single transaction on one connection.
 *
 * IMPORTANT: with libsql (local or remote) a transaction only exists on the
 * connection that opened it, so raw `BEGIN`/`COMMIT` executed as separate
 * statements do NOT bracket later statements. All transactional work must go
 * through this helper (or client.batch()), never through separate
 * BEGIN/COMMIT executes.
 *
 * Throwing inside `fn` rolls the transaction back. Throwing a TxReturn
 * instance commits nothing either — it rolls back and its carried value is
 * returned instead, for code paths that previously used `return` inside a
 * try/transaction block while still needing the rollback to happen.
 */
export class TxReturn<T> extends Error {
  readonly result: T;
  constructor(result: T) {
    super("TxReturn");
    this.result = result;
  }
}

export async function dbTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const tx = await getClient().transaction("write");
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // The transaction may already be closed; rollback is best-effort.
    }
    if (error instanceof TxReturn) return error.result;
    throw error;
  }
}

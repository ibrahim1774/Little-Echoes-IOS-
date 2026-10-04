/**
 * Local document store on SQLite. Each table is `id TEXT PRIMARY KEY, data TEXT`
 * holding one JSON document per row — the same shape the web app kept in IndexedDB.
 */
import * as SQLite from 'expo-sqlite';

import { STARTER_QUESTIONS } from '@/data/questions';

export type TableName =
  | 'parents'
  | 'children'
  | 'questions'
  | 'sessions'
  | 'recordings'
  | 'streaks'
  | 'videos'
  | 'kv';

const TABLES: TableName[] = [
  'parents',
  'children',
  'questions',
  'sessions',
  'recordings',
  'streaks',
  'videos',
  'kv',
];

export interface DocStore {
  get<T>(table: TableName, id: string): Promise<T | undefined>;
  all<T>(table: TableName): Promise<T[]>;
  put<T>(table: TableName, id: string, doc: T): Promise<void>;
  delete(table: TableName, id: string): Promise<void>;
  clear(table: TableName): Promise<void>;
}

/** In-memory store, used by tests. */
export function createMemoryStore(): DocStore {
  const data = new Map<TableName, Map<string, string>>();
  const table = (t: TableName) => {
    if (!data.has(t)) data.set(t, new Map());
    return data.get(t)!;
  };
  return {
    async get<T>(t: TableName, id: string) {
      const raw = table(t).get(id);
      return raw === undefined ? undefined : (JSON.parse(raw) as T);
    },
    async all<T>(t: TableName) {
      return [...table(t).values()].map((raw) => JSON.parse(raw) as T);
    },
    async put(t, id, doc) {
      table(t).set(id, JSON.stringify(doc));
    },
    async delete(t, id) {
      table(t).delete(id);
    },
    async clear(t) {
      table(t).clear();
    },
  };
}

function createSqliteStore(): DocStore {
  let ready: Promise<SQLite.SQLiteDatabase> | null = null;

  function open(): Promise<SQLite.SQLiteDatabase> {
    if (!ready) {
      ready = (async () => {
        const db = await SQLite.openDatabaseAsync('littleechoes.db');
        await db.execAsync(
          TABLES.map((t) => `CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);`).join('\n')
        );
        return db;
      })();
    }
    return ready;
  }

  return {
    async get<T>(t: TableName, id: string) {
      const db = await open();
      const row = await db.getFirstAsync<{ data: string }>(`SELECT data FROM ${t} WHERE id = ?`, id);
      return row ? (JSON.parse(row.data) as T) : undefined;
    },
    async all<T>(t: TableName) {
      const db = await open();
      const rows = await db.getAllAsync<{ data: string }>(`SELECT data FROM ${t}`);
      return rows.map((r) => JSON.parse(r.data) as T);
    },
    async put(t, id, doc) {
      const db = await open();
      await db.runAsync(`INSERT OR REPLACE INTO ${t} (id, data) VALUES (?, ?)`, id, JSON.stringify(doc));
    },
    async delete(t, id) {
      const db = await open();
      await db.runAsync(`DELETE FROM ${t} WHERE id = ?`, id);
    },
    async clear(t) {
      const db = await open();
      await db.runAsync(`DELETE FROM ${t}`);
    },
  };
}

let store: DocStore | null = null;
let seeded: Promise<void> | null = null;

export function getStore(): DocStore {
  if (!store) store = createSqliteStore();
  return store;
}

/** Tests swap in a memory store. */
export function setStore(next: DocStore): void {
  store = next;
  seeded = null;
}

/** Seed starter questions on first open. Safe to call repeatedly. */
export function ensureSeeded(): Promise<void> {
  if (!seeded) {
    seeded = (async () => {
      const s = getStore();
      const existing = await s.all<{ id: string }>('questions');
      const have = new Set(existing.map((q) => q.id));
      for (const q of STARTER_QUESTIONS) {
        if (!have.has(q.id)) await s.put('questions', q.id, q);
      }
    })();
  }
  return seeded;
}

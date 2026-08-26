import type { SQLiteDatabase } from 'expo-sqlite';

export const initializeStorageSchema = (db: SQLiteDatabase): Promise<void> =>
  db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS conversation_pin (
      conversation_id TEXT PRIMARY KEY NOT NULL,
      pinned_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS product_cache (
      id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS draft (
      conversation_id TEXT PRIMARY KEY NOT NULL,
      text TEXT NOT NULL,
      asset_id TEXT,
      asset_uri TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_cache (
      id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

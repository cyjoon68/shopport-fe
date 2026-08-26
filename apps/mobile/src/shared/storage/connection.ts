import type { SQLiteDatabase } from 'expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';

import { initializeStorageSchema } from './schema';

const initialize = async (): Promise<SQLiteDatabase> => {
  const db = await openDatabaseAsync('shopport.db');
  await initializeStorageSchema(db);
  return db;
};

let databasePromise: Promise<SQLiteDatabase> | undefined;

export const database = (): Promise<SQLiteDatabase> => {
  databasePromise ??= initialize();
  return databasePromise;
};

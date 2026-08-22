import Database from 'better-sqlite3';
import {drizzle} from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import type {AppDatabase} from '@/db/types';

/**
 * An in-memory database using the identical schema the app ships.
 *
 * op-sqlite is a native module and cannot load in Node, so repositories are
 * tested through this instead. Same dialect, same queries, same migrations —
 * only the driver differs (spec section 9).
 */
export function createTestDb(): {db: AppDatabase; close: () => void} {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, {schema}) as unknown as AppDatabase;
  return {db, close: () => sqlite.close()};
}

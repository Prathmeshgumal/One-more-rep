import {open} from '@op-engineering/op-sqlite';
import {drizzle} from 'drizzle-orm/op-sqlite';
import * as schema from './schema';
import type {AppDatabase} from './types';

const DB_NAME = 'onemorerep.db';

let instance: AppDatabase | null = null;

/**
 * The app's database handle. Memoised — opening twice would be a bug.
 *
 * This is the only file in the codebase permitted to import op-sqlite.
 */
export function getDatabase(): AppDatabase {
  if (!instance) {
    const connection = open({name: DB_NAME});
    instance = drizzle(connection, {schema}) as unknown as AppDatabase;
  }
  return instance;
}

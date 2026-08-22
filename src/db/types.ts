import type {BaseSQLiteDatabase} from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

/**
 * The database handle repositories receive by injection.
 *
 * On device this is backed by op-sqlite; under Jest, by better-sqlite3. Typing
 * against the base class rather than either driver is what lets one repository
 * serve both — same dialect, same queries, same migrations, different driver.
 */
export type AppDatabase = BaseSQLiteDatabase<
  'sync' | 'async',
  unknown,
  typeof schema
>;

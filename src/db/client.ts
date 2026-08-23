import {open} from '@op-engineering/op-sqlite';
import {drizzle} from 'drizzle-orm/op-sqlite';
import * as schema from './schema';
import type {AppDatabase} from './types';

const DB_NAME = 'onemorerep.db';

type Scalar = string | number | boolean | null | ArrayBuffer;

/**
 * drizzle-orm 0.45.2's op-sqlite driver was written against op-sqlite v2-era
 * result shapes and is broken against v18 on every read path:
 *
 *   - `all()` and `get()` call `client.execute(sql, params).rows?._array`
 *     synchronously. In v18 `execute` is async, so `.rows` on the returned
 *     Promise is undefined and the driver silently yields an empty array. Reads
 *     do not fail — they come back empty, which is far worse.
 *   - The query-builder path goes through `values()` → `executeRawAsync`, which
 *     in v18 resolves to `{rawRows, columnNames}`. drizzle then calls `.map()`
 *     on that object and throws "undefined is not a function".
 *
 * Writes are unaffected, which is what makes this so easy to miss: a migration
 * appears to succeed, then every subsequent read returns nothing.
 *
 * There is no version pairing that avoids this — 0.45.2 is the newest stable
 * drizzle, and only 1.0.0 release candidates are newer. So the connection is
 * adapted here, in the one file permitted to know op-sqlite exists, to present
 * the contract drizzle expects.
 */
function adaptForDrizzle(connection: ReturnType<typeof open>) {
  return Object.assign(Object.create(connection) as typeof connection, {
    // Consumed synchronously by all()/get(), which read `.rows._array`.
    execute: (query: string, params?: Scalar[]) => {
      const result = connection.executeSync(query, params as never);
      return {...result, rows: {_array: result.rows ?? []}};
    },
    // Consumed by run(); the raw QueryResult is what drizzle returns to callers.
    executeAsync: (query: string, params?: Scalar[]) =>
      connection.execute(query, params as never),
    // Consumed by values(); drizzle expects an array of row-arrays, not the
    // object v18 resolves to.
    executeRawAsync: async (query: string, params?: Scalar[]) =>
      (await connection.executeRaw(query, params as never)).rawRows ?? [],
  });
}

/**
 * Settings that must be applied to every connection before anything uses it.
 *
 * SQLite enforces foreign keys **per connection and off by default**. The
 * schema declares ON DELETE CASCADE and the Jest helper turns enforcement on,
 * so the cascade tests passed while the shipped app quietly kept every orphan
 * an in-place plan rewrite left behind — 65 of them by the time it was caught
 * on the device. Test and production must open the database the same way.
 */
export const CONNECTION_PRAGMAS = ['PRAGMA foreign_keys = ON'] as const;

/** Exported separately from `getDatabase` so it can be tested without op-sqlite. */
export function applyConnectionPragmas(connection: {
  executeSync: (query: string) => unknown;
}): void {
  for (const pragma of CONNECTION_PRAGMAS) {
    connection.executeSync(pragma);
  }
}

let instance: AppDatabase | null = null;

/**
 * The app's database handle. Memoised — opening twice would be a bug.
 *
 * This is the only file in the codebase permitted to import op-sqlite.
 */
export function getDatabase(): AppDatabase {
  if (!instance) {
    const connection = adaptForDrizzle(open({name: DB_NAME}));
    applyConnectionPragmas(connection);
    instance = drizzle(connection, {schema}) as unknown as AppDatabase;
  }
  return instance;
}

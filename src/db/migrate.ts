import {sql} from 'drizzle-orm';
import type {AppDatabase} from './types';
import {migrations as shipped, type Migration} from './migrations';

/** Reads SQLite's built-in schema version counter. */
export async function getSchemaVersion(db: AppDatabase): Promise<number> {
  const rows = await db.all<{user_version: number}>(sql`PRAGMA user_version`);
  return rows[0]?.user_version ?? 0;
}

async function setSchemaVersion(
  db: AppDatabase,
  version: number,
): Promise<void> {
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`Refusing to set a non-integer schema version: ${version}`);
  }
  // PRAGMA cannot be parameterised; the integer check above is the guard.
  await db.run(sql.raw(`PRAGMA user_version = ${version}`));
}

function assertContiguous(list: readonly Migration[]): void {
  list.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `Migrations must be contiguous from 1. Expected version ${index + 1} ` +
          `at position ${index}, found ${migration.version} (${migration.name}).`,
      );
    }
  });
}

/**
 * Applies every migration newer than the database's current version.
 *
 * Uses explicit BEGIN/COMMIT rather than Drizzle's transaction() helper,
 * because that helper is synchronous under better-sqlite3 and asynchronous
 * under op-sqlite. Raw statements behave identically on both, which is what
 * makes the Jest coverage meaningful.
 */
export async function runMigrations(
  db: AppDatabase,
  list: readonly Migration[] = shipped,
): Promise<{applied: number; version: number}> {
  assertContiguous(list);

  const current = await getSchemaVersion(db);
  const pending = list.filter(m => m.version > current);

  if (pending.length === 0) {
    return {applied: 0, version: current};
  }

  for (const migration of pending) {
    await db.run(sql.raw('BEGIN'));
    try {
      for (const statement of migration.statements) {
        await db.run(sql.raw(statement));
      }
      await setSchemaVersion(db, migration.version);
      await db.run(sql.raw('COMMIT'));
    } catch (error) {
      await db.run(sql.raw('ROLLBACK'));
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${migration.name} failed: ${reason}`);
    }
  }

  const last = pending[pending.length - 1]!;
  return {applied: pending.length, version: last.version};
}

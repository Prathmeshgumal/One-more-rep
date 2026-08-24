import {sql} from 'drizzle-orm';
import {runMigrations, getSchemaVersion} from '@/db/migrate';
import type {Migration} from '@/db/migrations';
import type {AppDatabase} from '@/db/types';
import {createTestDb} from '../helpers/testDb';

const FIXTURES: readonly Migration[] = [
  {version: 1, name: '0000_first', statements: ['CREATE TABLE a (id INTEGER)']},
  {version: 2, name: '0001_second', statements: ['CREATE TABLE b (id INTEGER)']},
];

const tableNames = async (db: AppDatabase) => {
  const rows = await db.all<{name: string}>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
  );
  return rows.map(r => r.name);
};

describe('runMigrations', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.close());

  it('starts a fresh database at version 0', async () => {
    expect(await getSchemaVersion(ctx.db)).toBe(0);
  });

  it('applies every migration to a fresh database', async () => {
    const result = await runMigrations(ctx.db, FIXTURES);
    expect(result).toEqual({applied: 2, version: 2});
    expect(await tableNames(ctx.db)).toEqual(['a', 'b']);
  });

  it('is a no-op when already current', async () => {
    await runMigrations(ctx.db, FIXTURES);
    const second = await runMigrations(ctx.db, FIXTURES);
    expect(second).toEqual({applied: 0, version: 2});
  });

  it('applies only the remainder when partially migrated', async () => {
    await runMigrations(ctx.db, FIXTURES.slice(0, 1));
    const result = await runMigrations(ctx.db, FIXTURES);
    expect(result).toEqual({applied: 1, version: 2});
    expect(await tableNames(ctx.db)).toEqual(['a', 'b']);
  });

  it('rolls back and leaves the version untouched when a migration fails', async () => {
    const broken: readonly Migration[] = [
      FIXTURES[0]!,
      {
        version: 2,
        name: '0001_broken',
        statements: ['CREATE TABLE b (id INTEGER)', 'THIS IS NOT SQL'],
      },
    ];
    await expect(runMigrations(ctx.db, broken)).rejects.toThrow(/0001_broken/);
    expect(await getSchemaVersion(ctx.db)).toBe(1);
    expect(await tableNames(ctx.db)).toEqual(['a']);
  });

  it('rejects a migration list that is not contiguous from 1', async () => {
    const gappy: readonly Migration[] = [
      FIXTURES[0]!,
      {...FIXTURES[1]!, version: 3},
    ];
    await expect(runMigrations(ctx.db, gappy)).rejects.toThrow(/contiguous/);
  });

  it('applies the real shipped migrations', async () => {
    const result = await runMigrations(ctx.db);
    expect(result.applied).toBeGreaterThan(0);
    expect(await tableNames(ctx.db)).toContain('settings');
  });

  it('lands on version 6 with a theme column on settings', async () => {
    await runMigrations(ctx.db);
    expect(await getSchemaVersion(ctx.db)).toBe(6);
    const columns = await ctx.db.all<{name: string}>(
      sql`PRAGMA table_info(settings)`,
    );
    expect(columns.map(c => c.name)).toContain('theme_mode');
  });
});

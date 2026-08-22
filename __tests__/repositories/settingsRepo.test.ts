import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {
  getSettings,
  updateSettings,
  DEFAULT_SETTINGS,
} from '@/repositories/settingsRepo';
import {createTestDb} from '../helpers/testDb';

describe('settingsRepo', () => {
  let ctx: ReturnType<typeof createTestDb>;

  const rowCount = async () => {
    const rows = await ctx.db.all<{n: number}>(
      sql`SELECT COUNT(*) AS n FROM settings`,
    );
    return rows[0]?.n;
  };

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
  });
  afterEach(() => ctx.close());

  it('creates the row from defaults on first read', async () => {
    const row = await getSettings(ctx.db);
    expect(row.unit).toBe(DEFAULT_SETTINGS.unit);
    expect(row.weekStartDay).toBe(DEFAULT_SETTINGS.weekStartDay);
    expect(row.defaultIncrement).toBe(DEFAULT_SETTINGS.defaultIncrement);
  });

  it('returns the same row on a second read rather than a duplicate', async () => {
    await getSettings(ctx.db);
    await getSettings(ctx.db);
    expect(await rowCount()).toBe(1);
  });

  it('persists an updated unit', async () => {
    await updateSettings(ctx.db, {unit: 'lb'});
    expect((await getSettings(ctx.db)).unit).toBe('lb');
  });

  it('leaves untouched fields alone', async () => {
    await updateSettings(ctx.db, {unit: 'lb'});
    const row = await getSettings(ctx.db);
    expect(row.weekStartDay).toBe(DEFAULT_SETTINGS.weekStartDay);
    expect(row.defaultIncrement).toBe(DEFAULT_SETTINGS.defaultIncrement);
  });

  it('stamps updatedAt on every write', async () => {
    const before = await getSettings(ctx.db);
    await new Promise(resolve => setTimeout(resolve, 5));
    const after = await updateSettings(ctx.db, {defaultIncrement: 5});
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt);
  });

  it('still holds exactly one row after updating', async () => {
    await updateSettings(ctx.db, {unit: 'lb'});
    expect(await rowCount()).toBe(1);
  });
});

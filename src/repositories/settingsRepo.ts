import {eq} from 'drizzle-orm';
import {settings, SETTINGS_ROW_ID, type SettingsRow} from '@/db/schema';
import type {AppDatabase} from '@/db/types';

export const DEFAULT_SETTINGS = {
  unit: 'kg',
  weekStartDay: 1, // Monday
  defaultIncrement: 2.5,
} as const;

export type SettingsPatch = Partial<
  Pick<SettingsRow, 'unit' | 'weekStartDay' | 'defaultIncrement'>
>;

async function readRow(db: AppDatabase): Promise<SettingsRow | undefined> {
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.id, SETTINGS_ROW_ID))
    .limit(1);
  return rows[0];
}

/** Reads the single settings row, creating it from defaults if it is absent. */
export async function getSettings(db: AppDatabase): Promise<SettingsRow> {
  const existing = await readRow(db);
  if (existing) {
    return existing;
  }

  await db
    .insert(settings)
    .values({id: SETTINGS_ROW_ID, ...DEFAULT_SETTINGS, updatedAt: Date.now()})
    .onConflictDoNothing();

  // Re-read rather than trusting the insert: a concurrent caller may have won.
  const created = await readRow(db);
  if (!created) {
    throw new Error('Settings row could not be created.');
  }
  return created;
}

export async function updateSettings(
  db: AppDatabase,
  patch: SettingsPatch,
): Promise<SettingsRow> {
  await getSettings(db); // guarantees the row exists
  await db
    .update(settings)
    .set({...patch, updatedAt: Date.now()})
    .where(eq(settings.id, SETTINGS_ROW_ID));
  return getSettings(db);
}

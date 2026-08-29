import {sqliteTable, text, integer, real} from 'drizzle-orm/sqlite-core';

/** The settings table holds exactly one row, at this id. */
export const SETTINGS_ROW_ID = 'singleton';

/**
 * A text primary key and an updated_at column on a single-row table look like
 * overkill. They exist because every table in this app is built sync-ready:
 * the Supabase port (D2, D9) must be additive, never a migration of key types.
 */
export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  unit: text('unit', {enum: ['kg', 'lb']}).notNull(),
  weekStartDay: integer('week_start_day').notNull(),
  defaultIncrement: real('default_increment').notNull(),
  /**
   * 'system' follows the OS. The two explicit values override it, which is the
   * whole point — a phone left in light mode is not a reason to train in it.
   */
  themeMode: text('theme_mode', {enum: ['system', 'light', 'dark']})
    .notNull()
    .default('system'),
  updatedAt: integer('updated_at').notNull(),
});

export type SettingsRow = typeof settings.$inferSelect;
export type WeightUnit = SettingsRow['unit'];
export type ThemeMode = SettingsRow['themeMode'];

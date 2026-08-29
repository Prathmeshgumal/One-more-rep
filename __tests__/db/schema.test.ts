import {getTableConfig} from 'drizzle-orm/sqlite-core';
import {settings, SETTINGS_ROW_ID} from '@/db/schema';

describe('settings schema', () => {
  it('is a single-row table keyed by a known constant', () => {
    const config = getTableConfig(settings);
    expect(config.name).toBe('settings');
    expect(SETTINGS_ROW_ID).toBe('singleton');
    const pk = config.columns.filter(c => c.primary).map(c => c.name);
    expect(pk).toEqual(['id']);
  });

  it('carries every column the settings row needs', () => {
    const names = getTableConfig(settings)
      .columns.map(c => c.name)
      .sort();
    expect(names).toEqual([
      'default_increment',
      'id',
      'theme_mode',
      'unit',
      'updated_at',
      'week_start_day',
    ]);
  });

  it('requires every column, so no setting can be absent', () => {
    const optional = getTableConfig(settings)
      .columns.filter(c => !c.notNull)
      .map(c => c.name);
    expect(optional).toEqual([]);
  });
});

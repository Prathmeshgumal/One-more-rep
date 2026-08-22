import {getTableConfig} from 'drizzle-orm/sqlite-core';
import {exercises} from '@/db/schema';

describe('exercises schema', () => {
  it('carries every column section 4.1 specifies', () => {
    const names = getTableConfig(exercises)
      .columns.map(c => c.name)
      .sort();
    expect(names).toEqual([
      'deleted_at',
      'equipment',
      'exercise_type',
      'id',
      'instructions',
      'is_custom',
      'name',
      'primary_muscle',
      'secondary_muscles',
      'updated_at',
      'weight_applicable',
    ]);
  });

  it('allows equipment and instructions to be absent but nothing else', () => {
    const optional = getTableConfig(exercises)
      .columns.filter(c => !c.notNull)
      .map(c => c.name)
      .sort();
    expect(optional).toEqual(['deleted_at', 'equipment', 'instructions']);
  });

  it('indexes the columns the library screen filters and sorts on', () => {
    const indexed = getTableConfig(exercises)
      .indexes.map(i => i.config.name)
      .sort();
    expect(indexed).toEqual([
      'exercises_name_idx',
      'exercises_primary_muscle_idx',
    ]);
  });
});

/**
 * The filter row on screen 18.
 *
 * Labels are ours; values are free-exercise-db's own muscle names. Each label
 * covers a group because the upstream data is finer-grained than a person
 * browsing a gym: "back" is four separate values there, and "legs" is six.
 * Matching only one of each would hide most of the library — Legs alone would
 * drop from 298 exercises to 148.
 *
 * Every one of the seventeen upstream values appears here exactly once, so no
 * exercise is unreachable by filtering. `neck` sits under Back, next to traps,
 * which is where neck work lands in practice. A test in
 * `__tests__/db/seed.test.ts` holds both properties as the dataset changes.
 */
export const MUSCLE_FILTERS: ReadonlyArray<{
  label: string;
  values: readonly string[];
}> = [
  {label: 'All', values: []},
  {label: 'Chest', values: ['chest']},
  {
    label: 'Back',
    values: ['lats', 'middle back', 'lower back', 'traps', 'neck'],
  },
  {
    label: 'Legs',
    values: [
      'quadriceps',
      'hamstrings',
      'glutes',
      'calves',
      'adductors',
      'abductors',
    ],
  },
  {label: 'Shoulders', values: ['shoulders']},
  {label: 'Arms', values: ['biceps', 'triceps', 'forearms']},
  {label: 'Core', values: ['abdominals']},
];

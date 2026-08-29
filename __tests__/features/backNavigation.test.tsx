import fs from 'fs';
import path from 'path';

/**
 * A structural test, not a rendering one.
 *
 * Every screen reached by a push needs a visible way back — the thing
 * `docs/deferred.md` carried from the Phase 1 gate to the Phase 5 one.
 * Rendering all twelve would need twelve fixtures; reading the source answers
 * the same question, and the last case below makes it impossible to add a
 * screen to a stack without deciding which side of the line it falls on.
 *
 * What this cannot catch is a back control that renders somewhere unreachable.
 * That is why "reachable with a thumb" is in the device walk.
 */
const SRC = path.join(__dirname, '..', '..', 'src');

const read = (relative: string): string =>
  fs.readFileSync(path.join(SRC, relative), 'utf8');

/** Screens pushed onto a stack rather than sitting at its root. */
const PUSHED: readonly string[] = [
  'features/exercises/ExerciseListScreen.tsx',
  'features/plan/PlanWeekScreen.tsx',
  'features/history/HistoryTimelineScreen.tsx',
  'features/exercises/ExerciseDetailScreen.tsx',
  'features/exercises/ExerciseEditorScreen.tsx',
  'features/plan/PlanDayScreen.tsx',
  'features/plan/CopyDayScreen.tsx',
  'features/plan/ExercisePickerScreen.tsx',
  'features/plan/TargetEditorScreen.tsx',
  'features/plan/PlanHistoryScreen.tsx',
  'features/history/CalendarScreen.tsx',
  'features/history/DayDetailScreen.tsx',
  'features/history/ExerciseHistoryScreen.tsx',
  'features/workout/ExerciseSummaryScreen.tsx',
  'features/workout/WorkoutExercisePickerScreen.tsx',
];

/**
 * The two exceptions, each with a reason. A back chevron mid-workout reads as
 * "cancel this", and the finish screen has nothing sensible behind it.
 */
const NO_BACK: readonly string[] = [
  'features/workout/WorkoutScreen.tsx',
  'features/workout/WorkoutCompleteScreen.tsx',
];

/** Stack roots: the tab already is the way back. */
/**
 * Stack roots: the tab already is the way back.
 *
 * There are two of these now rather than four. PlanWeekScreen,
 * HistoryTimelineScreen and ExerciseListScreen were roots of their own tabs
 * until those tabs became buttons; all three are pushed now, and all three had
 * to grow a back control they never needed before.
 */
const ROOTS: readonly string[] = ['TodayScreen', 'SettingsScreen'];

const offersBack = (source: string): boolean =>
  source.includes('<BackButton') || /<Screen[\s\S]{0,80}?\bback\b/.test(source);

describe('back navigation', () => {
  it.each(PUSHED)('%s offers a way back', file => {
    expect(offersBack(read(file))).toBe(true);
  });

  it.each(NO_BACK)('%s deliberately offers none', file => {
    expect(offersBack(read(file))).toBe(false);
  });

  it('classifies every screen registered in a stack', () => {
    const stacks = ['TodayStack', 'SettingsStack']
      .map(name => read(`navigation/${name}.tsx`))
      .join('\n');
    const registered = [...stacks.matchAll(/component=\{(\w+)\}/g)].map(
      m => m[1]!,
    );
    const classified = new Set([
      ...PUSHED.map(f => path.basename(f, '.tsx')),
      ...NO_BACK.map(f => path.basename(f, '.tsx')),
      ...ROOTS,
    ]);
    // A screen added to a stack without being classified here fails on
    // purpose: someone has to decide whether it needs a way out.
    expect(registered.filter(name => !classified.has(name))).toEqual([]);
    expect(registered.length).toBeGreaterThan(0);
  });
});

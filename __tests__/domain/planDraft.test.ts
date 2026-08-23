import {
  emptyDraft,
  renameDay,
  setRestDay,
  addExercises,
  removeExercise,
  moveExercise,
  setTargets,
  copyDay,
  dayLabel,
  countDaySets,
  DEFAULT_SETS,
  DEFAULT_REPS,
  type PlanDraft,
} from '@/domain/planDraft';

const withPush = (): PlanDraft =>
  addExercises(renameDay(emptyDraft(), 0, 'Push Day'), 0, ['bench', 'fly']);

describe('planDraft', () => {
  it('starts as seven unconfigured days', () => {
    const d = emptyDraft();
    expect(d.days).toHaveLength(7);
    expect(d.days.every(day => !day.isRestDay)).toBe(true);
    expect(d.days.every(day => day.exercises.length === 0)).toBe(true);
    expect(d.days.every(day => day.customName === null)).toBe(true);
  });

  it('never mutates the draft it is given', () => {
    const before = emptyDraft();
    const snapshot = JSON.stringify(before);
    renameDay(before, 0, 'Push Day');
    addExercises(before, 0, ['bench']);
    setRestDay(before, 2, true);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('renames a day and clears the name again', () => {
    const named = renameDay(emptyDraft(), 0, 'Push Day');
    expect(named.days[0]!.customName).toBe('Push Day');
    expect(renameDay(named, 0, null).days[0]!.customName).toBeNull();
  });

  it('trims a name and treats blank as no name', () => {
    expect(renameDay(emptyDraft(), 0, '  Push Day  ').days[0]!.customName).toBe(
      'Push Day',
    );
    expect(renameDay(emptyDraft(), 0, '   ').days[0]!.customName).toBeNull();
  });

  it('falls back to the weekday name when there is no custom one', () => {
    const d = renameDay(emptyDraft(), 0, 'Push Day');
    expect(dayLabel(d.days[0]!, 0)).toBe('Push Day');
    expect(dayLabel(d.days[1]!, 1)).toBe('Tuesday');
  });

  it('adds exercises at 3 x 10 with no weight', () => {
    const d = addExercises(emptyDraft(), 0, ['bench']);
    const added = d.days[0]!.exercises[0]!;
    expect(added.exerciseId).toBe('bench');
    expect(added.sets).toHaveLength(DEFAULT_SETS);
    expect(added.sets.every(s => s.targetReps === DEFAULT_REPS)).toBe(true);
    // NULL, never 0 — a zero target logs zero volume forever.
    expect(added.sets.every(s => s.targetWeight === null)).toBe(true);
  });

  it('appends rather than replacing, and keeps the given order', () => {
    const d = addExercises(addExercises(emptyDraft(), 0, ['a']), 0, ['b', 'c']);
    expect(d.days[0]!.exercises.map(e => e.exerciseId)).toEqual(['a', 'b', 'c']);
  });

  // The same movement twice in one session is legitimate, so this is allowed
  // deliberately rather than deduped.
  it('allows the same exercise twice on one day', () => {
    const d = addExercises(emptyDraft(), 0, ['bench', 'bench']);
    expect(d.days[0]!.exercises).toHaveLength(2);
  });

  it('refuses to add exercises to a rest day', () => {
    const rest = setRestDay(emptyDraft(), 2, true);
    expect(() => addExercises(rest, 2, ['bench'])).toThrow(/rest day/i);
  });

  // Section 6: a rest day shows no exercises. Clearing them on the way in is
  // what makes that true no matter which order the user taps things.
  it('clears exercises when a day becomes a rest day', () => {
    const d = setRestDay(withPush(), 0, true);
    expect(d.days[0]!.isRestDay).toBe(true);
    expect(d.days[0]!.exercises).toEqual([]);
  });

  it('keeps the day name when it becomes a rest day and back again', () => {
    const rest = setRestDay(withPush(), 0, true);
    const back = setRestDay(rest, 0, false);
    expect(back.days[0]!.customName).toBe('Push Day');
    expect(back.days[0]!.isRestDay).toBe(false);
    expect(back.days[0]!.exercises).toEqual([]);
  });

  it('removes one exercise by position', () => {
    const d = removeExercise(withPush(), 0, 0);
    expect(d.days[0]!.exercises.map(e => e.exerciseId)).toEqual(['fly']);
  });

  it('moves an exercise down and up', () => {
    const three = addExercises(emptyDraft(), 0, ['a', 'b', 'c']);
    expect(
      moveExercise(three, 0, 0, 2).days[0]!.exercises.map(e => e.exerciseId),
    ).toEqual(['b', 'c', 'a']);
    expect(
      moveExercise(three, 0, 2, 0).days[0]!.exercises.map(e => e.exerciseId),
    ).toEqual(['c', 'a', 'b']);
  });

  it('leaves the order alone when a move goes nowhere', () => {
    const three = addExercises(emptyDraft(), 0, ['a', 'b', 'c']);
    expect(
      moveExercise(three, 0, 1, 1).days[0]!.exercises.map(e => e.exerciseId),
    ).toEqual(['a', 'b', 'c']);
  });

  it('replaces the whole target list for one exercise', () => {
    const d = setTargets(withPush(), 0, 0, [
      {targetReps: 12, targetWeight: 20},
      {targetReps: 10, targetWeight: 25},
      {targetReps: 8, targetWeight: 30},
    ]);
    expect(d.days[0]!.exercises[0]!.sets).toEqual([
      {targetReps: 12, targetWeight: 20},
      {targetReps: 10, targetWeight: 25},
      {targetReps: 8, targetWeight: 30},
    ]);
    // The neighbour is untouched.
    expect(d.days[0]!.exercises[1]!.sets).toHaveLength(DEFAULT_SETS);
  });

  it('refuses an exercise with no sets', () => {
    expect(() => setTargets(withPush(), 0, 0, [])).toThrow(/at least one set/i);
  });

  it('counts the sets on a day for the week overview', () => {
    expect(countDaySets(withPush().days[0]!)).toBe(DEFAULT_SETS * 2);
    expect(countDaySets(emptyDraft().days[0]!)).toBe(0);
  });

  it('copies a day onto others, targets included', () => {
    const source = setTargets(withPush(), 0, 0, [
      {targetReps: 12, targetWeight: 20},
    ]);
    const d = copyDay(source, 0, [3, 6]);
    for (const weekday of [3, 6]) {
      expect(d.days[weekday]!.customName).toBe('Push Day');
      expect(d.days[weekday]!.exercises.map(e => e.exerciseId)).toEqual([
        'bench',
        'fly',
      ]);
      expect(d.days[weekday]!.exercises[0]!.sets).toEqual([
        {targetReps: 12, targetWeight: 20},
      ]);
    }
  });

  // Deep copy, not shared references: editing Thursday must not change Monday.
  it('copies deeply, so editing the copy leaves the source alone', () => {
    const copied = copyDay(withPush(), 0, [3]);
    const edited = setTargets(copied, 3, 0, [{targetReps: 5, targetWeight: 60}]);
    expect(edited.days[0]!.exercises[0]!.sets).toHaveLength(DEFAULT_SETS);
    expect(edited.days[3]!.exercises[0]!.sets).toEqual([
      {targetReps: 5, targetWeight: 60},
    ]);
  });

  it('overwrites whatever the destination held, including a rest day', () => {
    const source = setRestDay(withPush(), 3, true);
    const d = copyDay(source, 0, [3]);
    expect(d.days[3]!.isRestDay).toBe(false);
    expect(d.days[3]!.exercises).toHaveLength(2);
  });

  it('refuses to copy a day onto itself', () => {
    expect(() => copyDay(withPush(), 0, [0, 3])).toThrow(/itself/i);
  });

  it('rejects a weekday outside the week', () => {
    expect(() => renameDay(emptyDraft(), 7, 'Nope')).toThrow(/weekday/i);
    expect(() => renameDay(emptyDraft(), -1, 'Nope')).toThrow(/weekday/i);
  });
});

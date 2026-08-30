import {
  flattenSets,
  firstPendingIndex,
  nextPendingAfter,
  firstSetOfNextExercise,
  allDecided,
  recordedCount,
} from '@/features/workout/sessionCursor';
import type {
  Session,
  SessionExercise,
  SessionSet,
} from '@/repositories/sessionRepo';

let seq = 0;
const set = (over: Partial<SessionSet> = {}): SessionSet => ({
  id: `set-${++seq}`,
  setNumber: 1,
  targetReps: 12,
  targetWeight: null,
  actualReps: null,
  actualWeight: null,
  status: 'pending',
  isUnplanned: false,
  completedAt: null,
  ...over,
});

const exercise = (
  id: string,
  name: string,
  sets: SessionSet[],
): SessionExercise => ({
  id,
  exerciseId: `e-${id}`,
  name,
  equipment: null,
  weightApplicable: false,
  plannedExerciseId: null,
  orderIndex: 0,
  status: 'pending',
  notes: null,
  substitutedFromName: null,
  sets,
});

const session = (exercises: SessionExercise[]): Session => ({
  id: 'session-1',
  date: 0,
  dayName: 'Chest',
  status: 'in_progress',
  startedAt: 0,
  completedAt: null,
  planVersionId: null,
  planDayId: null,
  exercises,
});

/** The real Sunday shape: 5 sets, then 3, then 3. */
const sunday = () =>
  session([
    exercise('pe-1', '3/4 Sit-Up', [
      set({status: 'completed', actualReps: 12}),
      set({status: 'completed', actualReps: 9}),
      set({status: 'completed', actualReps: 12}),
      set({status: 'completed', actualReps: 11, isUnplanned: true}),
      set(),
    ]),
    exercise('pe-2', '90/90 Hamstring', [set(), set(), set()]),
    exercise('pe-3', 'Ab Crunch Machine', [
      set({status: 'completed', actualReps: 10}),
      set({status: 'completed', actualReps: 10}),
      set({status: 'completed', actualReps: 10}),
    ]),
  ]);

describe('flattenSets', () => {
  it('runs every set of every exercise into one ordered list', () => {
    const cursors = flattenSets(sunday());
    expect(cursors).toHaveLength(11);
    expect(cursors.map(c => c.index)).toEqual([...Array(11).keys()]);
  });

  // "Set 3 of 5" and "exercise 2 of 3" are both 1-based and both counted
  // within their own scope. The flat index is neither of those, and printing
  // it would say "set 6" on the first set of the second exercise.
  it('numbers each set within its exercise, not within the session', () => {
    const cursors = flattenSets(sunday());
    expect(cursors[5]).toMatchObject({
      setNumber: 1,
      setsInExercise: 3,
      exerciseNumber: 2,
      exerciseCount: 3,
    });
  });

  it('carries the exercise each set belongs to', () => {
    const cursors = flattenSets(sunday());
    expect(cursors[0]!.exercise.name).toBe('3/4 Sit-Up');
    expect(cursors[10]!.exercise.name).toBe('Ab Crunch Machine');
  });

  it('copes with an exercise that has no sets left on it', () => {
    expect(flattenSets(session([exercise('pe-1', 'Empty', [])]))).toEqual([]);
  });
});

describe('firstPendingIndex', () => {
  it('resumes at the first set still to be decided', () => {
    expect(firstPendingIndex(flattenSets(sunday()))).toBe(4);
  });

  // Landing back on set one of a finished workout would suggest there was
  // something still to do there.
  it('falls back to the last set when everything is decided', () => {
    const done = session([
      exercise('pe-1', 'Done', [
        set({status: 'completed', actualReps: 10}),
        set({status: 'skipped'}),
      ]),
    ]);
    expect(firstPendingIndex(flattenSets(done))).toBe(1);
  });

  it('does not go negative on an empty session', () => {
    expect(firstPendingIndex([])).toBe(0);
  });
});

describe('nextPendingAfter', () => {
  it('crosses into the next exercise when this one is done', () => {
    const cursors = flattenSets(sunday());
    expect(nextPendingAfter(cursors, 4)).toBe(5);
  });

  /**
   * Forward only. Wrapping round to a pending set earlier in the session would
   * walk you backwards through the gym — a set skipped on purpose stays
   * skipped unless you go back to it deliberately.
   */
  it('never wraps back to an earlier pending set', () => {
    const cursors = flattenSets(
      session([
        exercise('pe-1', 'First', [set(), set({status: 'completed'})]),
        exercise('pe-2', 'Second', [set({status: 'completed'})]),
      ]),
    );
    expect(nextPendingAfter(cursors, 1)).toBeNull();
  });

  it('returns null at the end of the session', () => {
    expect(nextPendingAfter(flattenSets(sunday()), 10)).toBeNull();
  });
});

describe('firstSetOfNextExercise', () => {
  it('skips the rest of the current exercise', () => {
    const cursors = flattenSets(sunday());
    expect(firstSetOfNextExercise(cursors, 0)).toBe(5);
    expect(firstSetOfNextExercise(cursors, 4)).toBe(5);
  });

  it('returns null on the last exercise', () => {
    expect(firstSetOfNextExercise(flattenSets(sunday()), 9)).toBeNull();
  });
});

describe('allDecided and recordedCount', () => {
  it('reports the session unfinished while a set is pending', () => {
    expect(allDecided(flattenSets(sunday()))).toBe(false);
  });

  it('counts recorded sets only — a skip is not a record', () => {
    const cursors = flattenSets(
      session([
        exercise('pe-1', 'Mixed', [
          set({status: 'completed', actualReps: 10}),
          set({status: 'skipped'}),
          set(),
        ]),
      ]),
    );
    expect(recordedCount(cursors)).toBe(1);
    expect(allDecided(cursors)).toBe(false);
  });

  it('calls a session decided when nothing is pending, skips included', () => {
    const cursors = flattenSets(
      session([
        exercise('pe-1', 'Mixed', [
          set({status: 'completed', actualReps: 10}),
          set({status: 'skipped'}),
        ]),
      ]),
    );
    expect(allDecided(cursors)).toBe(true);
  });
});

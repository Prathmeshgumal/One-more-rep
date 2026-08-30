import type {
  Session,
  SessionExercise,
  SessionSet,
} from '@/repositories/sessionRepo';

/**
 * One position in a session, with everything the focus screen needs to draw
 * itself without looking anything up again.
 */
export type SetCursor = {
  set: SessionSet;
  exercise: SessionExercise;
  /** Position in the flattened session — what the screen actually holds. */
  index: number;
  /** 1-based, within the exercise. What "set 3 of 5" counts. */
  setNumber: number;
  setsInExercise: number;
  /** 1-based. What "exercise 2 of 3" counts. */
  exerciseNumber: number;
  exerciseCount: number;
};

/**
 * The session as one ordered run of sets.
 *
 * A screen showing one set at a time needs a single index to move along, not
 * a pair of nested ones. Flattening here rather than in the component is what
 * lets "next" mean the same thing whether the next set is in this exercise or
 * the one after it — and makes the whole of the movement logic testable
 * without rendering anything.
 */
export function flattenSets(session: Session): SetCursor[] {
  const cursors: SetCursor[] = [];
  session.exercises.forEach((exercise, exerciseIndex) => {
    exercise.sets.forEach((set, setIndex) => {
      cursors.push({
        set,
        exercise,
        index: cursors.length,
        setNumber: setIndex + 1,
        setsInExercise: exercise.sets.length,
        exerciseNumber: exerciseIndex + 1,
        exerciseCount: session.exercises.length,
      });
    });
  });
  return cursors;
}

/**
 * Where to resume (spec 6.4: "at the first pending set").
 *
 * Falls back to the last set rather than to the first when everything is
 * decided — landing back on set one of a finished workout would suggest there
 * was something still to do there.
 */
export function firstPendingIndex(cursors: readonly SetCursor[]): number {
  const pending = cursors.findIndex(c => c.set.status === 'pending');
  if (pending >= 0) {
    return pending;
  }
  return Math.max(0, cursors.length - 1);
}

/**
 * The next set still to be decided, after the one given.
 *
 * Searches forward only. Wrapping round to a pending set earlier in the
 * session would move you backwards through the gym, which is not how anyone
 * trains — a set skipped on purpose stays skipped unless you go back to it
 * deliberately.
 */
export function nextPendingAfter(
  cursors: readonly SetCursor[],
  index: number,
): number | null {
  for (let i = index + 1; i < cursors.length; i += 1) {
    if (cursors[i]!.set.status === 'pending') {
      return i;
    }
  }
  return null;
}

/** The first set of the exercise after the one given, if there is one. */
export function firstSetOfNextExercise(
  cursors: readonly SetCursor[],
  index: number,
): number | null {
  const here = cursors[index];
  if (!here) {
    return null;
  }
  const next = cursors.find(
    c => c.index > index && c.exercise.id !== here.exercise.id,
  );
  return next ? next.index : null;
}

/**
 * Whether every set in the session has been decided — which is what makes the
 * finish sheet arrive on its own.
 */
export function allDecided(cursors: readonly SetCursor[]): boolean {
  return cursors.every(c => c.set.status !== 'pending');
}

/** Sets recorded, against the total. The figure in the header. */
export function recordedCount(cursors: readonly SetCursor[]): number {
  return cursors.filter(c => c.set.status === 'completed').length;
}

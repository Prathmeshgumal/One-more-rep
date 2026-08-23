import {WEEKDAY_NAMES} from './weekday';

/** A target for one set. `targetWeight` NULL means bodyweight (section 9). */
export type DraftSet = {targetReps: number; targetWeight: number | null};

/** An exercise on a day. Array position is its order — there is no index field. */
export type DraftExercise = {exerciseId: string; sets: DraftSet[]};

export type DraftDay = {
  customName: string | null;
  isRestDay: boolean;
  exercises: DraftExercise[];
};

/** The whole routine, id-free. Always exactly seven days, Monday first. */
export type PlanDraft = {name: string; days: DraftDay[]};

/** The design's "Added at 3 x 10 — set the real targets next". */
export const DEFAULT_SETS = 3;
export const DEFAULT_REPS = 10;

function assertWeekday(weekday: number): void {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error(`Not a weekday: ${weekday}. Expected 0 (Monday) to 6.`);
  }
}

/** Structural clone. The draft is plain JSON, so this is total and cheap. */
function clone(draft: PlanDraft): PlanDraft {
  return {
    name: draft.name,
    days: draft.days.map(day => ({
      customName: day.customName,
      isRestDay: day.isRestDay,
      exercises: day.exercises.map(exercise => ({
        exerciseId: exercise.exerciseId,
        sets: exercise.sets.map(set => ({...set})),
      })),
    })),
  };
}

/**
 * Applies `change` to one day of a copy, leaving the original untouched.
 *
 * Every edit below goes through here, which is what makes "never mutates the
 * draft it is given" a property of the module rather than a habit.
 */
function withDay(
  draft: PlanDraft,
  weekday: number,
  change: (day: DraftDay) => void,
): PlanDraft {
  assertWeekday(weekday);
  const next = clone(draft);
  change(next.days[weekday]!);
  return next;
}

export function emptyDraft(name = 'My plan'): PlanDraft {
  return {
    name,
    days: WEEKDAY_NAMES.map(() => ({
      customName: null,
      isRestDay: false,
      exercises: [],
    })),
  };
}

export function renameDay(
  draft: PlanDraft,
  weekday: number,
  name: string | null,
): PlanDraft {
  const trimmed = name?.trim() ?? '';
  return withDay(draft, weekday, day => {
    day.customName = trimmed === '' ? null : trimmed;
  });
}

/**
 * Section 6: a rest day has no exercises. They are cleared on the way in rather
 * than hidden, so the rule holds regardless of the order the user taps things —
 * and the day's name survives, because someone toggling Wednesday off and on
 * again should not have to retype "Pull Day".
 */
export function setRestDay(
  draft: PlanDraft,
  weekday: number,
  isRest: boolean,
): PlanDraft {
  return withDay(draft, weekday, day => {
    day.isRestDay = isRest;
    if (isRest) {
      day.exercises = [];
    }
  });
}

export function addExercises(
  draft: PlanDraft,
  weekday: number,
  exerciseIds: readonly string[],
): PlanDraft {
  return withDay(draft, weekday, day => {
    if (day.isRestDay) {
      throw new Error('Cannot add exercises to a rest day.');
    }
    for (const exerciseId of exerciseIds) {
      // Duplicates are allowed: the same movement twice in one session is a
      // real thing people do.
      day.exercises.push({
        exerciseId,
        sets: Array.from({length: DEFAULT_SETS}, () => ({
          targetReps: DEFAULT_REPS,
          targetWeight: null,
        })),
      });
    }
  });
}

export function removeExercise(
  draft: PlanDraft,
  weekday: number,
  index: number,
): PlanDraft {
  return withDay(draft, weekday, day => {
    day.exercises.splice(index, 1);
  });
}

export function moveExercise(
  draft: PlanDraft,
  weekday: number,
  from: number,
  to: number,
): PlanDraft {
  return withDay(draft, weekday, day => {
    const [moved] = day.exercises.splice(from, 1);
    if (moved) {
      day.exercises.splice(to, 0, moved);
    }
  });
}

export function setTargets(
  draft: PlanDraft,
  weekday: number,
  index: number,
  sets: readonly DraftSet[],
): PlanDraft {
  if (sets.length === 0) {
    throw new Error('An exercise needs at least one set.');
  }
  return withDay(draft, weekday, day => {
    const exercise = day.exercises[index];
    if (!exercise) {
      throw new Error(`No exercise at position ${index}.`);
    }
    exercise.sets = sets.map(set => ({...set}));
  });
}

/**
 * Section 31's "duplicate a day" — the lever that makes planning a week
 * bearable.
 *
 * Overwrites the destination entirely, rest days included, which is why the
 * screen warns about days that already hold exercises before doing it.
 */
export function copyDay(
  draft: PlanDraft,
  fromWeekday: number,
  toWeekdays: readonly number[],
): PlanDraft {
  assertWeekday(fromWeekday);
  toWeekdays.forEach(assertWeekday);
  if (toWeekdays.includes(fromWeekday)) {
    throw new Error('A day cannot be copied onto itself.');
  }

  const next = clone(draft);
  const source = next.days[fromWeekday]!;
  for (const weekday of toWeekdays) {
    // Cloned per destination, so the copies share set objects neither with
    // each other nor with the source.
    next.days[weekday] = {
      customName: source.customName,
      isRestDay: source.isRestDay,
      exercises: source.exercises.map(exercise => ({
        exerciseId: exercise.exerciseId,
        sets: exercise.sets.map(set => ({...set})),
      })),
    };
  }
  return next;
}

/** What to show as the day's heading (section 5). */
export function dayLabel(day: DraftDay, weekday: number): string {
  return day.customName ?? WEEKDAY_NAMES[weekday]!;
}

/** Total planned sets on a day — the "· 15 sets" on the week overview. */
export function countDaySets(day: DraftDay): number {
  return day.exercises.reduce((total, e) => total + e.sets.length, 0);
}

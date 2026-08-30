import {compareSet} from './setComparison';

/** The shape every aggregate reads. A row, minus everything they ignore. */
export type ProgressSet = {
  targetReps: number | null;
  targetWeight: number | null;
  actualReps: number | null;
  actualWeight: number | null;
  status: 'pending' | 'completed' | 'skipped';
  isUnplanned: boolean;
};

export type ExerciseAggregate = {
  plannedSets: number;
  /** Completed **planned** sets. Bonus work is counted separately, because a
   *  numerator that includes it against a denominator that excludes it reads
   *  as "you did everything" on an exercise where a set was skipped. */
  completedSets: number;
  /** Completed bonus sets — real work, but never part of the plan. */
  completedUnplannedSets: number;
  skippedSets: number;
  unplannedSets: number;
  /** NULL, never 0, when the exercise carries no weight (§26). */
  actualVolume: number | null;
  targetVolume: number | null;
  actualReps: number;
  targetReps: number;
  status: 'achieved' | 'exceeded' | 'below';
};

const round = (value: number): number => Math.round(value * 100) / 100;

const isDone = (set: ProgressSet): boolean =>
  set.status === 'completed' && set.actualReps !== null;

/**
 * Rolls a single exercise up (§17, spec 5.2).
 *
 * Skipped sets are counted separately and never as achieved, but their target
 * still stands in `targetVolume` — that is precisely what makes skipping show
 * up as below target rather than quietly disappearing.
 */
export function aggregateExercise(
  sets: readonly ProgressSet[],
  weightApplicable: boolean,
): ExerciseAggregate {
  let plannedSets = 0;
  let completedSets = 0;
  let completedUnplannedSets = 0;
  let skippedSets = 0;
  let unplannedSets = 0;
  let actualVolume = 0;
  let targetVolume = 0;
  let actualReps = 0;
  let targetReps = 0;

  for (const set of sets) {
    if (set.isUnplanned) {
      unplannedSets += 1;
    } else {
      plannedSets += 1;
      targetVolume += (set.targetWeight ?? 0) * (set.targetReps ?? 0);
      targetReps += set.targetReps ?? 0;
    }

    if (set.status === 'skipped') {
      skippedSets += 1;
    }
    if (isDone(set)) {
      if (set.isUnplanned) {
        completedUnplannedSets += 1;
      } else {
        completedSets += 1;
      }
      // Bonus work counts towards what was actually lifted. It is real work;
      // it just never had a target to be measured against.
      actualVolume += (set.actualWeight ?? 0) * (set.actualReps ?? 0);
      actualReps += set.actualReps ?? 0;
    }
  }

  // §26: for a movement that carries no weight, volume is omitted rather than
  // reported as zero, and reps decide the verdict instead.
  const [actual, target] = weightApplicable
    ? [actualVolume, targetVolume]
    : [actualReps, targetReps];

  const status =
    actual > target ? 'exceeded' : actual < target ? 'below' : 'achieved';

  return {
    plannedSets,
    completedSets,
    completedUnplannedSets,
    skippedSets,
    unplannedSets,
    actualVolume: weightApplicable ? round(actualVolume) : null,
    targetVolume: weightApplicable ? round(targetVolume) : null,
    actualReps,
    targetReps,
    status,
  };
}

/**
 * Total weight moved in a session (§26).
 *
 * Bodyweight exercises contribute nothing at all — not zero, nothing — so the
 * number stays a straight answer to "how much did I lift".
 */
export function sessionVolume(
  exercises: readonly {
    sets: readonly ProgressSet[];
    weightApplicable: boolean;
  }[],
): number {
  let total = 0;
  for (const exercise of exercises) {
    if (!exercise.weightApplicable) {
      continue;
    }
    for (const set of exercise.sets) {
      if (isDone(set)) {
        total += (set.actualWeight ?? 0) * (set.actualReps ?? 0);
      }
    }
  }
  return round(total);
}

/**
 * Completed planned sets over total planned sets (§19, spec 5.5).
 *
 * Unplanned work is excluded from both halves, so the number can never pass
 * 100 — 93% has to mean 93% of the plan, or it means nothing.
 *
 * Returns null when nothing was planned: a fully ad-hoc session has no plan to
 * be a percentage of, and 0% would read as total failure for a workout where
 * everything went right.
 */
export function completionPercent(sets: readonly ProgressSet[]): number | null {
  const planned = sets.filter(s => !s.isUnplanned);
  if (planned.length === 0) {
    return null;
  }
  const done = planned.filter(isDone).length;
  return Math.round((done / planned.length) * 100);
}

/** The achieved / exceeded / below / skipped breakdown of the finish summary. */
export function countByStatus(sets: readonly ProgressSet[]): {
  achieved: number;
  exceeded: number;
  below: number;
  skipped: number;
} {
  const counts = {achieved: 0, exceeded: 0, below: 0, skipped: 0};
  for (const set of sets) {
    const {status} = compareSet(set);
    if (status !== 'unplanned') {
      counts[status] += 1;
    }
  }
  return counts;
}

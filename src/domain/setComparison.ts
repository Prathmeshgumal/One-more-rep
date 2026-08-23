export type ComparisonStatus =
  | 'achieved'
  | 'exceeded'
  | 'below'
  | 'skipped'
  | 'unplanned';

/** What actually differed, unworded so the unit can be applied later. */
export type ComparisonDelta = {
  kind: 'none' | 'reps' | 'weight' | 'volume';
  amount: number;
};

export type SetComparison = {status: ComparisonStatus; delta: ComparisonDelta};

const EVEN: ComparisonDelta = {kind: 'none', amount: 0};

/** Two decimals is finer than any plate; beyond that it is float noise. */
const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Compares one set against the target it was given (§15, spec 5.1).
 *
 * The interesting case is the mixed one — heavier but shorter, or lighter but
 * longer. Neither dimension can settle it, so volume does, which is the same
 * basis §17 and §26 already aggregate on. Deciding it any other way would make
 * a set read as "exceeded" while dragging the exercise total down.
 */
export function compareSet(args: {
  targetReps: number | null;
  targetWeight: number | null;
  actualReps: number | null;
  actualWeight: number | null;
  status: 'pending' | 'completed' | 'skipped';
}): SetComparison {
  const {targetReps, targetWeight, actualReps, actualWeight} = args;

  // A set that has not been recorded has nothing to compare, whether it was
  // skipped outright or the workout ended before it. Both read as skipped:
  // `status` is the sole source of truth for whether a set happened.
  if (args.status !== 'completed' || actualReps === null) {
    return {status: 'skipped', delta: EVEN};
  }

  // D3: a bonus set had no target. Not a success, not a failure — extra work.
  if (targetReps === null) {
    return {status: 'unplanned', delta: EVEN};
  }

  // Bodyweight: reps decide alone. Comparing against a weight of zero — or
  // against a dumbbell someone happened to hold — would be meaningless.
  if (targetWeight === null) {
    const diff = actualReps - targetReps;
    if (diff === 0) {
      return {status: 'achieved', delta: EVEN};
    }
    return {
      status: diff > 0 ? 'exceeded' : 'below',
      delta: {kind: 'reps', amount: diff},
    };
  }

  const weight = actualWeight ?? 0;
  const repsDiff = actualReps - targetReps;
  const weightDiff = round(weight - targetWeight);

  if (repsDiff === 0 && weightDiff === 0) {
    return {status: 'achieved', delta: EVEN};
  }

  // One dimension held, so the other one names the difference on its own.
  if (weightDiff === 0) {
    return {
      status: repsDiff > 0 ? 'exceeded' : 'below',
      delta: {kind: 'reps', amount: repsDiff},
    };
  }
  if (repsDiff === 0) {
    return {
      status: weightDiff > 0 ? 'exceeded' : 'below',
      delta: {kind: 'weight', amount: weightDiff},
    };
  }

  // Both moved. Volume settles it.
  const volumeDiff = round(weight * actualReps - targetWeight * targetReps);
  if (volumeDiff === 0) {
    return {status: 'achieved', delta: EVEN};
  }
  return {
    status: volumeDiff > 0 ? 'exceeded' : 'below',
    delta: {kind: 'volume', amount: volumeDiff},
  };
}

/** A true minus sign — a hyphen is the wrong width beside tabular figures. */
const MINUS = '−';

const signed = (amount: number, body: string): string =>
  `${amount > 0 ? '+' : MINUS}${body}`;

/** Words a comparison for display, in whichever unit the user has set. */
export function describeComparison(
  comparison: SetComparison,
  unit: string,
): string {
  if (comparison.status === 'skipped') {
    return 'Skipped';
  }
  if (comparison.status === 'unplanned') {
    return 'Bonus';
  }

  const {kind, amount} = comparison.delta;
  const magnitude = Math.abs(amount);

  switch (kind) {
    case 'reps':
      return signed(amount, `${magnitude} ${magnitude === 1 ? 'rep' : 'reps'}`);
    case 'weight':
      return signed(amount, `${magnitude.toFixed(1)} ${unit}`);
    case 'volume':
      return signed(amount, `${magnitude} ${unit} vol`);
    default:
      return 'even';
  }
}

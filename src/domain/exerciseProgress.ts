/** One completed set, reduced to the two numbers progression is made of. */
export type ProgressSetEntry = {reps: number; weight: number | null};

/** One session's completed sets for a single exercise, in set order. */
export type ProgressSession = {
  sessionId: string;
  date: number;
  sets: readonly ProgressSetEntry[];
};

export type SessionProgress = ProgressSession & {
  /** NULL, never 0, when the exercise carries no weight (§26). */
  volume: number | null;
  /** The heaviest weight touched, or NULL when none was recorded. */
  topWeight: number | null;
};

export type BestSet = {
  reps: number;
  weight: number | null;
  volume: number | null;
};

export type ExerciseProgress = {
  /** In the order given — the repository hands them over newest first. */
  sessions: SessionProgress[];
  bestSet: BestSet | null;
  bestVolume: number | null;
  /** The working-weight run, oldest to newest, repeats collapsed. */
  workingWeights: number[];
};

/** Two decimals is finer than any plate; beyond that it is float noise. */
const round = (value: number): number => Math.round(value * 100) / 100;

/** The design draws four steps. It reads as a sentence, not as a table. */
const DEFAULT_RUN_LENGTH = 4;

function topWeightOf(sets: readonly ProgressSetEntry[]): number | null {
  let top: number | null = null;
  for (const set of sets) {
    if (set.weight !== null && (top === null || set.weight > top)) {
      top = set.weight;
    }
  }
  return top;
}

/**
 * Turns one exercise's history into the three things design 15 draws (§24, §26).
 *
 * `sessions` must arrive **newest first**; the order is preserved, and the tie
 * rules below depend on it — where two sets or two sessions are equal, the
 * more recent one is reported, because a repeat of your best is worth seeing
 * as current rather than as history.
 */
export function summarizeProgress(
  sessions: readonly ProgressSession[],
  weightApplicable: boolean,
  opts: {runLength?: number} = {},
): ExerciseProgress {
  const runLength = opts.runLength ?? DEFAULT_RUN_LENGTH;

  const resolved: SessionProgress[] = sessions.map(session => {
    const volume = session.sets.reduce(
      (sum, set) => sum + (set.weight ?? 0) * set.reps,
      0,
    );
    return {
      ...session,
      volume: weightApplicable ? round(volume) : null,
      topWeight: topWeightOf(session.sets),
    };
  });

  let bestSet: BestSet | null = null;
  let bestScore = -Infinity;
  let bestVolume: number | null = null;

  for (const session of resolved) {
    if (
      session.volume !== null &&
      (bestVolume === null || session.volume > bestVolume)
    ) {
      bestVolume = session.volume;
    }
    for (const set of session.sets) {
      // Weighted work is judged on volume, bodyweight work on reps — the same
      // basis §17 and §26 already aggregate on.
      const score = weightApplicable ? (set.weight ?? 0) * set.reps : set.reps;
      if (score > bestScore) {
        bestScore = score;
        bestSet = {
          reps: set.reps,
          weight: set.weight,
          volume: weightApplicable ? round((set.weight ?? 0) * set.reps) : null,
        };
      }
    }
  }

  const workingWeights: number[] = [];
  if (weightApplicable) {
    // Oldest first, so the run reads left to right the way progression happens.
    for (let i = resolved.length - 1; i >= 0; i -= 1) {
      const top = resolved[i]?.topWeight;
      if (top === null || top === undefined) {
        continue;
      }
      // A weight held for three weeks is one step, not three.
      if (workingWeights[workingWeights.length - 1] !== top) {
        workingWeights.push(top);
      }
    }
  }

  return {
    sessions: resolved,
    bestSet,
    bestVolume,
    workingWeights: workingWeights.slice(-runLength),
  };
}

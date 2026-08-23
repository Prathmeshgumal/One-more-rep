import type {ResolvedDay} from './dayResolver';

export type Adherence = {
  /** Training days that have come due: completed, partial, or missed. */
  plannedWorkouts: number;
  completedWorkouts: number;
  partialWorkouts: number;
  missedWorkouts: number;
  restDays: number;
  /** Training days still ahead — reported, but in neither half of the ratio. */
  upcomingWorkouts: number;
  /** Planned sets on the due days. Unplanned work is excluded (spec 5.5). */
  plannedSets: number;
  completedSets: number;
  skippedSets: number;
  /** Completed workouts over due workouts. Null when nothing was due. */
  percent: number | null;
  /** Completed sets over planned sets. Null when nothing was planned. */
  setPercent: number | null;
  /** Total weight moved across the range (§26), bonus work included. */
  volume: number;
};

const percentOf = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 100);

/**
 * Rolls resolved days into the §27 metrics.
 *
 * Two rules carry all the weight here:
 *
 * 1. **Only days that have come due are counted.** A Friday that has not
 *    happened yet is not a workout you missed, and letting it into the
 *    denominator would make every week read as a failure until Sunday night.
 * 2. **Unplanned work is excluded from both halves** (spec 5.5) — enforced
 *    upstream, where the session aggregate counts planned sets only. That is
 *    what makes it structurally impossible to exceed 100%.
 */
export function summarizeAdherence(days: readonly ResolvedDay[]): Adherence {
  const totals = {
    plannedWorkouts: 0,
    completedWorkouts: 0,
    partialWorkouts: 0,
    missedWorkouts: 0,
    restDays: 0,
    upcomingWorkouts: 0,
    plannedSets: 0,
    completedSets: 0,
    skippedSets: 0,
    volume: 0,
  };

  for (const day of days) {
    totals.volume += day.volume ?? 0;

    switch (day.status) {
      case 'rest':
        totals.restDays += 1;
        continue;
      case 'upcoming':
        totals.upcomingWorkouts += 1;
        continue;
      case 'no_plan':
        continue;
      case 'completed':
        totals.completedWorkouts += 1;
        break;
      case 'partial':
        totals.partialWorkouts += 1;
        break;
      case 'missed':
        totals.missedWorkouts += 1;
        break;
    }

    // Only the three due statuses reach here — the rest continued above.
    totals.plannedWorkouts += 1;
    totals.plannedSets += day.plannedSets;
    totals.completedSets += day.completedSets;
    totals.skippedSets += day.skippedSets;
  }

  return {
    ...totals,
    volume: Math.round(totals.volume * 100) / 100,
    percent: percentOf(totals.completedWorkouts, totals.plannedWorkouts),
    setPercent: percentOf(totals.completedSets, totals.plannedSets),
  };
}

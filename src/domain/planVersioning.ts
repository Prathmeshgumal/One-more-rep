import {isSameLocalDay} from './weekday';

/**
 * Whether an edit may rewrite the active version instead of forking a new one
 * (spec 4.2, "compaction exception").
 *
 * Forking is the default and the safe answer: it is what keeps a workout's
 * targets frozen at what they were when it was performed (section 32). The
 * exception exists only because without it, a single evening spent building a
 * week produces a dozen near-identical versions.
 *
 * Both conditions are required. "Started today" alone is not enough — someone
 * can plan in the morning, train at lunch, and re-plan in the evening, and that
 * lunchtime session must keep the targets it was done against.
 */
export function canEditInPlace(args: {
  effectiveFrom: number;
  now: number;
  /** Workout sessions referencing this version. See the note in planRepo. */
  sessionCount: number;
}): boolean {
  return args.sessionCount === 0 && isSameLocalDay(args.effectiveFrom, args.now);
}

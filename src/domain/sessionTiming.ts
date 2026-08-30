import type {Session} from '@/repositories/sessionRepo';

export type SessionTiming = {
  /**
   * Start to save, on the wall clock. Measures the wrong thing at both ends —
   * it includes changing, warming up, and however long it took you to
   * remember to press Save — but it is the only number a session with one
   * recorded set can offer, so it stays.
   */
  total: number | null;
  /**
   * First recorded set to last: the span you were actually working across.
   *
   * Understates by roughly one set, because a set is stamped when you press
   * Record, which is after you have done it. Nothing can recover that without
   * asking you to start a timer, which nobody does mid-set.
   */
  working: number | null;
  /** The middle gap between consecutive sets. Median, not mean: one trip to */
  medianRest: number | null;
  /** ...the water fountain would drag a mean anywhere it liked. */
  longestRest: number | null;
  recorded: number;
};

const median = (sorted: readonly number[]): number => {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/**
 * What the session's own timestamps have to say about how long it took.
 *
 * Every recorded set already carries the moment it was written, and until now
 * nothing read them: the only duration in the app was Start to Save, which
 * shows nothing for a session left unsaved and inflates every session you
 * closed on the drive home.
 *
 * Timestamps are sorted rather than taken in set order. You can record set 3
 * before set 2 — the rail, the peek and the edge taps all allow it — and a
 * span computed from the first and last *rows* would come out negative.
 *
 * Nothing here discards a long gap. A rest of twenty minutes because you left
 * the floor is real, and hiding it behind a threshold would mean inventing a
 * number for what counts as leaving; a visible long rest is more honest than
 * a tidy one that quietly deleted it.
 */
export function sessionTiming(
  session: Session,
  opts: {now?: number} = {},
): SessionTiming {
  const stamps = session.exercises
    .flatMap(e => e.sets)
    .filter(s => s.status === 'completed' && s.completedAt !== null)
    .map(s => s.completedAt!)
    .sort((a, b) => a - b);

  const end = session.completedAt ?? opts.now ?? null;
  const total = end === null ? null : Math.max(0, end - session.startedAt);

  if (stamps.length < 2) {
    return {
      total,
      working: null,
      medianRest: null,
      longestRest: null,
      recorded: stamps.length,
    };
  }

  const gaps: number[] = [];
  for (let i = 1; i < stamps.length; i++) {
    gaps.push(stamps[i]! - stamps[i - 1]!);
  }
  const sorted = [...gaps].sort((a, b) => a - b);

  return {
    total,
    working: stamps[stamps.length - 1]! - stamps[0]!,
    medianRest: median(sorted),
    longestRest: sorted[sorted.length - 1]!,
    recorded: stamps.length,
  };
}

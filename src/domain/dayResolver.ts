import {eachLocalDay, startOfLocalDay, weekdayIndex} from './weekday';

/**
 * What a single calendar date *was* (spec 5.4).
 *
 * `no_plan` covers both "no routine existed then" and "that weekday was never
 * configured" — in both cases nothing was owed, which is a different thing
 * from owing a workout and not doing it.
 */
export type DayStatus =
  | 'completed'
  | 'partial'
  | 'missed'
  | 'rest'
  | 'upcoming'
  | 'no_plan';

/** One weekday of a plan version, flattened to what the resolver reads. */
export type ResolverDay = {
  weekday: number;
  /** Already resolved: the custom name, or the weekday's own name. */
  name: string;
  isRestDay: boolean;
  exerciseCount: number;
  setCount: number;
};

export type VersionSpan = {
  id: string;
  effectiveFrom: number;
  /** NULL means still active. Exclusive: the fork date belongs to the successor. */
  effectiveTo: number | null;
  days: readonly ResolverDay[];
};

/**
 * A session flattened to what the resolver reads — no set rows.
 *
 * `plannedSets` and `completedSets` both **exclude unplanned work** (spec 5.5):
 * a bonus set is real training but it had no target, so counting it would let
 * a workout report more than 100% of a plan it never had. `volume` is the
 * opposite — it is what was actually lifted, bonus sets included.
 */
export type ResolverSession = {
  id: string;
  /** Local midnight. */
  date: number;
  dayName: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  /** Every exercise performed, unplanned ones included. */
  exerciseCount: number;
  /** Planned sets only. */
  plannedSets: number;
  /** Completed planned sets only. */
  completedSets: number;
  skippedSets: number;
  volume: number | null;
};

/**
 * Everything the resolver is allowed to know, loaded once for a whole range.
 *
 * The resolver takes no database handle and performs no lookups by design: it
 * is what makes spec 5.4's batching requirement enforceable at all. If this
 * type ever grows a fetch function, per-date querying has crept back in.
 */
export type ResolverContext = {
  /** Local midnight of today. */
  today: number;
  versions: readonly VersionSpan[];
  sessions: readonly ResolverSession[];
};

export type ResolvedDay = {
  date: number;
  weekday: number;
  status: DayStatus;
  /** The day's name — the session's snapshot if one exists, else the plan's. */
  name: string | null;
  sessionId: string | null;
  /** Performed when a session exists, planned otherwise. */
  exerciseCount: number;
  plannedSets: number;
  completedSets: number;
  skippedSets: number;
  volume: number | null;
};

function versionFor(
  versions: readonly VersionSpan[],
  date: number,
): VersionSpan | undefined {
  return versions.find(
    v =>
      v.effectiveFrom <= date &&
      (v.effectiveTo === null || date < v.effectiveTo),
  );
}

/**
 * Spec 5.4's session mapping.
 *
 * An abandoned session with nothing recorded is indistinguishable from not
 * training, and must not be presented as partial credit — that is the one rule
 * here that keeps adherence honest.
 */
function sessionStatus(
  session: ResolverSession,
  date: number,
  today: number,
): DayStatus {
  if (session.status === 'completed') {
    return 'completed';
  }
  if (session.completedSets > 0) {
    return 'partial';
  }
  if (session.status === 'abandoned') {
    return 'missed';
  }
  // Still in progress with nothing recorded: today it has not started yet, and
  // on a past day the rollover has simply not run.
  return date < today ? 'missed' : 'upcoming';
}

/**
 * Resolves one date (spec 5.4).
 *
 * Resolving through `plan_versions` rather than through the current plan is
 * what makes success criterion 9 structural: editing today's routine cannot
 * change whether last Tuesday was a rest day.
 */
export function resolveDay(date: number, ctx: ResolverContext): ResolvedDay {
  const day = startOfLocalDay(date);
  const weekday = weekdayIndex(new Date(day));

  const session = ctx.sessions.find(s => s.date === day);
  if (session) {
    return {
      date: day,
      weekday,
      status: sessionStatus(session, day, ctx.today),
      // The snapshot, not the plan: this is why history still says "Push Day"
      // after the routine renames that day.
      name: session.dayName,
      sessionId: session.id,
      exerciseCount: session.exerciseCount,
      plannedSets: session.plannedSets,
      completedSets: session.completedSets,
      skippedSets: session.skippedSets,
      volume: session.volume,
    };
  }

  const blank = {
    date: day,
    weekday,
    sessionId: null,
    exerciseCount: 0,
    plannedSets: 0,
    completedSets: 0,
    skippedSets: 0,
    volume: null,
  };

  const version = versionFor(ctx.versions, day);
  const planned = version?.days.find(d => d.weekday === weekday);

  // No routine then, no such weekday configured, or a weekday left empty and
  // never marked as rest — all three asked nothing of you.
  if (!planned || (!planned.isRestDay && planned.exerciseCount === 0)) {
    return {...blank, status: 'no_plan', name: null};
  }

  if (planned.isRestDay) {
    return {...blank, status: 'rest', name: planned.name};
  }

  return {
    ...blank,
    status: day < ctx.today ? 'missed' : 'upcoming',
    name: planned.name,
    exerciseCount: planned.exerciseCount,
    plannedSets: planned.setCount,
  };
}

/** Every day in an inclusive range, oldest first. */
export function resolveDays(
  from: number,
  to: number,
  ctx: ResolverContext,
): ResolvedDay[] {
  return eachLocalDay(from, to).map(day => resolveDay(day, ctx));
}

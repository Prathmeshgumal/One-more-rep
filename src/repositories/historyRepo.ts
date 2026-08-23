import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import {
  exercises,
  performedExercises,
  performedSets,
  planDays,
  plannedExercises,
  plannedSets,
  planVersions,
  workoutSessions,
} from '@/db/schema';
import type {AppDatabase} from '@/db/types';
import {
  resolveDay,
  resolveDays,
  type ResolvedDay,
  type ResolverContext,
  type ResolverDay,
  type ResolverSession,
  type VersionSpan,
} from '@/domain/dayResolver';
import {startOfLocalDay, weekdayName} from '@/domain/weekday';

export type DayRange = {from: number; to: number};

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Loads everything the resolver needs for a whole range, in four queries.
 *
 * Spec 5.4 forbids per-date querying, and the constant that matters is not
 * four — it is that the count does not depend on the length of the range. A
 * year and a day both cost exactly this much. `historyRepo.range.test.ts`
 * asserts it with a spy, because this is the kind of requirement that decays
 * silently the first time someone adds a convenient lookup inside a loop.
 */
async function loadContext(
  db: AppDatabase,
  range: DayRange,
  today: number,
): Promise<ResolverContext> {
  const from = startOfLocalDay(range.from);
  const to = startOfLocalDay(range.to);

  // 1. Every plan version whose span overlaps the range. `effective_to` is
  //    exclusive, so a version that closed on `from` does not qualify.
  const versionRows = await db
    .select()
    .from(planVersions)
    .where(
      and(
        lte(planVersions.effectiveFrom, to),
        or(isNull(planVersions.effectiveTo), gt(planVersions.effectiveTo, from)),
      ),
    )
    // Newest first, matching `getPlanForDate`, so the resolver's `find` picks
    // the same version this repository would if the spans ever overlapped.
    .orderBy(desc(planVersions.effectiveFrom));

  const versionIds = versionRows.map(v => v.id);

  // 2. Their days, with the exercise and set counts, grouped in the database
  //    rather than by fetching every planned set into memory.
  const dayRows = versionIds.length
    ? await db
        .select({
          planVersionId: planDays.planVersionId,
          weekday: planDays.weekday,
          customName: planDays.customName,
          isRestDay: planDays.isRestDay,
          exerciseCount: sql<number>`COUNT(DISTINCT ${plannedExercises.id})`,
          setCount: sql<number>`COUNT(${plannedSets.id})`,
        })
        .from(planDays)
        .leftJoin(plannedExercises, eq(plannedExercises.planDayId, planDays.id))
        .leftJoin(
          plannedSets,
          eq(plannedSets.plannedExerciseId, plannedExercises.id),
        )
        .where(inArray(planDays.planVersionId, versionIds))
        .groupBy(planDays.id)
    : [];

  const daysByVersion = new Map<string, ResolverDay[]>();
  for (const row of dayRows) {
    const list = daysByVersion.get(row.planVersionId) ?? [];
    list.push({
      weekday: row.weekday,
      name: row.customName ?? weekdayName(row.weekday),
      isRestDay: row.isRestDay,
      exerciseCount: Number(row.exerciseCount),
      setCount: Number(row.setCount),
    });
    daysByVersion.set(row.planVersionId, list);
  }

  const versions: VersionSpan[] = versionRows.map(row => ({
    id: row.id,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    days: daysByVersion.get(row.id) ?? [],
  }));

  // 3. Every session in the range.
  const sessionRows = await db
    .select()
    .from(workoutSessions)
    .where(and(gte(workoutSessions.date, from), lte(workoutSessions.date, to)))
    .orderBy(asc(workoutSessions.date));

  const sessionIds = sessionRows.map(s => s.id);

  // 4. Their set counts and volume, again grouped in the database.
  //
  //    `plannedSets` and `completedSets` both filter out unplanned work
  //    (spec 5.5) so a bonus set can never push a day past 100%. `volume`
  //    deliberately does not — it is what was lifted, not what was planned.
  const aggregateRows = sessionIds.length
    ? await db
        .select({
          sessionId: performedExercises.workoutSessionId,
          exerciseCount: sql<number>`COUNT(DISTINCT ${performedExercises.id})`,
          plannedSets: sql<number>`SUM(CASE WHEN ${performedSets.id} IS NOT NULL
              AND ${performedSets.isUnplanned} = 0 THEN 1 ELSE 0 END)`,
          completedSets: sql<number>`SUM(CASE WHEN ${performedSets.isUnplanned} = 0
              AND ${performedSets.status} = 'completed'
              AND ${performedSets.actualReps} IS NOT NULL THEN 1 ELSE 0 END)`,
          skippedSets: sql<number>`SUM(CASE WHEN ${performedSets.status} = 'skipped'
              THEN 1 ELSE 0 END)`,
          weightedExercises: sql<number>`COUNT(DISTINCT CASE
              WHEN ${exercises.weightApplicable} = 1
              THEN ${performedExercises.id} END)`,
          volume: sql<number>`SUM(CASE WHEN ${performedSets.status} = 'completed'
              AND ${exercises.weightApplicable} = 1
              THEN COALESCE(${performedSets.actualWeight}, 0)
                 * COALESCE(${performedSets.actualReps}, 0)
              ELSE 0 END)`,
        })
        .from(performedExercises)
        .innerJoin(exercises, eq(exercises.id, performedExercises.exerciseId))
        .leftJoin(
          performedSets,
          eq(performedSets.performedExerciseId, performedExercises.id),
        )
        .where(inArray(performedExercises.workoutSessionId, sessionIds))
        .groupBy(performedExercises.workoutSessionId)
    : [];

  const aggregates = new Map(aggregateRows.map(row => [row.sessionId, row]));

  const sessions: ResolverSession[] = sessionRows.map(row => {
    const agg = aggregates.get(row.id);
    // §26: a session with no weighted movement in it has no volume, rather
    // than a volume of zero.
    const weighted = Number(agg?.weightedExercises ?? 0) > 0;
    return {
      id: row.id,
      date: row.date,
      dayName: row.dayNameSnapshot,
      status: row.status,
      exerciseCount: Number(agg?.exerciseCount ?? 0),
      plannedSets: Number(agg?.plannedSets ?? 0),
      completedSets: Number(agg?.completedSets ?? 0),
      skippedSets: Number(agg?.skippedSets ?? 0),
      volume: weighted ? round(Number(agg?.volume ?? 0)) : null,
    };
  });

  return {today: startOfLocalDay(today), versions, sessions};
}

/** Every day in an inclusive range, resolved and oldest first (§22, §23). */
export async function getDayRange(
  db: AppDatabase,
  range: DayRange,
  opts: {now?: number} = {},
): Promise<ResolvedDay[]> {
  const today = opts.now ?? Date.now();
  const ctx = await loadContext(db, range, today);
  return resolveDays(range.from, range.to, ctx);
}

/** One day, for the day-detail screen's header. */
export async function getDay(
  db: AppDatabase,
  date: number,
  opts: {now?: number} = {},
): Promise<ResolvedDay> {
  const day = startOfLocalDay(date);
  const ctx = await loadContext(
    db,
    {from: day, to: day},
    opts.now ?? Date.now(),
  );
  return resolveDay(day, ctx);
}

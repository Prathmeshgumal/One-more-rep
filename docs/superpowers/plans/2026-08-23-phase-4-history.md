# Phase 4 — History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the History tab — a day timeline, a month calendar, a per-day ledger, and a per-exercise progression view — reading everything Phase 3 wrote, and resolving past days through the plan version that was in force *then*, so editing the routine today cannot rewrite last week.

**Architecture:** A pure `dayResolver` decides what each calendar date *was* (completed / partial / missed / rest / upcoming / no plan) from three inputs it is handed rather than fetches: the plan versions overlapping the range, the sessions in the range, and today's date. `historyRepo` is the only thing that queries, and it queries a **constant number of times per range** — four — regardless of whether the range is a week or a year. Two more pure modules sit beside the resolver: `adherence` rolls resolved days into the §27 metrics, and `exerciseProgress` turns one exercise's session history into the working-weight run and best-set figures §24 and §26 ask for. Screens consume all of it through TanStack Query hooks and render with the existing Ledger primitives.

**Tech Stack:** React Native CLI 0.87.0 (bare, Android only), TypeScript 6 strict with `noUncheckedIndexedAccess`, `@op-engineering/op-sqlite` 18.1.4 + Drizzle ORM 0.45.2, TanStack Query, React Navigation native-stack, Jest + React Native Testing Library 14.

**Spec:** `docs/superpowers/specs/2026-08-22-workout-tracker-design.md` — sections 5.4 (day resolution), 5.5 (adherence), 7 (history and analytics), 11 (phase 4 row). Requirements: `docs/app_features.md` §16, §22, §23, §24, §26, §27. Approved designs: `docs/design/screens.html` figures **12** (timeline), **13** (calendar), **14** (day detail), **15** (exercise history).

## Global Constraints

Every task's requirements implicitly include this section. These are accumulated across Phases 0–3.

**Platform and stack**
- React Native CLI only. **No Expo, no Expo Router.** **Android only, permanently** — no iOS, no web (D1, R4).
- Local SQLite is the source of truth. No network exists in the MVP.
- TypeScript strict, `noUncheckedIndexedAccess` on: `array[0]` is `T | undefined` and must be narrowed, never `!`-asserted away in production code. (`!` is acceptable in tests, where the fixture guarantees the element.)
- Path alias `@/` maps to `src/`. Tests import fixtures by relative path.

**Layering (spec section 8) — two hard boundaries**
1. `src/domain/` imports **nothing** from `src/db/`, `src/repositories/`, or `react-native`. It operates on plain objects. It must not hard-code the weight unit — return structured values and let the screen word them (this is why `describeComparison` takes a `unit` argument).
2. `src/repositories/` is the **only** place SQL appears. Screens never write queries. Repositories receive the Drizzle instance by dependency injection (`db: AppDatabase` as the first parameter) — never by importing one.

**Design (D13 — the Ledger system)**
- Nothing outside `src/theme/tokens.ts` may declare a colour or a font size. Use tokens by name.
- Below-target is **ochre (`short`), never red.** The palette contains no red token, deliberately.
- Type tokens only: `display`, `bignum`, `h1`, `h2`, `h3`, `body`, `bodyStrong`, `small`, `caption`, `eyebrow`, `printed`, `inkNum`, `mono`, `monoSmall`.
- Spacing only from `space = {xs:4, sm:8, md:12, lg:16, xl:20, xxl:24, xxxl:32}`; radii only from `radius = {sm:10, md:14, lg:20, pill:999}`.
- A true minus sign `−` (U+2212), not a hyphen, beside tabular figures. A skipped actual renders as an em dash `—`.
- The design HTML is the source of truth for layout. Where this plan and the design disagree, the design wins; where the design is silent, record the addition in `docs/deferred.md` under "Design departures".

**Dates**
- `weekday` is **0 = Monday … 6 = Sunday**. `Date.getDay()` returns 0 for Sunday and is converted in exactly one place — `weekdayIndex()` in `src/domain/weekday.ts`. Calling `getDay()` anywhere else is a bug.
- Every stored date is **local midnight** (`startOfLocalDay`). Compare dates as numbers, never as `Date` objects.

**Testing**
- Domain logic is developed test-first.
- **better-sqlite3 throws synchronously.** `expect(db.run(...)).rejects.toThrow()` never fires — the throw happens before a promise exists. Wrap in an async IIFE: `await expect((async () => db.run(...))()).rejects.toThrow()`.
- **Assert database constraints by behaviour, not by message.** Drizzle wraps driver errors and the `cause` chain is not reliably walkable across Jest sandboxes, which produced a 1-in-10 flake in Phase 2. Assert that the row count did not change, not that a particular string appeared.
- **Render once per test.** RNTL returns a stale tree from the third `render` in one test onward. Use `it.each` for table-driven cases.
- A `View` needs `accessible` for its `accessibilityRole` to be findable by `getByRole`.
- A percentage width is a **string** (`'40%'`), not a number.
- **List cells carry their own spacing.** A container `gap` does not apply between `FlatList` cells — put `marginBottom` on the row. This shipped as a visible bug in Phase 2.
- Prove a regression test is meaningful by temporarily breaking the implementation and confirming the test fails.
- Capture full runs when chasing intermittency: `npx jest --forceExit > run.txt 2>&1`.

**Process**
- **Commit after every task.** Verify with `npm run typecheck && npm run lint && npx jest --forceExit` — chained with `&&`, never `;`, so a failure actually stops the commit.
- On device, MIUI blocks `adb shell input` and Gradle's ddmlib installer. Build with Gradle, install with `adb install -r`.

---

## File Structure

**Domain — pure, no imports from db/ or react-native**

| File | Responsibility |
|---|---|
| `src/domain/dayResolver.ts` | **new.** Spec 5.4. Given preloaded plan versions and sessions, decides each date's status. The single function behind the timeline, the calendar, and adherence. |
| `src/domain/adherence.ts` | **new.** Spec 5.5 / §27. Rolls resolved days into workouts and sets, planned against completed. |
| `src/domain/exerciseProgress.ts` | **new.** §24 / §26. One exercise's sessions → working-weight run, best set, best volume, per-session volume. |
| `src/domain/sessionProgress.ts` | unchanged. `sessionVolume` is reused by the day-detail screen. |
| `src/domain/setComparison.ts` | unchanged. `compareSet` / `describeComparison` drive the day-detail ledger. |

**Repositories — the only place SQL appears**

| File | Responsibility |
|---|---|
| `src/repositories/historyRepo.ts` | **new.** `getDayRange`, `getDay`, `getExerciseHistory`. Four queries per range, independent of range length. |
| `src/repositories/sessionRepo.ts` | unchanged. `getSessionForDate` already loads a whole day's tree; day detail reuses it rather than duplicating the query. |

**UI primitives**

| File | Responsibility |
|---|---|
| `src/ui/StatGrid.tsx` | **new.** The design's `.statgrid` / `.stat` pair — a two-column grid of label-over-big-number. Used by the calendar and the exercise history. |

**Feature — `src/features/history/`**

| File | Responsibility |
|---|---|
| `useHistory.ts` | **new.** TanStack Query hooks and the `historyKeys` key factory. |
| `HistoryTimelineScreen.tsx` | **new.** Design 12. Week adherence card + reverse-chronological day cards. |
| `DayCard.tsx` | **new.** One timeline row, rendering each of the six statuses the resolver can return. |
| `CalendarScreen.tsx` | **new.** Design 13. Month grid, legend, month statgrid. |
| `CalendarGrid.tsx` | **new.** The 7-column cell grid itself, separated so its padding maths is testable without the screen's queries. |
| `DayDetailScreen.tsx` | **new.** Design 14. Per-exercise ledger tables, or the day's status when nothing was recorded. |
| `ExerciseHistoryScreen.tsx` | **new.** Design 15. Working-weight run, best-set stats, session cards. |
| `HistoryScreen.tsx` | **deleted.** The Phase 0 placeholder. |

**Navigation**

| File | Responsibility |
|---|---|
| `src/navigation/HistoryStack.tsx` | **new.** Four screens. |
| `src/navigation/types.ts` | **modified.** Add `HistoryStackParamList`; add `ExerciseHistory` to `ExercisesStackParamList`. |
| `src/navigation/RootNavigator.tsx` | **modified.** The History tab renders `HistoryStack` instead of the placeholder. |
| `src/navigation/ExercisesStack.tsx` | **modified.** Register `ExerciseHistory` so an exercise's progression is reachable from the library too. |

**Tests**

| File | Covers |
|---|---|
| `__tests__/domain/dayResolver.test.ts` | Task 1 |
| `__tests__/domain/adherence.test.ts` | Task 2 |
| `__tests__/domain/exerciseProgress.test.ts` | Task 3 |
| `__tests__/repositories/historyRepo.range.test.ts` | Task 4 |
| `__tests__/repositories/historyRepo.exercise.test.ts` | Task 5 |
| `__tests__/features/history/timeline.test.tsx` | Task 6 |
| `__tests__/features/history/calendar.test.tsx` | Task 7 |
| `__tests__/features/history/dayDetail.test.tsx` | Task 8 |
| `__tests__/features/history/exerciseHistory.test.tsx` | Task 9 |

**No schema change.** Phase 4 adds no tables and no migration. `user_version` stays at 5. That is the point of spec section 12: history is a different *read* over data already recorded.

---

### Task 1: Date arithmetic and the day resolver

Spec 5.4 is the load-bearing function of this phase. Everything else — the timeline, the calendar, adherence — is a different presentation of its output. It is pure: it is *handed* the plan versions and sessions, never allowed to fetch them, which is what makes the batching requirement enforceable one layer up.

**Files:**
- Modify: `src/domain/weekday.ts` (append the date arithmetic; the existing functions are untouched)
- Create: `src/domain/dayResolver.ts`
- Test: `__tests__/domain/weekday.test.ts` (append), `__tests__/domain/dayResolver.test.ts`

**Interfaces:**
- Consumes: `startOfLocalDay`, `weekdayIndex` from `@/domain/weekday`.
- Produces:
  - `addLocalDays(ms: number, days: number): number`
  - `eachLocalDay(from: number, to: number): number[]`
  - `startOfLocalWeek(ms: number): number`
  - `startOfLocalMonth(ms: number): number`
  - `endOfLocalMonth(ms: number): number`
  - `type DayStatus = 'completed' | 'partial' | 'missed' | 'rest' | 'upcoming' | 'no_plan'`
  - `type ResolverDay`, `type VersionSpan`, `type ResolverSession`, `type ResolverContext`, `type ResolvedDay`
  - `resolveDay(date: number, ctx: ResolverContext): ResolvedDay`
  - `resolveDays(from: number, to: number, ctx: ResolverContext): ResolvedDay[]`

- [ ] **Step 1: Write the failing date-arithmetic tests**

Append to `__tests__/domain/weekday.test.ts`:

```ts
describe('date arithmetic', () => {
  // August 2026 begins on a Saturday, so the 17th is a Monday. Every date in
  // this phase's tests is anchored to that month for exactly that reason.
  const AUG = (day: number) => new Date(2026, 7, day).getTime();

  it('steps forward and backward by whole local days', () => {
    expect(addLocalDays(AUG(17), 3)).toBe(AUG(20));
    expect(addLocalDays(AUG(17), -3)).toBe(AUG(14));
    expect(addLocalDays(AUG(31), 1)).toBe(new Date(2026, 8, 1).getTime());
  });

  it('normalises to midnight before stepping', () => {
    const middayMonday = new Date(2026, 7, 17, 13, 45).getTime();
    expect(addLocalDays(middayMonday, 1)).toBe(AUG(18));
  });

  it('enumerates an inclusive range', () => {
    expect(eachLocalDay(AUG(17), AUG(20))).toEqual([
      AUG(17), AUG(18), AUG(19), AUG(20),
    ]);
  });

  it('enumerates a single day when both ends are the same', () => {
    expect(eachLocalDay(AUG(17), AUG(17))).toEqual([AUG(17)]);
  });

  it('returns nothing when the range runs backwards', () => {
    expect(eachLocalDay(AUG(20), AUG(17))).toEqual([]);
  });

  it('finds the Monday that starts the week', () => {
    expect(startOfLocalWeek(AUG(17))).toBe(AUG(17)); // a Monday
    expect(startOfLocalWeek(AUG(23))).toBe(AUG(17)); // the Sunday after it
    expect(startOfLocalWeek(AUG(1))).toBe(new Date(2026, 6, 27).getTime());
  });

  it('finds the first and last day of the month', () => {
    expect(startOfLocalMonth(AUG(17))).toBe(AUG(1));
    expect(endOfLocalMonth(AUG(17))).toBe(AUG(31));
    // February 2028 is a leap year — the one month worth checking.
    const feb = new Date(2028, 1, 10).getTime();
    expect(endOfLocalMonth(feb)).toBe(new Date(2028, 1, 29).getTime());
  });
});
```

Add `addLocalDays`, `eachLocalDay`, `startOfLocalWeek`, `startOfLocalMonth`, `endOfLocalMonth` to that file's existing import from `@/domain/weekday`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest __tests__/domain/weekday.test.ts --forceExit`
Expected: FAIL — `addLocalDays is not a function`.

- [ ] **Step 3: Append the date arithmetic**

Append to `src/domain/weekday.ts`:

```ts
/**
 * Steps whole local days, via the calendar rather than by adding 86,400,000ms.
 *
 * The millisecond version is wrong across a daylight-saving boundary — it
 * lands at 23:00 or 01:00 and `startOfLocalDay` then snaps it to the wrong
 * date. India has no DST, but a history view that quietly loses a day for
 * anyone who travels is not worth the two saved lines.
 */
export function addLocalDays(ms: number, days: number): number {
  const d = new Date(startOfLocalDay(ms));
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Every local midnight from `from` to `to`, inclusive of both ends. */
export function eachLocalDay(from: number, to: number): number[] {
  const end = startOfLocalDay(to);
  const days: number[] = [];
  for (let day = startOfLocalDay(from); day <= end; day = addLocalDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/** The Monday of the week containing `ms` — our week starts on Monday (§4). */
export function startOfLocalWeek(ms: number): number {
  return addLocalDays(ms, -weekdayIndex(new Date(ms)));
}

export function startOfLocalMonth(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** Local midnight of the last day of the month containing `ms`. */
export function endOfLocalMonth(ms: number): number {
  const d = new Date(ms);
  // Day 0 of the next month is the last day of this one.
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime();
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest __tests__/domain/weekday.test.ts --forceExit`
Expected: PASS.

- [ ] **Step 5: Write the failing resolver tests**

Create `__tests__/domain/dayResolver.test.ts`:

```ts
import {
  resolveDay,
  resolveDays,
  type ResolverContext,
  type ResolverDay,
  type ResolverSession,
  type VersionSpan,
} from '@/domain/dayResolver';

// August 2026 begins on a Saturday: the 17th is a Monday, the 22nd a Saturday.
const AUG = (day: number) => new Date(2026, 7, day).getTime();
const TODAY = AUG(22);

const trainingDay = (weekday: number, name: string): ResolverDay => ({
  weekday,
  name,
  isRestDay: false,
  exerciseCount: 5,
  setCount: 15,
});

const restDay = (weekday: number): ResolverDay => ({
  weekday,
  name: 'Rest day',
  isRestDay: true,
  exerciseCount: 0,
  setCount: 0,
});

/** Mon–Fri training, Sat–Sun rest, open-ended from the 1st. */
const version = (over: Partial<VersionSpan> = {}): VersionSpan => ({
  id: 'v1',
  effectiveFrom: AUG(1),
  effectiveTo: null,
  days: [
    trainingDay(0, 'Push Day'),
    trainingDay(1, 'Pull Day'),
    trainingDay(2, 'Leg Day'),
    trainingDay(3, 'Push Day'),
    trainingDay(4, 'Pull Day'),
    restDay(5),
    restDay(6),
  ],
  ...over,
});

const session = (over: Partial<ResolverSession> = {}): ResolverSession => ({
  id: 's1',
  date: AUG(21),
  dayName: 'Pull Day',
  status: 'completed',
  exerciseCount: 4,
  plannedSets: 12,
  completedSets: 12,
  skippedSets: 0,
  volume: 4280,
  ...over,
});

const ctx = (over: Partial<ResolverContext> = {}): ResolverContext => ({
  today: TODAY,
  versions: [version()],
  sessions: [],
  ...over,
});

describe('resolveDay', () => {
  it('reports a rest day from the plan version in force', () => {
    const day = resolveDay(AUG(22), ctx()); // a Saturday
    expect(day.status).toBe('rest');
    expect(day.name).toBe('Rest day');
    expect(day.sessionId).toBeNull();
  });

  it('reports a past training day with no session as missed', () => {
    const day = resolveDay(AUG(18), ctx()); // Tuesday, before today
    expect(day.status).toBe('missed');
    expect(day.name).toBe('Pull Day');
    // The plan still says what was owed, which is what makes it a miss.
    expect(day.plannedSets).toBe(15);
    expect(day.exerciseCount).toBe(5);
    expect(day.completedSets).toBe(0);
  });

  it('reports a future training day as upcoming, never missed', () => {
    const day = resolveDay(AUG(24), ctx()); // next Monday
    expect(day.status).toBe('upcoming');
    expect(day.name).toBe('Push Day');
  });

  it('treats today with nothing started as upcoming', () => {
    const monday = ctx({today: AUG(17)});
    expect(resolveDay(AUG(17), monday).status).toBe('upcoming');
  });

  it('reports no plan when no version covers the date', () => {
    const day = resolveDay(new Date(2026, 6, 15).getTime(), ctx());
    expect(day.status).toBe('no_plan');
    expect(day.name).toBeNull();
  });

  it('reports no plan for a day that was never configured', () => {
    const unconfigured = version({
      days: [
        {weekday: 0, name: 'Monday', isRestDay: false, exerciseCount: 0, setCount: 0},
      ],
    });
    const day = resolveDay(AUG(17), ctx({versions: [unconfigured]}));
    // Not "missed": an empty day that was never marked as rest asked nothing
    // of you, and reporting it as a failure would be a lie.
    expect(day.status).toBe('no_plan');
  });
});

describe('resolveDay with a session', () => {
  it('reports a finished session as completed and carries its figures', () => {
    const day = resolveDay(AUG(21), ctx({sessions: [session()]}));
    expect(day.status).toBe('completed');
    expect(day.sessionId).toBe('s1');
    expect(day.completedSets).toBe(12);
    expect(day.volume).toBe(4280);
  });

  it('prefers the session name over the plan, so a rename cannot rewrite it', () => {
    const day = resolveDay(
      AUG(21),
      ctx({sessions: [session({dayName: 'Pull Day (old name)'})]}),
    );
    expect(day.name).toBe('Pull Day (old name)');
  });

  it.each([
    ['abandoned', 3, 'partial'],
    ['abandoned', 0, 'missed'],
    ['in_progress', 3, 'partial'],
    ['completed', 0, 'completed'],
  ] as const)(
    'maps a %s session with %i completed sets to %s',
    (status, completedSets, expected) => {
      const day = resolveDay(
        AUG(21),
        ctx({sessions: [session({status, completedSets})]}),
      );
      expect(day.status).toBe(expected);
    },
  );

  it('reports an untouched in-progress session from a past day as missed', () => {
    const day = resolveDay(
      AUG(21),
      ctx({sessions: [session({status: 'in_progress', completedSets: 0})]}),
    );
    expect(day.status).toBe('missed');
  });

  it('resolves a session even on a day the plan calls a rest day', () => {
    // Training on a rest day is a real thing people do, and history must
    // record what happened rather than what was scheduled.
    const day = resolveDay(
      AUG(22),
      ctx({sessions: [session({date: AUG(22), dayName: 'Extra session'})]}),
    );
    expect(day.status).toBe('completed');
    expect(day.name).toBe('Extra session');
  });
});

describe('resolveDay across plan versions', () => {
  // The invariant of this whole phase: what a past day *was* is decided by the
  // version that was in force then, not the one that is in force now.
  const oldVersion = version({
    id: 'v1',
    effectiveFrom: AUG(1),
    effectiveTo: AUG(19),
    days: [
      trainingDay(0, 'Push Day'),
      restDay(1), restDay(2), restDay(3), restDay(4), restDay(5), restDay(6),
    ],
  });
  const newVersion = version({
    id: 'v2',
    effectiveFrom: AUG(19),
    effectiveTo: null,
    days: [
      restDay(0),
      trainingDay(1, 'Upper Day'),
      restDay(2), restDay(3), restDay(4), restDay(5), restDay(6),
    ],
  });
  const both = ctx({versions: [oldVersion, newVersion]});

  it('resolves a date before the fork through the old version', () => {
    const day = resolveDay(AUG(17), both); // Monday, old version trained
    expect(day.status).toBe('missed');
    expect(day.name).toBe('Push Day');
  });

  it('resolves a date after the fork through the new version', () => {
    const day = resolveDay(AUG(24), both); // Monday, new version rests
    expect(day.status).toBe('rest');
  });

  it('treats effective_to as exclusive, so the fork date belongs to the successor', () => {
    // The weekday that moved is what proves which version answered. Tuesday
    // rested under the old version and trains under the new one.
    expect(resolveDay(AUG(18), both).status).toBe('rest'); // old: Tue rested
    expect(resolveDay(AUG(25), both).status).toBe('missed'); // new: Tue trains
    expect(resolveDay(AUG(25), both).name).toBe('Upper Day');
    // The 19th is the boundary itself, and belongs to the new version.
    expect(resolveDay(AUG(19), both).status).toBe('rest');
  });
});

describe('resolveDays', () => {
  it('returns one entry per day, oldest first', () => {
    const days = resolveDays(AUG(17), AUG(23), ctx());
    expect(days).toHaveLength(7);
    expect(days.map(d => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(days[0]!.date).toBe(AUG(17));
  });

  it('does not care how many sessions it was handed', () => {
    const days = resolveDays(
      AUG(20),
      AUG(22),
      ctx({sessions: [session({date: AUG(21)})]}),
    );
    expect(days.map(d => d.status)).toEqual(['missed', 'completed', 'rest']);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx jest __tests__/domain/dayResolver.test.ts --forceExit`
Expected: FAIL — cannot resolve `@/domain/dayResolver`.

- [ ] **Step 7: Write the resolver**

Create `src/domain/dayResolver.ts`:

```ts
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
```

- [ ] **Step 8: Run both test files and watch them pass**

Run: `npx jest __tests__/domain --forceExit`
Expected: PASS.

- [ ] **Step 9: Prove the version boundary test is meaningful**

Temporarily change `date < v.effectiveTo` to `date <= v.effectiveTo` in `versionFor`. Run `npx jest __tests__/domain/dayResolver.test.ts --forceExit` and confirm the boundary test fails. Restore the strict comparison.

- [ ] **Step 10: Commit**

```bash
npm run typecheck && npm run lint && npx jest --forceExit
git add src/domain/weekday.ts src/domain/dayResolver.ts __tests__/domain/weekday.test.ts __tests__/domain/dayResolver.test.ts
git commit -m "feat: resolve what each past day was, through the plan version in force then"
```

---

### Task 2: Adherence

§27 asks for planned workouts, completed, missed, partial, rest days, completion percentage, and planned sets against completed sets. Spec 5.5 adds the rule that makes the number honest: unplanned work counts in neither half.

One judgement call is written into this function and must not be quietly reversed. **A training day that has not happened yet is not a workout you missed.** Adherence therefore counts only days that have come due — completed, partial, or missed — so that on a Wednesday the week reads "2 of 2", not "2 of 5".

**Files:**
- Create: `src/domain/adherence.ts`
- Test: `__tests__/domain/adherence.test.ts`

**Interfaces:**
- Consumes: `ResolvedDay` from `@/domain/dayResolver` (Task 1).
- Produces: `type Adherence`, `summarizeAdherence(days: readonly ResolvedDay[]): Adherence`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/domain/adherence.test.ts`:

```ts
import {summarizeAdherence} from '@/domain/adherence';
import type {DayStatus, ResolvedDay} from '@/domain/dayResolver';

const AUG = (day: number) => new Date(2026, 7, day).getTime();

let nextDate = 17;
const day = (status: DayStatus, over: Partial<ResolvedDay> = {}): ResolvedDay => ({
  date: AUG(nextDate++),
  weekday: 0,
  status,
  name: 'Push Day',
  sessionId: status === 'completed' || status === 'partial' ? 's' : null,
  exerciseCount: 5,
  plannedSets: 15,
  completedSets: status === 'completed' ? 15 : 0,
  skippedSets: 0,
  volume: null,
  ...over,
});

beforeEach(() => {
  nextDate = 17;
});

describe('summarizeAdherence', () => {
  it('reports nothing rather than zero percent for an empty range', () => {
    const a = summarizeAdherence([]);
    expect(a.plannedWorkouts).toBe(0);
    expect(a.percent).toBeNull();
  });

  it('counts four of five workouts as eighty percent', () => {
    const a = summarizeAdherence([
      day('completed'),
      day('completed'),
      day('completed'),
      day('completed'),
      day('missed'),
      day('rest'),
      day('rest'),
    ]);
    expect(a.plannedWorkouts).toBe(5);
    expect(a.completedWorkouts).toBe(4);
    expect(a.missedWorkouts).toBe(1);
    expect(a.restDays).toBe(2);
    expect(a.percent).toBe(80);
  });

  it('counts a partial workout separately from a completed one', () => {
    const a = summarizeAdherence([
      day('completed'),
      day('partial', {completedSets: 9}),
    ]);
    expect(a.completedWorkouts).toBe(1);
    expect(a.partialWorkouts).toBe(1);
    // A workout cut short still counted as owed, so it drags the number down.
    expect(a.plannedWorkouts).toBe(2);
    expect(a.percent).toBe(50);
  });

  // The rule that decides whether the number is fair mid-week.
  it('excludes days that have not happened yet from both halves', () => {
    const a = summarizeAdherence([
      day('completed'),
      day('completed'),
      day('upcoming'),
      day('upcoming'),
      day('upcoming'),
    ]);
    expect(a.plannedWorkouts).toBe(2);
    expect(a.upcomingWorkouts).toBe(3);
    expect(a.percent).toBe(100);
    expect(a.plannedSets).toBe(30);
  });

  it('excludes days with no plan entirely', () => {
    const a = summarizeAdherence([day('completed'), day('no_plan', {plannedSets: 0})]);
    expect(a.plannedWorkouts).toBe(1);
    expect(a.percent).toBe(100);
  });

  it('adds up planned and completed sets over the due days only', () => {
    const a = summarizeAdherence([
      day('completed', {plannedSets: 15, completedSets: 15}),
      day('partial', {plannedSets: 12, completedSets: 9, skippedSets: 3}),
      day('missed', {plannedSets: 18, completedSets: 0}),
      day('upcoming', {plannedSets: 15, completedSets: 0}),
    ]);
    expect(a.plannedSets).toBe(45);
    expect(a.completedSets).toBe(24);
    expect(a.skippedSets).toBe(3);
  });

  // Spec 5.5: bonus sets are excluded upstream, in the session aggregate, so
  // the arithmetic here can never produce more than 100%.
  it('never reports more than a hundred percent of the sets planned', () => {
    const a = summarizeAdherence([day('completed', {plannedSets: 15, completedSets: 15})]);
    expect(a.setPercent).toBe(100);
  });

  it('reports no set percentage when nothing was planned', () => {
    const a = summarizeAdherence([day('rest', {plannedSets: 0})]);
    expect(a.setPercent).toBeNull();
  });

  it('totals volume across the range, treating an unmeasured day as zero', () => {
    const a = summarizeAdherence([
      day('completed', {volume: 4280}),
      day('completed', {volume: null}),
      day('missed'),
    ]);
    expect(a.volume).toBe(4280);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest __tests__/domain/adherence.test.ts --forceExit`
Expected: FAIL — cannot resolve `@/domain/adherence`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/adherence.ts`:

```ts
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
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest __tests__/domain/adherence.test.ts --forceExit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint && npx jest --forceExit
git add src/domain/adherence.ts __tests__/domain/adherence.test.ts
git commit -m "feat: roll resolved days into workout and set adherence"
```

---

### Task 3: Exercise progression

§24 wants one exercise's prior sessions, newest first. §26 wants volume shown there. Design 15 turns both into three things: a working-weight run (`25.0 → 27.5 → 30.0 → **32.5**`), a best-set and best-volume pair, and a card per session with its sets on one mono line.

All three are derivations over plain data, so they belong in `domain/`, not in the repository that fetches the rows.

**Files:**
- Create: `src/domain/exerciseProgress.ts`
- Test: `__tests__/domain/exerciseProgress.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type ProgressSetEntry = {reps: number; weight: number | null}`
  - `type ProgressSession = {sessionId: string; date: number; sets: readonly ProgressSetEntry[]}`
  - `type SessionProgress = ProgressSession & {volume: number | null; topWeight: number | null}`
  - `type BestSet = {reps: number; weight: number | null; volume: number | null}`
  - `type ExerciseProgress = {sessions: SessionProgress[]; bestSet: BestSet | null; bestVolume: number | null; workingWeights: number[]}`
  - `summarizeProgress(sessions: readonly ProgressSession[], weightApplicable: boolean, opts?: {runLength?: number}): ExerciseProgress`

- [ ] **Step 1: Write the failing test**

Create `__tests__/domain/exerciseProgress.test.ts`:

```ts
import {summarizeProgress, type ProgressSession} from '@/domain/exerciseProgress';

const AUG = (day: number) => new Date(2026, 7, day).getTime();

/** Newest first, as the repository returns them. */
const HISTORY: ProgressSession[] = [
  {
    sessionId: 's3',
    date: AUG(22),
    sets: [
      {reps: 10, weight: 30},
      {reps: 10, weight: 30},
      {reps: 8, weight: 32.5},
    ],
  },
  {
    sessionId: 's2',
    date: AUG(15),
    sets: [
      {reps: 10, weight: 30},
      {reps: 9, weight: 30},
      {reps: 8, weight: 30},
    ],
  },
  {
    sessionId: 's1',
    date: AUG(8),
    sets: [
      {reps: 10, weight: 25},
      {reps: 10, weight: 25},
      {reps: 10, weight: 25},
    ],
  },
];

describe('summarizeProgress', () => {
  it('returns empty figures for an exercise never performed', () => {
    const p = summarizeProgress([], true);
    expect(p.sessions).toEqual([]);
    expect(p.bestSet).toBeNull();
    expect(p.bestVolume).toBeNull();
    expect(p.workingWeights).toEqual([]);
  });

  it('computes each session volume and keeps the order it was given', () => {
    const p = summarizeProgress(HISTORY, true);
    expect(p.sessions.map(s => s.sessionId)).toEqual(['s3', 's2', 's1']);
    expect(p.sessions.map(s => s.volume)).toEqual([860, 810, 750]);
  });

  it('reports the heaviest weight touched in each session', () => {
    const p = summarizeProgress(HISTORY, true);
    expect(p.sessions.map(s => s.topWeight)).toEqual([32.5, 30, 25]);
  });

  it('reports the best volume across every session', () => {
    expect(summarizeProgress(HISTORY, true).bestVolume).toBe(860);
  });

  it('picks the best set by volume, not by weight alone', () => {
    const p = summarizeProgress(HISTORY, true);
    // 30 x 10 = 300 beats 32.5 x 8 = 260, even though 32.5 is heavier.
    expect(p.bestSet).toEqual({reps: 10, weight: 30, volume: 300});
  });

  it('breaks a tie in favour of the more recent session', () => {
    const tied: ProgressSession[] = [
      {sessionId: 'new', date: AUG(22), sets: [{reps: 10, weight: 30}]},
      {sessionId: 'old', date: AUG(15), sets: [{reps: 10, weight: 30}]},
    ];
    const p = summarizeProgress(tied, true);
    expect(p.bestSet).toEqual({reps: 10, weight: 30, volume: 300});
    expect(p.sessions[0]!.sessionId).toBe('new');
  });

  // §26: for a movement that carries no weight, volume is omitted rather than
  // reported as zero, and reps decide the best set instead.
  it('omits volume entirely for a bodyweight exercise', () => {
    const bodyweight: ProgressSession[] = [
      {sessionId: 'b2', date: AUG(22), sets: [{reps: 12, weight: null}]},
      {sessionId: 'b1', date: AUG(15), sets: [{reps: 15, weight: null}]},
    ];
    const p = summarizeProgress(bodyweight, false);
    expect(p.sessions.map(s => s.volume)).toEqual([null, null]);
    expect(p.bestVolume).toBeNull();
    expect(p.bestSet).toEqual({reps: 15, weight: null, volume: null});
    expect(p.workingWeights).toEqual([]);
  });

  it('reads the working weight run oldest to newest', () => {
    expect(summarizeProgress(HISTORY, true).workingWeights).toEqual([25, 30, 32.5]);
  });

  it('collapses a weight held across several sessions into one step', () => {
    const plateau: ProgressSession[] = [
      {sessionId: 'e', date: AUG(22), sets: [{reps: 8, weight: 32.5}]},
      {sessionId: 'd', date: AUG(21), sets: [{reps: 10, weight: 30}]},
      {sessionId: 'c', date: AUG(20), sets: [{reps: 10, weight: 30}]},
      {sessionId: 'b', date: AUG(19), sets: [{reps: 10, weight: 30}]},
      {sessionId: 'a', date: AUG(18), sets: [{reps: 10, weight: 27.5}]},
    ];
    expect(summarizeProgress(plateau, true).workingWeights).toEqual([27.5, 30, 32.5]);
  });

  it('keeps only the most recent steps of the run', () => {
    const long: ProgressSession[] = [40, 37.5, 35, 32.5, 30, 27.5, 25].map(
      (weight, i) => ({
        sessionId: `s${i}`,
        date: AUG(22 - i),
        sets: [{reps: 10, weight}],
      }),
    );
    // The design draws four steps; the run is a sentence, not a table.
    expect(summarizeProgress(long, true).workingWeights).toEqual([32.5, 35, 37.5, 40]);
    expect(summarizeProgress(long, true, {runLength: 2}).workingWeights).toEqual([37.5, 40]);
  });

  it('ignores a session with no weight recorded when building the run', () => {
    const patchy: ProgressSession[] = [
      {sessionId: 'b', date: AUG(22), sets: [{reps: 10, weight: 30}]},
      {sessionId: 'a', date: AUG(15), sets: [{reps: 10, weight: null}]},
    ];
    const p = summarizeProgress(patchy, true);
    expect(p.sessions[1]!.topWeight).toBeNull();
    expect(p.workingWeights).toEqual([30]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest __tests__/domain/exerciseProgress.test.ts --forceExit`
Expected: FAIL — cannot resolve `@/domain/exerciseProgress`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/exerciseProgress.ts`:

```ts
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
    if (session.volume !== null && (bestVolume === null || session.volume > bestVolume)) {
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
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest __tests__/domain/exerciseProgress.test.ts --forceExit`
Expected: PASS.

- [ ] **Step 5: Prove the run tests are meaningful**

Two temporary breaks, each restored before moving on:

1. Remove `.slice(-runLength)` from the return. Run the test file; "keeps only the most recent steps of the run" must fail.
2. Remove the `if (workingWeights[workingWeights.length - 1] !== top)` guard so every session pushes a step. Run the test file; "collapses a weight held across several sessions into one step" must fail.

Restore both and confirm the file is green.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint && npx jest --forceExit
git add src/domain/exerciseProgress.ts __tests__/domain/exerciseProgress.test.ts
git commit -m "feat: derive the working weight run and best set from an exercise history"
```

---

### Task 4: `historyRepo` — the batched day range

This is the task the spec singles out: *"Implementations must load overlapping plan versions once and in-range sessions once, then resolve in memory — two queries per range, regardless of range length. Per-date querying is a defect."*

Four queries are used rather than two, because the counts each half needs are aggregates and doing them in memory would mean fetching every planned set and every performed set in the range. The **requirement that actually matters is that the number is constant** — a 365-day range issues exactly the same four queries as a one-day range — and Step 5 asserts that directly rather than trusting it.

**Files:**
- Modify: `src/domain/weekday.ts` (add `weekdayName`)
- Create: `src/repositories/historyRepo.ts`
- Test: `__tests__/domain/weekday.test.ts` (append one test), `__tests__/repositories/historyRepo.range.test.ts`

**Interfaces:**
- Consumes: `resolveDay`, `resolveDays`, and every type from `@/domain/dayResolver` (Task 1); `AppDatabase` from `@/db/types`; the schema tables from `@/db/schema`.
- Produces:
  - `weekdayName(weekday: number): string`
  - `type DayRange = {from: number; to: number}`
  - `getDayRange(db: AppDatabase, range: DayRange, opts?: {now?: number}): Promise<ResolvedDay[]>`
  - `getDay(db: AppDatabase, date: number, opts?: {now?: number}): Promise<ResolvedDay>`

- [ ] **Step 1: Add `weekdayName`**

Append one test to `__tests__/domain/weekday.test.ts`:

```ts
describe('weekdayName', () => {
  it('names each weekday, Monday first', () => {
    expect(weekdayName(0)).toBe('Monday');
    expect(weekdayName(6)).toBe('Sunday');
  });

  it('returns an empty string rather than undefined for a bad index', () => {
    expect(weekdayName(9)).toBe('');
  });
});
```

Append to `src/domain/weekday.ts`:

```ts
/**
 * The weekday's own name, for a day that has not been given a custom one.
 *
 * Indexing `WEEKDAY_NAMES` directly yields `string | undefined` under
 * `noUncheckedIndexedAccess`, and every caller then either asserts it away or
 * invents its own fallback. One narrowing, in one place.
 */
export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? '';
}
```

Run: `npx jest __tests__/domain/weekday.test.ts --forceExit` — PASS.

- [ ] **Step 2: Write the failing repository test**

Create `__tests__/repositories/historyRepo.range.test.ts`:

```ts
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {
  addExercises,
  renameDay,
  setRestDay,
  setTargets,
} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  skipSet,
  addSet,
  finishWorkout,
  getSessionForDate,
} from '@/repositories/sessionRepo';
import {getDay, getDayRange} from '@/repositories/historyRepo';
import {createTestDb} from '../helpers/testDb';

// August 2026 begins on a Saturday: the 10th, 17th and 24th are Mondays.
const AUG = (day: number) => new Date(2026, 7, day).getTime();
const AUG_AT = (day: number, hour: number) =>
  new Date(2026, 7, day, hour).getTime();

describe('getDayRange', () => {
  let ctx: ReturnType<typeof createTestDb>;

  const dayAt = (days: Awaited<ReturnType<typeof getDayRange>>, date: number) =>
    days.find(d => d.date === date);

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('pushup','Push-up','chest','[]','body only','strength',0,0,0)`,
    );
    // A plan that starts on Monday the 10th: Monday trains, Tuesday rests,
    // every other weekday is left unconfigured.
    await createPlan(ctx.db, {now: AUG(10)});
    await editPlan(
      ctx.db,
      d =>
        setTargets(
          setRestDay(addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench']), 1, true),
          0,
          0,
          [
            {targetReps: 10, targetWeight: 30},
            {targetReps: 10, targetWeight: 30},
            {targetReps: 10, targetWeight: 30},
          ],
        ),
      AUG(10),
    );
  });

  afterEach(() => ctx.close());

  it('returns one resolved day per date in the range, oldest first', async () => {
    const days = await getDayRange(ctx.db, {from: AUG(10), to: AUG(16)}, {now: AUG(24)});
    expect(days).toHaveLength(7);
    expect(days.map(d => d.date)).toEqual([10, 11, 12, 13, 14, 15, 16].map(AUG));
  });

  it('reads rest days and unconfigured days out of the plan', async () => {
    const days = await getDayRange(ctx.db, {from: AUG(10), to: AUG(16)}, {now: AUG(24)});
    expect(dayAt(days, AUG(11))!.status).toBe('rest');
    // Wednesday was never configured, so nothing was owed.
    expect(dayAt(days, AUG(12))!.status).toBe('no_plan');
  });

  it('reports a past training day with no session as missed, with what was owed', async () => {
    const days = await getDayRange(ctx.db, {from: AUG(10), to: AUG(16)}, {now: AUG(24)});
    const monday = dayAt(days, AUG(10))!;
    expect(monday.status).toBe('missed');
    expect(monday.name).toBe('Push Day');
    expect(monday.exerciseCount).toBe(1);
    expect(monday.plannedSets).toBe(3);
  });

  it('carries a finished session into the range with its figures', async () => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    await finishWorkout(ctx.db, session.id);

    const days = await getDayRange(ctx.db, {from: AUG(17), to: AUG(17)}, {now: AUG(24)});
    const monday = days[0]!;
    expect(monday.status).toBe('completed');
    expect(monday.sessionId).toBe(session.id);
    expect(monday.name).toBe('Push Day');
    expect(monday.exerciseCount).toBe(1);
    expect(monday.plannedSets).toBe(3);
    expect(monday.completedSets).toBe(3);
    expect(monday.volume).toBe(900);
  });

  it('reports a session that was cut short as partial', async () => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    const sets = session.exercises[0]!.sets;
    await completeSet(ctx.db, sets[0]!.id, {actualReps: 10, actualWeight: 30});
    await skipSet(ctx.db, sets[1]!.id);
    await skipSet(ctx.db, sets[2]!.id);
    // Left in progress, then rolled over — the shape a real abandoned day has.
    await ctx.db.run(
      sql`UPDATE workout_sessions SET status = 'abandoned' WHERE id = ${session.id}`,
    );

    const day = await getDay(ctx.db, AUG(17), {now: AUG(24)});
    expect(day.status).toBe('partial');
    expect(day.completedSets).toBe(1);
    expect(day.skippedSets).toBe(2);
  });

  // Spec 5.5: bonus work is real training, but it never had a target, so it
  // cannot be allowed to inflate the plan it was never part of.
  it('excludes bonus sets from both halves of the set count but not from volume', async () => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    await addSet(ctx.db, session.exercises[0]!.id);
    const withBonus = await getSessionForDate(ctx.db, AUG(17));
    const bonus = withBonus!.exercises[0]!.sets.find(s => s.isUnplanned)!;
    await completeSet(ctx.db, bonus.id, {actualReps: 8, actualWeight: 30});
    await finishWorkout(ctx.db, session.id);

    const day = await getDay(ctx.db, AUG(17), {now: AUG(24)});
    expect(day.plannedSets).toBe(3);
    expect(day.completedSets).toBe(3);
    // 3 x 10 x 30 planned, plus 8 x 30 of bonus work that was genuinely lifted.
    expect(day.volume).toBe(1140);
  });

  it('omits volume rather than reporting zero for a bodyweight-only day', async () => {
    await editPlan(
      ctx.db,
      d => addExercises(setRestDay(d, 2, false), 2, ['pushup']),
      AUG(12),
    );
    const session = await startWorkout(ctx.db, {now: AUG_AT(19, 9)});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 12, actualWeight: null});
    }
    await finishWorkout(ctx.db, session.id);

    const day = await getDay(ctx.db, AUG(19), {now: AUG(24)});
    expect(day.status).toBe('completed');
    expect(day.volume).toBeNull();
  });
});

// The gate of this whole phase, expressed as a test.
describe('getDayRange after the plan is edited', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    await createPlan(ctx.db, {now: AUG(10)});
    await editPlan(
      ctx.db,
      d => addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench']),
      AUG(10),
    );
  });

  afterEach(() => ctx.close());

  it('leaves past days resolving through the version that was in force then', async () => {
    // Monday the 19th: turn Monday into a rest day. Editing on a later day
    // forks a new version rather than mutating the old one.
    await editPlan(ctx.db, d => setRestDay(d, 0, true), AUG(19));

    const days = await getDayRange(ctx.db, {from: AUG(10), to: AUG(24)}, {now: AUG(26)});
    const at = (date: number) => days.find(d => d.date === date)!;

    // Before the fork, Monday was a training day, and still is in history.
    expect(at(AUG(10)).status).toBe('missed');
    expect(at(AUG(10)).name).toBe('Push Day');
    expect(at(AUG(17)).status).toBe('missed');
    // After the fork it is a rest day.
    expect(at(AUG(24)).status).toBe('rest');
  });

  it('keeps a finished workout untouched when the day is later renamed', async () => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    await finishWorkout(ctx.db, session.id);

    const before = await getDay(ctx.db, AUG(17), {now: AUG(26)});
    await editPlan(ctx.db, d => renameDay(d, 0, 'Chest Day'), AUG(19));
    const after = await getDay(ctx.db, AUG(17), {now: AUG(26)});

    expect(before.name).toBe('Push Day');
    expect(after).toEqual(before);
  });
});

describe('getDayRange query batching', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    await createPlan(ctx.db, {now: AUG(10)});
    await editPlan(
      ctx.db,
      d => addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench']),
      AUG(10),
    );
    // Three Mondays of real sessions, so both ranges below have sessions to
    // aggregate and the comparison is like for like.
    for (const monday of [AUG(10), AUG(17), AUG(24)]) {
      const session = await startWorkout(ctx.db, {now: monday + 9 * 3600_000});
      await completeSet(ctx.db, session.exercises[0]!.sets[0]!.id, {
        actualReps: 10,
        actualWeight: 30,
      });
      await finishWorkout(ctx.db, session.id);
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    ctx.close();
  });

  // Spec 5.4: "Per-date querying is a defect." This is that sentence, asserted.
  it('issues the same number of queries for one day as for a whole year', async () => {
    const spy = jest.spyOn(ctx.db, 'select');

    await getDayRange(ctx.db, {from: AUG(17), to: AUG(17)}, {now: AUG(31)});
    expect(spy).toHaveBeenCalledTimes(4);

    spy.mockClear();
    await getDayRange(
      ctx.db,
      {from: new Date(2026, 0, 1).getTime(), to: new Date(2026, 11, 31).getTime()},
      {now: AUG(31)},
    );
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('still resolves the whole year correctly', async () => {
    const days = await getDayRange(
      ctx.db,
      {from: new Date(2026, 0, 1).getTime(), to: new Date(2026, 11, 31).getTime()},
      {now: AUG(31)},
    );
    expect(days).toHaveLength(365);
    expect(days.filter(d => d.status === 'completed')).toHaveLength(3);
    // Before the plan existed there was nothing to adhere to.
    expect(days[0]!.status).toBe('no_plan');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx jest __tests__/repositories/historyRepo.range.test.ts --forceExit`
Expected: FAIL — cannot resolve `@/repositories/historyRepo`.

- [ ] **Step 4: Write the repository**

Create `src/repositories/historyRepo.ts`:

```ts
import {and, asc, desc, eq, gt, gte, inArray, isNull, lte, or, sql} from 'drizzle-orm';
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
  const ctx = await loadContext(db, {from: day, to: day}, opts.now ?? Date.now());
  return resolveDay(day, ctx);
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx jest __tests__/repositories/historyRepo.range.test.ts --forceExit`
Expected: PASS.

If the query-count test reports 3 rather than 4 for the one-day range, a guard has short-circuited — check that the fixture really has a session on the 17th.

- [ ] **Step 6: Prove the batching test is meaningful**

Temporarily replace `getDayRange` with a per-date implementation (add `eachLocalDay` to the `@/domain/weekday` import while you do):

```ts
export async function getDayRange(db, range, opts = {}) {
  const days = [];
  for (const day of eachLocalDay(range.from, range.to)) {
    days.push(await getDay(db, day, opts));
  }
  return days;
}
```

Run the file. "issues the same number of queries for one day as for a whole year" must fail with 1,460 calls against 4. Restore the batched version.

- [ ] **Step 7: Commit**

```bash
npm run typecheck && npm run lint && npx jest --forceExit
git add src/domain/weekday.ts src/repositories/historyRepo.ts __tests__/domain/weekday.test.ts __tests__/repositories/historyRepo.range.test.ts
git commit -m "feat: read a whole date range of history in a fixed number of queries"
```

---

### Task 5: `historyRepo` — one exercise's history

§24 in three queries: the exercise, the sessions it appears in (newest first), and the completed sets in those sessions. The derivations were built in Task 3, so this task only fetches and groups.

**Files:**
- Modify: `src/repositories/historyRepo.ts`
- Test: `__tests__/repositories/historyRepo.exercise.test.ts`

**Interfaces:**
- Consumes: `summarizeProgress`, `ProgressSession`, `ExerciseProgress` from `@/domain/exerciseProgress` (Task 3).
- Produces:
  - `type ExerciseHistory = {exerciseId: string; name: string; weightApplicable: boolean; progress: ExerciseProgress}`
  - `getExerciseHistory(db: AppDatabase, exerciseId: string, opts?: {limit?: number}): Promise<ExerciseHistory | undefined>`

- [ ] **Step 1: Write the failing test**

Create `__tests__/repositories/historyRepo.exercise.test.ts`:

```ts
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setTargets} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  skipSet,
  addSet,
  finishWorkout,
  getSessionForDate,
} from '@/repositories/sessionRepo';
import {getExerciseHistory} from '@/repositories/historyRepo';
import {createTestDb} from '../helpers/testDb';

// The 10th, 17th and 24th of August 2026 are all Mondays.
const MONDAYS = [10, 17, 24];
const AUG_AT = (day: number, hour: number) =>
  new Date(2026, 7, day, hour).getTime();

describe('getExerciseHistory', () => {
  let ctx: ReturnType<typeof createTestDb>;

  /** Trains the Monday plan, completing every set at the given weight. */
  const train = async (day: number, weight: number, reps = 10) => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(day, 9)});
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        await completeSet(ctx.db, set.id, {
          actualReps: reps,
          actualWeight: exercise.weightApplicable ? weight : null,
        });
      }
    }
    await finishWorkout(ctx.db, session.id);
    return session;
  };

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('press','Machine Chest Press','chest','[]','machine','strength',1,0,0),
                 ('pushup','Push-up','chest','[]','body only','strength',0,0,0)`,
    );
    await createPlan(ctx.db, {now: AUG_AT(10, 6)});
    await editPlan(
      ctx.db,
      d =>
        setTargets(addExercises(renameDay(d, 0, 'Push Day'), 0, ['press']), 0, 0, [
          {targetReps: 10, targetWeight: 30},
          {targetReps: 10, targetWeight: 30},
          {targetReps: 10, targetWeight: 30},
        ]),
      AUG_AT(10, 6),
    );
  });

  afterEach(() => ctx.close());

  it('returns nothing for an exercise that does not exist', async () => {
    expect(await getExerciseHistory(ctx.db, 'nope')).toBeUndefined();
  });

  it('returns an empty history for an exercise never performed', async () => {
    const history = await getExerciseHistory(ctx.db, 'pushup');
    expect(history!.name).toBe('Push-up');
    expect(history!.weightApplicable).toBe(false);
    expect(history!.progress.sessions).toEqual([]);
    expect(history!.progress.bestSet).toBeNull();
  });

  it('returns the sessions newest first with their sets and volume', async () => {
    await train(10, 25);
    await train(17, 27.5);
    await train(24, 30);

    const history = await getExerciseHistory(ctx.db, 'press');
    expect(history!.name).toBe('Machine Chest Press');
    expect(history!.progress.sessions.map(s => s.volume)).toEqual([900, 825, 750]);
    expect(history!.progress.sessions[0]!.sets).toEqual([
      {reps: 10, weight: 30},
      {reps: 10, weight: 30},
      {reps: 10, weight: 30},
    ]);
  });

  it('builds the working weight run and the best figures', async () => {
    await train(10, 25);
    await train(17, 27.5);
    await train(24, 30);

    const {progress} = (await getExerciseHistory(ctx.db, 'press'))!;
    expect(progress.workingWeights).toEqual([25, 27.5, 30]);
    expect(progress.bestSet).toEqual({reps: 10, weight: 30, volume: 300});
    expect(progress.bestVolume).toBe(900);
  });

  it('leaves out sets that were skipped or never recorded', async () => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    const sets = session.exercises[0]!.sets;
    await completeSet(ctx.db, sets[0]!.id, {actualReps: 10, actualWeight: 30});
    await skipSet(ctx.db, sets[1]!.id);
    await finishWorkout(ctx.db, session.id);

    const {progress} = (await getExerciseHistory(ctx.db, 'press'))!;
    // One completed set; the skipped one and the one finish marked skipped are
    // not performances and have nothing to plot.
    expect(progress.sessions).toHaveLength(1);
    expect(progress.sessions[0]!.sets).toEqual([{reps: 10, weight: 30}]);
  });

  it('leaves out a session where the exercise was never performed at all', async () => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    for (const set of session.exercises[0]!.sets) {
      await skipSet(ctx.db, set.id);
    }
    await finishWorkout(ctx.db, session.id);

    const {progress} = (await getExerciseHistory(ctx.db, 'press'))!;
    expect(progress.sessions).toEqual([]);
  });

  // D3: a bonus set is real work. §24 shows what was done, not what was owed.
  it('includes bonus sets', async () => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    await addSet(ctx.db, session.exercises[0]!.id);
    const reloaded = await getSessionForDate(ctx.db, AUG_AT(17, 0));
    const bonus = reloaded!.exercises[0]!.sets.find(s => s.isUnplanned)!;
    await completeSet(ctx.db, bonus.id, {actualReps: 8, actualWeight: 32.5});
    await finishWorkout(ctx.db, session.id);

    const {progress} = (await getExerciseHistory(ctx.db, 'press'))!;
    expect(progress.sessions[0]!.sets).toHaveLength(4);
    expect(progress.sessions[0]!.volume).toBe(1160);
    expect(progress.workingWeights).toEqual([32.5]);
  });

  it('returns at most the requested number of sessions, newest first', async () => {
    for (const [i, day] of MONDAYS.entries()) {
      await train(day, 25 + i * 2.5);
    }
    const {progress} = (await getExerciseHistory(ctx.db, 'press', {limit: 2}))!;
    expect(progress.sessions).toHaveLength(2);
    expect(progress.sessions.map(s => s.volume)).toEqual([900, 825]);
  });

  it('merges an exercise performed twice in one session into one entry', async () => {
    await editPlan(
      ctx.db,
      d => addExercises(d, 0, ['press']),
      AUG_AT(11, 6),
    );
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    expect(session.exercises).toHaveLength(2);
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
      }
    }
    await finishWorkout(ctx.db, session.id);

    const {progress} = (await getExerciseHistory(ctx.db, 'press'))!;
    expect(progress.sessions).toHaveLength(1);
    expect(progress.sessions[0]!.sets).toHaveLength(6);
  });

  it('omits volume for a bodyweight exercise', async () => {
    await editPlan(ctx.db, d => addExercises(d, 0, ['pushup']), AUG_AT(11, 6));
    await train(17, 30, 12);

    const {progress} = (await getExerciseHistory(ctx.db, 'pushup'))!;
    expect(progress.sessions[0]!.volume).toBeNull();
    expect(progress.bestSet).toEqual({reps: 12, weight: null, volume: null});
    expect(progress.workingWeights).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest __tests__/repositories/historyRepo.exercise.test.ts --forceExit`
Expected: FAIL — `getExerciseHistory is not a function`.

- [ ] **Step 3: Write the implementation**

Add to the imports at the top of `src/repositories/historyRepo.ts`:

```ts
import {isNotNull} from 'drizzle-orm';
import {
  summarizeProgress,
  type ExerciseProgress,
  type ProgressSession,
} from '@/domain/exerciseProgress';
```

Append to `src/repositories/historyRepo.ts`:

```ts
export type ExerciseHistory = {
  exerciseId: string;
  name: string;
  weightApplicable: boolean;
  progress: ExerciseProgress;
};

/** Design 15 draws four steps of the working-weight run; a dozen sessions
 *  is plenty to build it from and keeps the screen a single scroll. */
const DEFAULT_SESSION_LIMIT = 12;

/**
 * One exercise's history, newest first (§24, §26).
 *
 * Three queries, none of them per-session. Only *completed* sets are returned:
 * a skipped set is not a performance, and plotting it as one would put a hole
 * in the progression that never happened. Bonus sets are included — they had
 * no target, but they were lifted.
 */
export async function getExerciseHistory(
  db: AppDatabase,
  exerciseId: string,
  opts: {limit?: number} = {},
): Promise<ExerciseHistory | undefined> {
  const limit = opts.limit ?? DEFAULT_SESSION_LIMIT;

  const exerciseRows = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      weightApplicable: exercises.weightApplicable,
    })
    .from(exercises)
    .where(eq(exercises.id, exerciseId))
    .limit(1);

  const exercise = exerciseRows[0];
  if (!exercise) {
    return undefined;
  }

  // Sessions in which this exercise was actually performed. The set filter is
  // in the join rather than applied afterwards so that a session where it was
  // entirely skipped never takes up one of the `limit` slots.
  const sessionRows = await db
    .select({id: workoutSessions.id, date: workoutSessions.date})
    .from(workoutSessions)
    .innerJoin(
      performedExercises,
      eq(performedExercises.workoutSessionId, workoutSessions.id),
    )
    .innerJoin(
      performedSets,
      eq(performedSets.performedExerciseId, performedExercises.id),
    )
    .where(
      and(
        eq(performedExercises.exerciseId, exerciseId),
        eq(performedSets.status, 'completed'),
        isNotNull(performedSets.actualReps),
      ),
    )
    .groupBy(workoutSessions.id)
    .orderBy(desc(workoutSessions.date))
    .limit(limit);

  const sessionIds = sessionRows.map(s => s.id);

  const setRows = sessionIds.length
    ? await db
        .select({
          sessionId: performedExercises.workoutSessionId,
          orderIndex: performedExercises.orderIndex,
          setNumber: performedSets.setNumber,
          reps: performedSets.actualReps,
          weight: performedSets.actualWeight,
        })
        .from(performedSets)
        .innerJoin(
          performedExercises,
          eq(performedExercises.id, performedSets.performedExerciseId),
        )
        .where(
          and(
            eq(performedExercises.exerciseId, exerciseId),
            inArray(performedExercises.workoutSessionId, sessionIds),
            eq(performedSets.status, 'completed'),
            isNotNull(performedSets.actualReps),
          ),
        )
        // The same movement twice in one session is allowed, so order by the
        // position it was performed in before the set number within it.
        .orderBy(asc(performedExercises.orderIndex), asc(performedSets.setNumber))
    : [];

  const setsBySession = new Map<string, {reps: number; weight: number | null}[]>();
  for (const row of setRows) {
    if (row.reps === null) {
      continue;
    }
    const list = setsBySession.get(row.sessionId) ?? [];
    list.push({reps: row.reps, weight: row.weight});
    setsBySession.set(row.sessionId, list);
  }

  const sessions: ProgressSession[] = sessionRows.map(row => ({
    sessionId: row.id,
    date: row.date,
    sets: setsBySession.get(row.id) ?? [],
  }));

  return {
    exerciseId: exercise.id,
    name: exercise.name,
    weightApplicable: exercise.weightApplicable,
    progress: summarizeProgress(sessions, exercise.weightApplicable),
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest __tests__/repositories/historyRepo.exercise.test.ts --forceExit`
Expected: PASS.

- [ ] **Step 5: Prove the skipped-set filter is meaningful**

Temporarily drop `eq(performedSets.status, 'completed')` from the `setRows` where-clause. Run the file; "leaves out sets that were skipped or never recorded" must fail. Restore it.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint && npx jest --forceExit
git add src/repositories/historyRepo.ts __tests__/repositories/historyRepo.exercise.test.ts
git commit -m "feat: read one exercise's progression out of past sessions"
```

---

### Task 6: The History tab — stack, hooks, and the day timeline

Design 12. This task also builds the three shared pieces the rest of the phase needs: an `action` slot on `Screen`, an `IconButton`, and `StatGrid`.

Two invalidation edges are easy to miss and are part of this task: **finishing a workout and editing the plan must both invalidate history**, or the timeline shows yesterday's answer after today's workout.

**Files:**
- Create: `src/domain/dateLabels.ts`
- Create: `src/ui/IconButton.tsx`, `src/ui/StatGrid.tsx`
- Modify: `src/ui/Screen.tsx` (add `action`), `src/ui/Card.tsx` (add `style`)
- Create: `src/features/history/useHistory.ts`, `src/features/history/DayCard.tsx`, `src/features/history/HistoryTimelineScreen.tsx`
- Delete: `src/features/history/HistoryScreen.tsx`
- Create: `src/navigation/HistoryStack.tsx`
- Modify: `src/navigation/types.ts`, `src/navigation/RootNavigator.tsx`
- Modify: `src/features/workout/useSession.ts`, `src/features/plan/usePlan.ts` (invalidate history on write)
- Test: `__tests__/domain/dateLabels.test.ts`, `__tests__/features/history/timeline.test.tsx`

**Interfaces:**
- Consumes: `getDayRange`, `getDay`, `getExerciseHistory` from `@/repositories/historyRepo` (Tasks 4–5); `summarizeAdherence` (Task 2); `ResolvedDay`, `DayStatus` (Task 1); `addLocalDays`, `startOfLocalDay`, `startOfLocalWeek` (Task 1).
- Produces:
  - `MONTH_NAMES`, `formatDayLabel`, `formatLongDate`, `formatShortDate`, `formatMonthTitle`, `formatYear` from `@/domain/dateLabels`
  - `IconButton({glyph, label, onPress})` with `glyph: 'calendar' | 'chevronLeft' | 'chevronRight'`
  - `StatGrid({stats})` with `type Stat = {label: string; value: string}`
  - `historyKeys`, `useDayRangeQuery`, `useDayQuery`, `useExerciseHistoryQuery`
  - `DayCard({day, onPress})`
  - `type HistoryStackParamList = {HistoryTimeline: undefined; HistoryCalendar: undefined; DayDetail: {date: number}; ExerciseHistory: {exerciseId: string}}`

- [ ] **Step 1: Write the failing date-label test**

Create `__tests__/domain/dateLabels.test.ts`:

```ts
import {
  formatDayLabel,
  formatLongDate,
  formatMonthTitle,
  formatShortDate,
  formatYear,
} from '@/domain/dateLabels';

// Friday 21 August 2026.
const FRIDAY = new Date(2026, 7, 21).getTime();

describe('date labels', () => {
  it('labels a timeline row with the abbreviated weekday', () => {
    expect(formatDayLabel(FRIDAY)).toBe('Fri 21 August');
  });

  it('labels a day detail with the full weekday', () => {
    expect(formatLongDate(FRIDAY)).toBe('Friday 21 August');
  });

  it('labels a session card with the date alone', () => {
    expect(formatShortDate(FRIDAY)).toBe('21 August');
  });

  it('names the month and the year separately, as the calendar header does', () => {
    expect(formatMonthTitle(FRIDAY)).toBe('August');
    expect(formatYear(FRIDAY)).toBe('2026');
  });
});
```

- [ ] **Step 2: Write `dateLabels`**

Create `src/domain/dateLabels.ts`:

```ts
import {WEEKDAY_ABBR, weekdayIndex, weekdayName} from './weekday';

/**
 * Dates are written out rather than run through `Intl` or `toLocaleDateString`.
 *
 * Hermes ships without full ICU data, so `toLocaleDateString` silently returns
 * a different string on a device than it does under Jest in Node — which is
 * exactly the class of bug that only shows up after the screenshot is approved.
 */
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const monthOf = (ms: number): string => MONTH_NAMES[new Date(ms).getMonth()] ?? '';

/** "Fri 21 August" — the timeline row. */
export function formatDayLabel(ms: number): string {
  const date = new Date(ms);
  return `${WEEKDAY_ABBR[weekdayIndex(date)] ?? ''} ${date.getDate()} ${monthOf(ms)}`;
}

/** "Friday 21 August" — the day-detail kicker. */
export function formatLongDate(ms: number): string {
  const date = new Date(ms);
  return `${weekdayName(weekdayIndex(date))} ${date.getDate()} ${monthOf(ms)}`;
}

/** "21 August" — an exercise-history session card. */
export function formatShortDate(ms: number): string {
  return `${new Date(ms).getDate()} ${monthOf(ms)}`;
}

export function formatMonthTitle(ms: number): string {
  return monthOf(ms);
}

export function formatYear(ms: number): string {
  return String(new Date(ms).getFullYear());
}
```

Run: `npx jest __tests__/domain/dateLabels.test.ts --forceExit` — PASS.

- [ ] **Step 3: Give `Screen` an action slot and `Card` a style**

In `src/ui/Screen.tsx`, replace the props and the header block:

```tsx
export function Screen({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string;
  eyebrow?: string;
  /** A control aligned to the right of the heading — the design's `.appbar` button. */
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
```

and replace the eyebrow/title pair inside the `ScrollView` with:

```tsx
<View style={styles.header}>
  <View style={styles.headerText}>
    {eyebrow ? (
      <AppText variant="eyebrow" color="muted">
        {eyebrow}
      </AppText>
    ) : null}
    <AppText variant="h1" style={styles.title}>
      {title}
    </AppText>
  </View>
  {action}
</View>
```

Add to its `StyleSheet`:

```ts
header: {flexDirection: 'row', alignItems: 'flex-start', gap: space.md},
headerText: {flex: 1},
```

In `src/ui/Card.tsx`, add `style` to the props and append it last so a caller can override the border:

```tsx
import type {StyleProp, ViewStyle} from 'react-native';

export function Card({
  onPress,
  onLongPress,
  accessibilityHint,
  style: override,
  children,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const {colors} = useTheme();
  const style = [
    styles.card,
    {backgroundColor: colors.surface, borderColor: colors.ruleSoft},
    override,
  ];
```

Run: `npx jest --forceExit` — every existing screen passes nothing new, so the suite must still be green.

- [ ] **Step 4: Add `IconButton` and `StatGrid`**

Create `src/ui/IconButton.tsx`:

```tsx
import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useTheme, radius} from '@/theme';

/** Copied from the design rather than redrawn — `.iconbtn svg` in screens.html. */
const GLYPHS = {
  calendar: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
} as const;

/** The design's `.iconbtn`: a 38px circle with a hairline border. */
export function IconButton({
  glyph,
  label,
  onPress,
}: {
  glyph: keyof typeof GLYPHS;
  /** Spoken name — the glyph carries no text of its own. */
  label: string;
  onPress: () => void;
}) {
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        {
          backgroundColor: pressed ? colors.surface2 : colors.surface,
          borderColor: colors.rule,
        },
      ]}>
      <Svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colors.ink2}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round">
        <Path d={GLYPHS[glyph]} />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

Create `src/ui/StatGrid.tsx`:

```tsx
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme, space, radius} from '@/theme';
import {AppText} from './Text';

export type Stat = {label: string; value: string};

/** The design's `.statgrid`: equal columns of a printed label over a big figure. */
export function StatGrid({stats}: {stats: readonly Stat[]}) {
  const {colors} = useTheme();
  return (
    <View style={styles.grid}>
      {stats.map(stat => (
        <View
          key={stat.label}
          style={[
            styles.stat,
            {backgroundColor: colors.surface, borderColor: colors.ruleSoft},
          ]}>
          <AppText variant="printed" color="muted">
            {stat.label}
          </AppText>
          <AppText variant="inkNum">{stat.value}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {flexDirection: 'row', gap: space.sm},
  stat: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.xs,
  },
});
```

- [ ] **Step 5: Add the query hooks and wire invalidation**

Create `src/features/history/useHistory.ts`:

```ts
import {useQuery} from '@tanstack/react-query';
import {useDatabase} from '@/providers/DatabaseGate';
import {
  getDay,
  getDayRange,
  getExerciseHistory,
  type DayRange,
} from '@/repositories/historyRepo';

export const historyKeys = {
  all: ['history'] as const,
  range: (from: number, to: number) => ['history', 'range', from, to] as const,
  day: (date: number) => ['history', 'day', date] as const,
  exercise: (exerciseId: string) => ['history', 'exercise', exerciseId] as const,
};

export function useDayRangeQuery(range: DayRange) {
  const db = useDatabase();
  return useQuery({
    queryKey: historyKeys.range(range.from, range.to),
    queryFn: () => getDayRange(db, range),
    staleTime: Infinity,
  });
}

export function useDayQuery(date: number) {
  const db = useDatabase();
  return useQuery({
    queryKey: historyKeys.day(date),
    queryFn: () => getDay(db, date),
    staleTime: Infinity,
  });
}

export function useExerciseHistoryQuery(exerciseId: string) {
  const db = useDatabase();
  return useQuery({
    queryKey: historyKeys.exercise(exerciseId),
    // Null rather than undefined: TanStack Query reads undefined as a failed
    // query, which would make a deleted exercise and a database error look
    // identical to the screen.
    queryFn: async () => (await getExerciseHistory(db, exerciseId)) ?? null,
    enabled: exerciseId !== '',
    staleTime: Infinity,
  });
}
```

In `src/features/workout/useSession.ts`, import `historyKeys` and extend the shared mutation's `onSuccess`:

```ts
    onSuccess: () => {
      client.invalidateQueries({queryKey: sessionKeys.all});
      // History is a read over exactly what this just wrote. Without this, the
      // timeline keeps showing the day as missed after the workout is finished.
      client.invalidateQueries({queryKey: historyKeys.all});
    },
```

Do the same in both mutations in `src/features/plan/usePlan.ts` — a plan edit changes which future days count as rest or training:

```ts
    onSuccess: () => {
      client.invalidateQueries({queryKey: planKeys.all});
      client.invalidateQueries({queryKey: historyKeys.all});
    },
```

- [ ] **Step 6: Write the failing timeline test**

Create `__tests__/features/history/timeline.test.tsx`:

```tsx
import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setRestDay} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  finishWorkout,
} from '@/repositories/sessionRepo';
import {addLocalDays, startOfLocalDay, weekdayIndex} from '@/domain/weekday';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {HistoryTimelineScreen} from '@/features/history/HistoryTimelineScreen';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()}),
}));

// Anchored to the real today, so the fixture lands correctly whenever it runs.
const TODAY = startOfLocalDay(Date.now());
const daysAgo = (n: number) => addLocalDays(TODAY, -n);
const weekdayOf = (ms: number) => weekdayIndex(new Date(ms));

describe('HistoryTimelineScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <HistoryTimelineScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockNavigate.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  /** A plan from 35 days ago: one training weekday, one rest weekday. */
  const seedPlan = async () => {
    await createPlan(ctx.db, {now: daysAgo(35)});
    await editPlan(
      ctx.db,
      d =>
        setRestDay(
          addExercises(
            renameDay(d, weekdayOf(daysAgo(7)), 'Push Day'),
            weekdayOf(daysAgo(7)),
            ['bench'],
          ),
          weekdayOf(daysAgo(6)),
          true,
        ),
      daysAgo(35),
    );
  };

  const trainOn = async (date: number) => {
    const session = await startWorkout(ctx.db, {now: date + 9 * 3600_000});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    await finishWorkout(ctx.db, session.id);
    return session;
  };

  it('invites a first workout when nothing has been recorded', async () => {
    const view = renderScreen();
    expect(await view.findByText(/past workouts/i)).toBeTruthy();
  });

  it('shows the week adherence card', async () => {
    await seedPlan();
    const view = renderScreen();
    expect(await view.findByText('Adherence')).toBeTruthy();
  });

  it('lists a finished workout with its name and set count', async () => {
    await seedPlan();
    await trainOn(daysAgo(7));

    const view = renderScreen();
    expect(await view.findByText('Push Day')).toBeTruthy();
    expect(view.getByText(/1 exercise · 3 of 3 sets/)).toBeTruthy();
    expect(view.getByText('Complete')).toBeTruthy();
  });

  it('shows rest days between the workouts', async () => {
    await seedPlan();
    await trainOn(daysAgo(7));

    const view = renderScreen();
    expect(await view.findAllByText('Rest day')).not.toHaveLength(0);
  });

  it('leaves out days that had no plan at all', async () => {
    await seedPlan();
    await trainOn(daysAgo(7));

    const view = renderScreen();
    await view.findByText('Push Day');
    // Only two weekdays were configured, so five of every seven days are not
    // in the list — an unconfigured day asked nothing of you and says nothing.
    expect(view.queryByText('Nothing recorded')).toBeNull();
  });

  it('reveals older days, and their misses, on request', async () => {
    await seedPlan();
    await trainOn(daysAgo(7));

    const view = renderScreen();
    await view.findByText('Push Day');
    // The default window is a fortnight, and the only training day in it was
    // done. Older Mondays were not.
    expect(view.queryByText('Missed')).toBeNull();

    await fireEvent.press(view.getByText(/show earlier/i));
    await waitFor(() => {
      expect(view.getAllByText('Missed').length).toBeGreaterThan(0);
    });
  });

  it('opens the day detail when a recorded day is tapped', async () => {
    await seedPlan();
    await trainOn(daysAgo(7));

    const view = renderScreen();
    await view.findByText('Push Day');
    await fireEvent.press(view.getByText('Push Day'));

    expect(mockNavigate).toHaveBeenCalledWith('DayDetail', {date: daysAgo(7)});
  });

  it('opens the calendar from the heading', async () => {
    await seedPlan();
    const view = renderScreen();
    await view.findByText('Adherence');
    await fireEvent.press(view.getByLabelText(/calendar/i));
    expect(mockNavigate).toHaveBeenCalledWith('HistoryCalendar');
  });
});
```

- [ ] **Step 7: Run it and watch it fail**

Run: `npx jest __tests__/features/history/timeline.test.tsx --forceExit`
Expected: FAIL — cannot resolve `@/features/history/HistoryTimelineScreen`.

- [ ] **Step 8: Write `DayCard`**

Create `src/features/history/DayCard.tsx`:

```tsx
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Card} from '@/ui/Card';
import {Hatch} from '@/ui/Hatch';
import {StatusChip} from '@/ui/StatusChip';
import {AppText} from '@/ui/Text';
import {useTheme, radius, space} from '@/theme';
import {formatDayLabel} from '@/domain/dateLabels';
import type {ResolvedDay} from '@/domain/dayResolver';
import type {ComparisonStatus} from '@/domain/setComparison';

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * The chip on the right of a timeline row.
 *
 * A finished workout with a skipped set says so rather than saying "Complete":
 * the design puts an ochre "1 skipped" there, because the honest headline for
 * that day is the thing that did not happen.
 */
function chipFor(
  day: ResolvedDay,
): {status: ComparisonStatus; label: string} | null {
  switch (day.status) {
    case 'completed':
      return day.skippedSets > 0
        ? {status: 'below', label: `${day.skippedSets} skipped`}
        : {status: 'achieved', label: 'Complete'};
    case 'partial':
      return {status: 'below', label: 'Partial'};
    case 'missed':
      return {status: 'below', label: 'Missed'};
    default:
      return null;
  }
}

/** A missed day names itself in ochre; a rest day recedes into muted. */
function nameColorFor(day: ResolvedDay): 'ink' | 'muted' | 'short' {
  if (day.status === 'rest') {
    return 'muted';
  }
  return day.status === 'missed' ? 'short' : 'ink';
}

function metaFor(day: ResolvedDay): string | null {
  switch (day.status) {
    case 'completed':
    case 'partial':
      return `${plural(day.exerciseCount, 'exercise')} · ${day.completedSets} of ${day.plannedSets} sets`;
    case 'missed':
      return 'Nothing recorded';
    case 'upcoming':
      return `${plural(day.exerciseCount, 'exercise')} · ${plural(day.plannedSets, 'set')}`;
    default:
      return null;
  }
}

/** One day of the §22 timeline, in each of the states the resolver produces. */
export function DayCard({day, onPress}: {day: ResolvedDay; onPress?: () => void}) {
  const {colors} = useTheme();
  const chip = chipFor(day);
  const meta = metaFor(day);
  const isRest = day.status === 'rest';
  const isMissed = day.status === 'missed';

  return (
    <View style={styles.wrapper}>
      <Card
        onPress={onPress}
        accessibilityHint={onPress ? 'Opens this day' : undefined}
        style={[
          isRest && styles.rest,
          isMissed && {borderStyle: 'dashed', borderColor: colors.rule},
        ]}>
        {isRest ? <Hatch color={colors.surface2} /> : null}
        <View style={styles.row}>
          <View style={styles.text}>
            <AppText variant="printed" color="muted">
              {formatDayLabel(day.date)}
            </AppText>
            <AppText variant="bodyStrong" color={nameColorFor(day)}>
              {isRest ? 'Rest day' : (day.name ?? '')}
            </AppText>
            {meta ? (
              <AppText variant="monoSmall" color="muted">
                {meta}
              </AppText>
            ) : null}
          </View>
          {chip ? <StatusChip status={chip.status} label={chip.label} /> : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  // List cells do not inherit a container gap, so the row carries its own.
  wrapper: {marginBottom: space.sm},
  rest: {overflow: 'hidden', borderRadius: radius.md},
  row: {flexDirection: 'row', alignItems: 'center', gap: space.md},
  text: {flex: 1, gap: space.xs},
});
```

- [ ] **Step 9: Write the timeline screen**

Create `src/features/history/HistoryTimelineScreen.tsx`:

```tsx
import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '@/ui/Screen';
import {Card} from '@/ui/Card';
import {Button} from '@/ui/Button';
import {IconButton} from '@/ui/IconButton';
import {ProgressBar} from '@/ui/ProgressBar';
import {AppText} from '@/ui/Text';
import {space} from '@/theme';
import {summarizeAdherence} from '@/domain/adherence';
import type {ResolvedDay} from '@/domain/dayResolver';
import {addLocalDays, startOfLocalDay, startOfLocalWeek} from '@/domain/weekday';
import type {HistoryStackParamList} from '@/navigation/types';
import {DayCard} from './DayCard';
import {useDayRangeQuery} from './useHistory';

/** A fortnight at a time — far enough back to see a pattern, short enough to scan. */
const WINDOW = 14;

/**
 * §22: a day timeline, not a session list.
 *
 * Days with no plan are dropped, and so are days still ahead: history is what
 * happened, and a Thursday you have not reached yet is neither.
 */
function timelineOf(days: readonly ResolvedDay[]): ResolvedDay[] {
  return days
    .filter(day => day.status !== 'no_plan' && day.status !== 'upcoming')
    .slice()
    .reverse();
}

export function HistoryTimelineScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<HistoryStackParamList>>();
  const [window, setWindow] = useState(WINDOW);

  const today = startOfLocalDay(Date.now());
  const from = addLocalDays(today, -(window - 1));
  const {data, isPending} = useDayRangeQuery({from, to: today});

  const days = data ?? [];
  const weekStart = startOfLocalWeek(today);
  const adherence = summarizeAdherence(days.filter(d => d.date >= weekStart));
  const timeline = timelineOf(days);

  return (
    <Screen
      eyebrow="This week"
      title="History"
      action={
        <IconButton
          glyph="calendar"
          label="Open the calendar"
          onPress={() => navigation.navigate('HistoryCalendar')}
        />
      }>
      <Card>
        <View style={styles.row}>
          <AppText variant="printed" color="muted">
            Adherence
          </AppText>
          <AppText variant="inkNum">
            {adherence.percent === null ? '—' : `${adherence.percent}%`}
          </AppText>
        </View>
        <ProgressBar
          value={adherence.completedWorkouts}
          total={adherence.plannedWorkouts}
          variant="gain"
          label="Workouts completed this week"
        />
        <View style={styles.row}>
          <AppText variant="printed" color="muted">
            {`${adherence.completedWorkouts} of ${adherence.plannedWorkouts} workouts`}
          </AppText>
          <AppText variant="printed" color="muted">
            {`${adherence.completedSets} of ${adherence.plannedSets} sets`}
          </AppText>
        </View>
      </Card>

      {isPending ? null : timeline.length === 0 ? (
        <AppText color="muted">
          Nothing here yet — past workouts appear once you finish one.
        </AppText>
      ) : (
        <View>
          {timeline.map(day => (
            <DayCard
              key={day.date}
              day={day}
              onPress={
                day.sessionId
                  ? () => navigation.navigate('DayDetail', {date: day.date})
                  : undefined
              }
            />
          ))}
        </View>
      )}

      {timeline.length > 0 ? (
        <Button
          variant="ghost"
          label="Show earlier"
          onPress={() => setWindow(current => current + WINDOW)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
});
```

- [ ] **Step 10: Wire the stack**

In `src/navigation/types.ts`, add:

```ts
export type HistoryStackParamList = {
  HistoryTimeline: undefined;
  HistoryCalendar: undefined;
  /** Local midnight of the day to open. */
  DayDetail: {date: number};
  ExerciseHistory: {exerciseId: string};
};
```

and add `ExerciseHistory: {exerciseId: string};` to `ExercisesStackParamList`, so an exercise's progression is reachable from the library as well as from a past day.

Create `src/navigation/HistoryStack.tsx`:

```tsx
import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {HistoryTimelineScreen} from '@/features/history/HistoryTimelineScreen';
import {CalendarScreen} from '@/features/history/CalendarScreen';
import {DayDetailScreen} from '@/features/history/DayDetailScreen';
import {ExerciseHistoryScreen} from '@/features/history/ExerciseHistoryScreen';
import type {HistoryStackParamList} from './types';

const Stack = createNativeStackNavigator<HistoryStackParamList>();

/** The History tab: the timeline, the calendar, and what each leads into. */
export function HistoryStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="HistoryTimeline" component={HistoryTimelineScreen} />
      <Stack.Screen name="HistoryCalendar" component={CalendarScreen} />
      <Stack.Screen name="DayDetail" component={DayDetailScreen} />
      <Stack.Screen name="ExerciseHistory" component={ExerciseHistoryScreen} />
    </Stack.Navigator>
  );
}
```

`CalendarScreen`, `DayDetailScreen` and `ExerciseHistoryScreen` arrive in Tasks 7–9. To keep this task independently runnable, create each of the three now as a one-line placeholder that renders `<Screen title="…" />` and nothing else, and replace them in their own tasks.

In `src/navigation/RootNavigator.tsx`, replace the `HistoryScreen` import with `HistoryStack` and the tab's `component={HistoryScreen}` with `component={HistoryStack}`. Delete `src/features/history/HistoryScreen.tsx`.

- [ ] **Step 11: Run the timeline test and the navigation test**

Run: `npx jest __tests__/features/history __tests__/navigation --forceExit`
Expected: PASS. `RootNavigator.test.tsx` asserts the History tab on `/past workouts/i`, which the timeline's empty state still satisfies — if it does not, fix the copy rather than the test, because that string is what a first-time user reads.

- [ ] **Step 12: Commit**

```bash
npm run typecheck && npm run lint && npx jest --forceExit
git add -A
git commit -m "feat: add the history timeline and the History tab stack"
```

---

### Task 7: The calendar

Design 13. A month of `resolveDay` output in a seven-column grid, a legend, and the month's two figures.

The grid maths is pure and lives in `domain/`, so the leading-pad calculation — the one thing here that is genuinely easy to get wrong, and silently — is tested without rendering anything.

**Files:**
- Create: `src/domain/calendarGrid.ts`, `src/features/history/CalendarGrid.tsx`
- Replace: `src/features/history/CalendarScreen.tsx` (the Task 6 placeholder)
- Test: `__tests__/domain/calendarGrid.test.ts`, `__tests__/features/history/calendar.test.tsx`

**Interfaces:**
- Consumes: `ResolvedDay`, `DayStatus` (Task 1); `summarizeAdherence` (Task 2); `useDayRangeQuery` (Task 6); `startOfLocalMonth`, `endOfLocalMonth`, `addLocalDays` (Task 1); `formatMonthTitle`, `formatYear`, `formatLongDate` (Task 6); `StatGrid`, `IconButton` (Task 6).
- Produces:
  - `type CalendarCell = {kind: 'pad'; label: string} | {kind: 'day'; label: string; day: ResolvedDay; isToday: boolean}`
  - `buildCalendarCells(days: readonly ResolvedDay[], today: number): CalendarCell[]`
  - `CalendarGrid({cells, onSelect})`

- [ ] **Step 1: Write the failing grid test**

Create `__tests__/domain/calendarGrid.test.ts`:

```ts
import {buildCalendarCells} from '@/domain/calendarGrid';
import type {ResolvedDay} from '@/domain/dayResolver';
import {eachLocalDay, weekdayIndex} from '@/domain/weekday';

const AUG = (day: number) => new Date(2026, 7, day).getTime();

/** A whole month of plain days — the grid only reads dates and status. */
const august: ResolvedDay[] = eachLocalDay(AUG(1), AUG(31)).map(date => ({
  date,
  weekday: weekdayIndex(new Date(date)),
  status: 'rest',
  name: 'Rest day',
  sessionId: null,
  exerciseCount: 0,
  plannedSets: 0,
  completedSets: 0,
  skippedSets: 0,
  volume: null,
}));

describe('buildCalendarCells', () => {
  it('returns nothing for an empty month', () => {
    expect(buildCalendarCells([], AUG(22))).toEqual([]);
  });

  it('pads the leading gap with the previous month, Monday first', () => {
    const cells = buildCalendarCells(august, AUG(22));
    // 1 August 2026 is a Saturday, which is index 5 in a Monday-first week.
    const pads = cells.filter(c => c.kind === 'pad');
    expect(pads).toHaveLength(5);
    expect(pads.map(c => c.label)).toEqual(['27', '28', '29', '30', '31']);
  });

  it('adds one cell per day of the month, in order', () => {
    const cells = buildCalendarCells(august, AUG(22));
    const days = cells.filter(c => c.kind === 'day');
    expect(days).toHaveLength(31);
    expect(days[0]!.label).toBe('1');
    expect(days[30]!.label).toBe('31');
  });

  it('marks exactly one cell as today', () => {
    const cells = buildCalendarCells(august, AUG(22));
    const today = cells.filter(c => c.kind === 'day' && c.isToday);
    expect(today).toHaveLength(1);
    expect(today[0]!.label).toBe('22');
  });

  it('marks no cell as today when today is in another month', () => {
    const cells = buildCalendarCells(august, new Date(2026, 8, 3).getTime());
    expect(cells.some(c => c.kind === 'day' && c.isToday)).toBe(false);
  });

  it('needs no pad when the month begins on a Monday', () => {
    // June 2026 begins on a Monday.
    const june: ResolvedDay[] = eachLocalDay(
      new Date(2026, 5, 1).getTime(),
      new Date(2026, 5, 30).getTime(),
    ).map(date => ({...august[0]!, date, weekday: weekdayIndex(new Date(date))}));
    expect(buildCalendarCells(june, AUG(22)).filter(c => c.kind === 'pad')).toEqual([]);
  });
});
```

- [ ] **Step 2: Write the grid builder**

Create `src/domain/calendarGrid.ts`:

```ts
import type {ResolvedDay} from './dayResolver';
import {addLocalDays, startOfLocalDay, weekdayIndex} from './weekday';

export type CalendarCell =
  | {kind: 'pad'; label: string}
  | {kind: 'day'; label: string; day: ResolvedDay; isToday: boolean};

/**
 * Lays a month out as a Monday-first grid (§23).
 *
 * The leading pad shows the previous month's trailing dates rather than blank
 * squares, exactly as the design draws it — an empty corner reads as a bug,
 * and a greyed 31st reads as a calendar.
 */
export function buildCalendarCells(
  days: readonly ResolvedDay[],
  today: number,
): CalendarCell[] {
  const first = days[0];
  if (!first) {
    return [];
  }

  const cells: CalendarCell[] = [];
  const lead = weekdayIndex(new Date(first.date));
  for (let back = lead; back > 0; back -= 1) {
    cells.push({
      kind: 'pad',
      label: String(new Date(addLocalDays(first.date, -back)).getDate()),
    });
  }

  const todayMidnight = startOfLocalDay(today);
  for (const day of days) {
    cells.push({
      kind: 'day',
      label: String(new Date(day.date).getDate()),
      day,
      isToday: day.date === todayMidnight,
    });
  }

  return cells;
}
```

Run: `npx jest __tests__/domain/calendarGrid.test.ts --forceExit` — PASS.

- [ ] **Step 3: Write the failing calendar screen test**

Create `__tests__/features/history/calendar.test.tsx`:

```tsx
import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  finishWorkout,
} from '@/repositories/sessionRepo';
import {
  addLocalDays,
  startOfLocalDay,
  startOfLocalMonth,
  weekdayIndex,
} from '@/domain/weekday';
import {formatMonthTitle} from '@/domain/dateLabels';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {CalendarScreen} from '@/features/history/CalendarScreen';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()}),
}));

const TODAY = startOfLocalDay(Date.now());
const daysAgo = (n: number) => addLocalDays(TODAY, -n);
const weekdayOf = (ms: number) => weekdayIndex(new Date(ms));

describe('CalendarScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <CalendarScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    // A plan from 60 days ago, training on today's weekday. Training *today*
    // is what makes the fixture land in the month the screen opens on, whatever
    // day of the month the suite happens to run.
    await createPlan(ctx.db, {now: daysAgo(60)});
    await editPlan(
      ctx.db,
      d =>
        addExercises(renameDay(d, weekdayOf(TODAY), 'Push Day'), weekdayOf(TODAY), [
          'bench',
        ]),
      daysAgo(60),
    );
    const session = await startWorkout(ctx.db, {now: TODAY + 9 * 3600_000});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    await finishWorkout(ctx.db, session.id);

    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockNavigate.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('opens on the current month', async () => {
    const view = renderScreen();
    expect(await view.findByText(formatMonthTitle(TODAY))).toBeTruthy();
  });

  it('shows the weekday header, Monday first', async () => {
    const view = renderScreen();
    await view.findByText(formatMonthTitle(TODAY));
    expect(view.getByLabelText('Monday')).toBeTruthy();
    expect(view.getByLabelText('Sunday')).toBeTruthy();
  });

  it('marks the day that was trained as completed', async () => {
    const view = renderScreen();
    await view.findByText(formatMonthTitle(TODAY));
    expect(view.getByLabelText(/Completed$/)).toBeTruthy();
  });

  it('shows the month totals', async () => {
    const view = renderScreen();
    await view.findByText(formatMonthTitle(TODAY));
    expect(view.getByText('Workouts')).toBeTruthy();
    expect(view.getByText('Sets')).toBeTruthy();
  });

  it('steps back a month and forward again', async () => {
    const view = renderScreen();
    await view.findByText(formatMonthTitle(TODAY));

    const previousMonth = addLocalDays(startOfLocalMonth(TODAY), -1);
    await fireEvent.press(view.getByLabelText(/previous month/i));
    await waitFor(() => {
      expect(view.getByText(formatMonthTitle(previousMonth))).toBeTruthy();
    });

    await fireEvent.press(view.getByLabelText(/next month/i));
    await waitFor(() => {
      expect(view.getByText(formatMonthTitle(TODAY))).toBeTruthy();
    });
  });

  it('opens the day detail when a date is tapped', async () => {
    const view = renderScreen();
    await view.findByText(formatMonthTitle(TODAY));
    await fireEvent.press(view.getByLabelText(/Completed$/));
    expect(mockNavigate).toHaveBeenCalledWith('DayDetail', {date: TODAY});
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `npx jest __tests__/features/history/calendar.test.tsx --forceExit`
Expected: FAIL — the Task 6 placeholder renders none of this.

- [ ] **Step 5: Write `CalendarGrid`**

Create `src/features/history/CalendarGrid.tsx`:

```tsx
import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {AppText} from '@/ui/Text';
import {useTheme, radius, space, type ColorToken} from '@/theme';
import type {CalendarCell} from '@/domain/calendarGrid';
import type {DayStatus} from '@/domain/dayResolver';
import {WEEKDAY_ABBR, weekdayName} from '@/domain/weekday';
import {formatLongDate} from '@/domain/dateLabels';

/** How each status paints, transcribed from `.cell.done` and friends. */
const TONE: Record<
  DayStatus,
  {fill: ColorToken | 'transparent'; border: ColorToken; ink: ColorToken; dashed?: true}
> = {
  completed: {fill: 'plate', border: 'plate', ink: 'plateInk'},
  partial: {fill: 'surface', border: 'short', ink: 'short'},
  missed: {fill: 'shortSoft', border: 'shortSoft', ink: 'short'},
  rest: {fill: 'surface', border: 'ruleSoft', ink: 'faint'},
  upcoming: {fill: 'transparent', border: 'rule', ink: 'faint', dashed: true},
  no_plan: {fill: 'surface', border: 'ruleSoft', ink: 'ink2'},
};

/** What a screen reader — and a test — reads off a cell. */
const SPOKEN: Record<DayStatus, string> = {
  completed: 'Completed',
  partial: 'Partial',
  missed: 'Missed',
  rest: 'Rest day',
  upcoming: 'To come',
  no_plan: 'No plan',
};

export const LEGEND: ReadonlyArray<{status: DayStatus; label: string}> = [
  {status: 'completed', label: 'Completed'},
  {status: 'partial', label: 'Partial'},
  {status: 'missed', label: 'Missed'},
  {status: 'rest', label: 'Rest'},
  {status: 'upcoming', label: 'To come'},
];

/** §23: one month, seven columns, Monday first. */
export function CalendarGrid({
  cells,
  onSelect,
}: {
  cells: readonly CalendarCell[];
  onSelect: (date: number) => void;
}) {
  const {colors} = useTheme();

  const paint = (status: DayStatus) => {
    const tone = TONE[status];
    return {
      backgroundColor: tone.fill === 'transparent' ? 'transparent' : colors[tone.fill],
      borderColor: colors[tone.border],
      borderStyle: tone.dashed ? ('dashed' as const) : ('solid' as const),
    };
  };

  return (
    <View>
      <View style={styles.grid}>
        {WEEKDAY_ABBR.map((abbr, index) => (
          <View key={abbr + String(index)} style={styles.slot}>
            <AppText
              accessibilityLabel={weekdayName(index)}
              variant="printed"
              color="muted"
              style={styles.dow}>
              {abbr.slice(0, 1)}
            </AppText>
          </View>
        ))}

        {cells.map((cell, index) =>
          cell.kind === 'pad' ? (
            <View key={`pad-${index}`} style={styles.slot}>
              <View style={[styles.cell, styles.pad]}>
                <AppText variant="small" color="faint">
                  {cell.label}
                </AppText>
              </View>
            </View>
          ) : (
            <View key={cell.day.date} style={styles.slot}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${formatLongDate(cell.day.date)} — ${SPOKEN[cell.day.status]}`}
                onPress={() => onSelect(cell.day.date)}
                style={[
                  styles.cell,
                  paint(cell.day.status),
                  cell.isToday && {borderWidth: 2, borderColor: colors.plate},
                ]}>
                <AppText variant="small" color={TONE[cell.day.status].ink}>
                  {cell.label}
                </AppText>
              </Pressable>
            </View>
          ),
        )}
      </View>

      <View style={styles.legend}>
        {LEGEND.map(entry => (
          <View key={entry.status} style={styles.legendItem}>
            <View style={[styles.swatch, paint(entry.status)]} />
            <AppText variant="monoSmall" color="muted">
              {entry.label}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  // Seven equal columns. The gap is padding inside each slot rather than a
  // `gap` on the row, because a percentage width plus a gap overflows the
  // container and wraps six cells to a row instead of seven.
  slot: {width: '14.2857%', padding: 2.5},
  dow: {textAlign: 'center'},
  cell: {
    aspectRatio: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pad: {backgroundColor: 'transparent', borderColor: 'transparent', opacity: 0.4},
  legend: {flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.md},
  legendItem: {flexDirection: 'row', alignItems: 'center', gap: space.xs},
  swatch: {width: 10, height: 10, borderRadius: 3, borderWidth: 1},
});
```

- [ ] **Step 6: Write the calendar screen**

Replace `src/features/history/CalendarScreen.tsx`:

```tsx
import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '@/ui/Screen';
import {IconButton} from '@/ui/IconButton';
import {StatGrid} from '@/ui/StatGrid';
import {space} from '@/theme';
import {buildCalendarCells} from '@/domain/calendarGrid';
import {summarizeAdherence} from '@/domain/adherence';
import {formatMonthTitle, formatYear} from '@/domain/dateLabels';
import {
  addLocalDays,
  endOfLocalMonth,
  startOfLocalDay,
  startOfLocalMonth,
} from '@/domain/weekday';
import type {HistoryStackParamList} from '@/navigation/types';
import {CalendarGrid} from './CalendarGrid';
import {useDayRangeQuery} from './useHistory';

/** Design 13: a month of adherence at a glance (§23). */
export function CalendarScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<HistoryStackParamList>>();
  const today = startOfLocalDay(Date.now());
  const [month, setMonth] = useState(() => startOfLocalMonth(today));

  const {data} = useDayRangeQuery({from: month, to: endOfLocalMonth(month)});
  const days = data ?? [];
  const cells = buildCalendarCells(days, today);
  const adherence = summarizeAdherence(days);

  const step = (direction: -1 | 1) =>
    setMonth(current =>
      direction === -1
        ? startOfLocalMonth(addLocalDays(current, -1))
        : startOfLocalMonth(addLocalDays(endOfLocalMonth(current), 1)),
    );

  return (
    <Screen
      eyebrow={formatYear(month)}
      title={formatMonthTitle(month)}
      action={
        <View style={styles.nav}>
          <IconButton
            glyph="chevronLeft"
            label="Previous month"
            onPress={() => step(-1)}
          />
          <IconButton
            glyph="chevronRight"
            label="Next month"
            onPress={() => step(1)}
          />
        </View>
      }>
      <CalendarGrid
        cells={cells}
        onSelect={date => navigation.navigate('DayDetail', {date})}
      />
      <StatGrid
        stats={[
          {
            label: 'Workouts',
            value: `${adherence.completedWorkouts} / ${adherence.plannedWorkouts}`,
          },
          {label: 'Sets', value: String(adherence.completedSets)},
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: {flexDirection: 'row', gap: space.sm},
});
```

- [ ] **Step 7: Run it and watch it pass**

Run: `npx jest __tests__/features/history __tests__/domain --forceExit`
Expected: PASS.

- [ ] **Step 8: Prove the grid does not silently wrap**

`slot` uses a percentage width with padding for the gutter. Confirm the choice is load-bearing: temporarily change `slot` to `{flex: 1, margin: 2.5}` and re-run the calendar test — the cells no longer wrap into weeks and "shows the weekday header, Monday first" still passes, which is the point: **a layout regression here is invisible to the test suite.** Restore the percentage, and check the grid by eye on the device in Task 10.

- [ ] **Step 9: Commit**

```bash
npm run typecheck && npm run lint && npx jest --forceExit
git add -A
git commit -m "feat: add the month calendar of adherence"
```

---

### Task 8: The day detail

Design 14 — where the ledger idea pays off literally: a printed target column, an ink actual column, and the verdict on the right. This is §16 rendered over a *past* session rather than today's, which is why it can reuse `getSessionForDate`, `compareSet` and `LedgerTable` unchanged.

A day with no session still opens: the calendar lets you tap any date, and "Rest day" is a real answer.

**Files:**
- Create: `src/domain/format.ts`
- Modify: `src/features/history/useHistory.ts` (add `useDaySessionQuery`)
- Replace: `src/features/history/DayDetailScreen.tsx` (the Task 6 placeholder)
- Test: `__tests__/domain/format.test.ts`, `__tests__/features/history/dayDetail.test.tsx`

**Interfaces:**
- Consumes: `getSessionForDate` from `@/repositories/sessionRepo`; `compareSet`, `describeComparison` from `@/domain/setComparison`; `sessionVolume` from `@/domain/sessionProgress`; `LedgerTable`, `LedgerRow` from `@/ui/LedgerTable`; `useDayQuery` (Task 6); `formatLongDate` (Task 6).
- Produces:
  - `groupDigits(value: number): string`
  - `formatDuration(ms: number): string`
  - `useDaySessionQuery(date: number)`, `historyKeys.session(date)`

- [ ] **Step 1: Write the failing formatter test**

Create `__tests__/domain/format.test.ts`:

```ts
import {formatDuration, groupDigits} from '@/domain/format';

describe('groupDigits', () => {
  it.each([
    [0, '0'],
    [860, '860'],
    [4280, '4,280'],
    [1234567, '1,234,567'],
  ])('groups %i as %s', (value, expected) => {
    expect(groupDigits(value)).toBe(expected);
  });

  it('keeps a fraction without padding it with zeros', () => {
    expect(groupDigits(772.5)).toBe('772.5');
    expect(groupDigits(1772.25)).toBe('1,772.25');
  });

  it('uses a true minus sign, to match the tabular figures beside it', () => {
    expect(groupDigits(-40)).toBe('−40');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 min'],
    [48 * 60_000, '48 min'],
    [60 * 60_000, '1 h'],
    [75 * 60_000, '1 h 15 min'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it('never reports a negative duration', () => {
    expect(formatDuration(-5000)).toBe('0 min');
  });
});
```

- [ ] **Step 2: Write the formatters**

Create `src/domain/format.ts`:

```ts
/** A true minus sign — a hyphen is the wrong width beside tabular figures. */
const MINUS = '−';

/**
 * "4,280". Written out rather than delegated to `toLocaleString`, for the same
 * reason the month names are: Hermes ships without full ICU data, so the
 * device and Node disagree about the output.
 */
export function groupDigits(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [whole = '0', fraction = ''] = Math.abs(rounded).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const trimmed = fraction.replace(/0+$/, '');
  const sign = rounded < 0 ? MINUS : '';
  return trimmed ? `${sign}${grouped}.${trimmed}` : `${sign}${grouped}`;
}

/** "48 min", "1 h 15 min" — how long a session took (design 14). */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
```

Run: `npx jest __tests__/domain/format.test.ts --forceExit` — PASS.

- [ ] **Step 3: Add the session hook**

In `src/features/history/useHistory.ts`, add `getSessionForDate` to the imports, add a key, and add the hook:

```ts
export const historyKeys = {
  all: ['history'] as const,
  range: (from: number, to: number) => ['history', 'range', from, to] as const,
  day: (date: number) => ['history', 'day', date] as const,
  session: (date: number) => ['history', 'session', date] as const,
  exercise: (exerciseId: string) => ['history', 'exercise', exerciseId] as const,
};

/** A past day's whole tree, for the §16 table. */
export function useDaySessionQuery(date: number) {
  const db = useDatabase();
  return useQuery({
    queryKey: historyKeys.session(date),
    queryFn: async () => (await getSessionForDate(db, date)) ?? null,
    staleTime: Infinity,
  });
}
```

- [ ] **Step 4: Write the failing day-detail test**

Create `__tests__/features/history/dayDetail.test.tsx`:

```tsx
import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setRestDay, setTargets} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  skipSet,
  addExercise,
  finishWorkout,
  getSessionForDate,
} from '@/repositories/sessionRepo';
import {addLocalDays, startOfLocalDay, weekdayIndex} from '@/domain/weekday';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {DayDetailScreen} from '@/features/history/DayDetailScreen';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
const mockParams: {date: number} = {date: 0};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()}),
  useRoute: () => ({params: mockParams}),
}));

const TODAY = startOfLocalDay(Date.now());
const daysAgo = (n: number) => addLocalDays(TODAY, -n);
const weekdayOf = (ms: number) => weekdayIndex(new Date(ms));

const TRAINED = daysAgo(7);
const RESTED = daysAgo(6);

describe('DayDetailScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <DayDetailScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('press','Machine Chest Press','chest','[]','machine','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0)`,
    );
    await createPlan(ctx.db, {now: daysAgo(30)});
    await editPlan(
      ctx.db,
      d =>
        setTargets(
          setRestDay(
            addExercises(renameDay(d, weekdayOf(TRAINED), 'Push Day'), weekdayOf(TRAINED), [
              'press',
            ]),
            weekdayOf(RESTED),
            true,
          ),
          weekdayOf(TRAINED),
          0,
          [
            {targetReps: 10, targetWeight: 30},
            {targetReps: 10, targetWeight: 30},
            {targetReps: 10, targetWeight: 30},
          ],
        ),
      daysAgo(30),
    );

    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockNavigate.mockClear();
    mockParams.date = TRAINED;
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  /** Two sets done, one skipped, plus an exercise added on the day. */
  const trainWithAGap = async () => {
    const session = await startWorkout(ctx.db, {now: TRAINED + 9 * 3600_000});
    const sets = session.exercises[0]!.sets;
    await completeSet(ctx.db, sets[0]!.id, {actualReps: 10, actualWeight: 30});
    await completeSet(ctx.db, sets[1]!.id, {actualReps: 12, actualWeight: 30});
    await skipSet(ctx.db, sets[2]!.id);
    await addExercise(ctx.db, session.id, 'fly');
    const reloaded = await getSessionForDate(ctx.db, TRAINED);
    const bonusExercise = reloaded!.exercises.find(e => e.plannedExerciseId === null)!;
    await completeSet(ctx.db, bonusExercise.sets[0]!.id, {
      actualReps: 12,
      actualWeight: 10,
    });
    await finishWorkout(ctx.db, session.id);
  };

  it('names the day and dates it', async () => {
    await trainWithAGap();
    const view = renderScreen();
    expect(await view.findByText('Push Day')).toBeTruthy();
  });

  it('reports the session duration and its total volume', async () => {
    await trainWithAGap();
    const view = renderScreen();
    await view.findByText('Push Day');
    // 10x30 + 12x30 + the 12x10 added on the day.
    expect(view.getByText(/780 kg total volume/)).toBeTruthy();
  });

  it('lays every exercise out as a ledger of target against actual', async () => {
    await trainWithAGap();
    const view = renderScreen();
    await view.findByText('Push Day');
    expect(view.getByText('Machine Chest Press')).toBeTruthy();
    expect(view.getAllByText('10 × 30.0').length).toBeGreaterThan(0);
    expect(view.getByText('12 × 30.0')).toBeTruthy();
    expect(view.getByText('+2 reps')).toBeTruthy();
  });

  it('writes an em dash where a set was skipped', async () => {
    await trainWithAGap();
    const view = renderScreen();
    await view.findByText('Push Day');
    expect(view.getAllByText('—').length).toBeGreaterThan(0);
    expect(view.getByText('Skipped')).toBeTruthy();
  });

  it('marks an exercise that was added on the day', async () => {
    await trainWithAGap();
    const view = renderScreen();
    await view.findByText('Push Day');
    expect(view.getByText(/added on the day/i)).toBeTruthy();
  });

  it('opens the exercise history when its name is tapped', async () => {
    await trainWithAGap();
    const view = renderScreen();
    await view.findByText('Push Day');
    await fireEvent.press(view.getByText('Machine Chest Press'));
    expect(mockNavigate).toHaveBeenCalledWith('ExerciseHistory', {
      exerciseId: 'press',
    });
  });

  it('says so plainly on a rest day, rather than showing an empty ledger', async () => {
    mockParams.date = RESTED;
    const view = renderScreen();
    expect(await view.findByText(/rest day/i)).toBeTruthy();
  });

  it('says nothing was recorded on a day that was missed', async () => {
    mockParams.date = daysAgo(14);
    const view = renderScreen();
    expect(await view.findByText(/nothing was recorded/i)).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run it and watch it fail**

Run: `npx jest __tests__/features/history/dayDetail.test.tsx --forceExit`
Expected: FAIL — the Task 6 placeholder renders none of this.

- [ ] **Step 6: Write the screen**

Replace `src/features/history/DayDetailScreen.tsx`:

```tsx
import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '@/ui/Screen';
import {Card} from '@/ui/Card';
import {AppText} from '@/ui/Text';
import {LedgerTable, type LedgerRow} from '@/ui/LedgerTable';
import {space} from '@/theme';
import {compareSet, describeComparison} from '@/domain/setComparison';
import {sessionVolume} from '@/domain/sessionProgress';
import {formatLongDate} from '@/domain/dateLabels';
import {formatDuration, groupDigits} from '@/domain/format';
import type {ResolvedDay} from '@/domain/dayResolver';
import type {Session} from '@/repositories/sessionRepo';
import {useSettingsQuery} from '@/features/settings/useSettings';
import type {HistoryStackParamList} from '@/navigation/types';
import {useDayQuery, useDaySessionQuery} from './useHistory';

/** "10 × 30.0", or an em dash where nothing was recorded (design 14). */
const pair = (reps: number | null, weight: number | null): string => {
  if (reps === null) {
    return '—';
  }
  return weight === null ? `${reps}` : `${reps} × ${weight.toFixed(1)}`;
};

/** The one line under the heading: how long it took, and how much moved. */
function subtitleFor(session: Session, unit: string): string {
  const parts: string[] = [];
  if (session.completedAt !== null) {
    parts.push(formatDuration(session.completedAt - session.startedAt));
  }
  const volume = sessionVolume(session.exercises);
  if (volume > 0) {
    parts.push(`${groupDigits(volume)} ${unit} total volume`);
  }
  return parts.join(' · ');
}

/** What a day with no session has to say for itself. */
function emptyMessageFor(day: ResolvedDay | undefined): string {
  switch (day?.status) {
    case 'rest':
      return 'A rest day. Nothing was scheduled, and nothing is missing.';
    case 'missed':
      return `${day.name ?? 'A workout'} was planned. Nothing was recorded.`;
    case 'upcoming':
      return `${day.name ?? 'A workout'} is still ahead.`;
    default:
      return 'No plan covered this day.';
  }
}

/** Design 14: the §16 set-by-set table for a day that has already happened. */
export function DayDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<HistoryStackParamList>>();
  const {date} = useRoute().params as {date: number};

  const {data: day} = useDayQuery(date);
  const {data: session, isPending} = useDaySessionQuery(date);
  const {data: settings} = useSettingsQuery();
  const unit = settings?.unit ?? 'kg';

  // A rest day names itself, rather than showing the bare weekday the plan
  // stores when the day was never given a custom name.
  const title =
    session?.dayName ??
    (day?.status === 'rest' ? 'Rest day' : day?.name) ??
    'No plan';

  if (!session) {
    return (
      <Screen eyebrow={formatLongDate(date)} title={title}>
        {isPending ? null : (
          <Card>
            <AppText color="muted">{emptyMessageFor(day)}</AppText>
          </Card>
        )}
      </Screen>
    );
  }

  return (
    <Screen eyebrow={formatLongDate(date)} title={title}>
      <AppText variant="printed" color="muted">
        {subtitleFor(session, unit)}
      </AppText>

      {session.exercises.map(exercise => {
        const rows: LedgerRow[] = exercise.sets.map(set => {
          const comparison = compareSet(set);
          return {
            setNumber: set.setNumber,
            // An unplanned set had no target, so there is nothing to print in
            // the target column — it is labelled, not scored.
            target: set.isUnplanned ? '—' : pair(set.targetReps, set.targetWeight),
            actual: pair(set.actualReps, set.actualWeight),
            result:
              comparison.status === 'skipped'
                ? 'Skipped'
                : describeComparison(comparison, unit),
            status: comparison.status,
          };
        });

        return (
          <View key={exercise.id} style={styles.block}>
            <View style={styles.label}>
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Opens this exercise's history"
                onPress={() =>
                  navigation.navigate('ExerciseHistory', {
                    exerciseId: exercise.exerciseId,
                  })
                }>
                <AppText variant="printed" color="muted">
                  {exercise.name}
                </AppText>
              </Pressable>
              {exercise.plannedExerciseId === null ? (
                <AppText variant="printed" color="plate">
                  · added on the day
                </AppText>
              ) : null}
            </View>
            <LedgerTable rows={rows} />
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: {gap: space.sm},
  label: {flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap'},
});
```

- [ ] **Step 7: Run it and watch it pass**

Run: `npx jest __tests__/features/history --forceExit`
Expected: PASS.

- [ ] **Step 8: Prove the target column is snapshotted, not joined**

This is success criterion 9, and the day detail is where a regression would first show. Add one test to `dayDetail.test.tsx`:

```tsx
  it('keeps the printed targets a later plan edit cannot reach', async () => {
    await trainWithAGap();
    // Raise every target well above what was actually done, the day after.
    await editPlan(
      ctx.db,
      d =>
        setTargets(d, weekdayOf(TRAINED), 0, [
          {targetReps: 20, targetWeight: 60},
          {targetReps: 20, targetWeight: 60},
          {targetReps: 20, targetWeight: 60},
        ]),
      daysAgo(6),
    );

    const view = renderScreen();
    await view.findByText('Push Day');
    expect(view.queryByText('20 × 60.0')).toBeNull();
    expect(view.getAllByText('10 × 30.0').length).toBeGreaterThan(0);
  });
```

Add `editPlan` and `setTargets` to the test file's imports if they are not already there. Run the file and confirm it passes.

- [ ] **Step 9: Commit**

```bash
npm run typecheck && npm run lint && npx jest --forceExit
git add -A
git commit -m "feat: show a past day as a ledger of target against actual"
```

---

### Task 9: Exercise history

Design 15. The working-weight run, the two best figures, and a card per session — reachable both from a past day's exercise name and from the library, because those are the two moments you actually want it.

**Files:**
- Replace: `src/features/history/ExerciseHistoryScreen.tsx` (the Task 6 placeholder)
- Modify: `src/navigation/ExercisesStack.tsx`, `src/features/exercises/ExerciseDetailScreen.tsx`
- Test: `__tests__/features/history/exerciseHistory.test.tsx`

**Interfaces:**
- Consumes: `useExerciseHistoryQuery` (Task 6); `ExerciseProgress`, `SessionProgress` (Task 3); `StatGrid` (Task 6); `formatShortDate` (Task 6); `groupDigits` (Task 8).
- Produces: nothing new — this task is the last consumer.

- [ ] **Step 1: Write the failing test**

Create `__tests__/features/history/exerciseHistory.test.tsx`:

```tsx
import React from 'react';
import {render} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setTargets} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  finishWorkout,
} from '@/repositories/sessionRepo';
import {addLocalDays, startOfLocalDay, weekdayIndex} from '@/domain/weekday';
import {formatShortDate} from '@/domain/dateLabels';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {ExerciseHistoryScreen} from '@/features/history/ExerciseHistoryScreen';
import {createTestDb} from '../../helpers/testDb';

const mockParams: {exerciseId: string} = {exerciseId: 'press'};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: jest.fn(), goBack: jest.fn()}),
  useRoute: () => ({params: mockParams}),
}));

const TODAY = startOfLocalDay(Date.now());
const daysAgo = (n: number) => addLocalDays(TODAY, -n);
const weekdayOf = (ms: number) => weekdayIndex(new Date(ms));

// Three of the same weekday, so one plan covers all three sessions.
const WEEKS = [daysAgo(21), daysAgo(14), daysAgo(7)];

describe('ExerciseHistoryScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <ExerciseHistoryScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  const trainAt = async (date: number, weight: number | null, reps = 10) => {
    const session = await startWorkout(ctx.db, {now: date + 9 * 3600_000});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: reps, actualWeight: weight});
    }
    await finishWorkout(ctx.db, session.id);
  };

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('press','Machine Chest Press','chest','[]','machine','strength',1,0,0),
                 ('pushup','Push-up','chest','[]','body only','strength',0,0,0)`,
    );
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockParams.exerciseId = 'press';
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  const seedPress = async () => {
    await createPlan(ctx.db, {now: daysAgo(30)});
    await editPlan(
      ctx.db,
      d =>
        setTargets(
          addExercises(renameDay(d, weekdayOf(WEEKS[0]!), 'Push Day'), weekdayOf(WEEKS[0]!), [
            'press',
          ]),
          weekdayOf(WEEKS[0]!),
          0,
          [
            {targetReps: 10, targetWeight: 30},
            {targetReps: 10, targetWeight: 30},
            {targetReps: 10, targetWeight: 30},
          ],
        ),
      daysAgo(30),
    );
    await trainAt(WEEKS[0]!, 25);
    await trainAt(WEEKS[1]!, 27.5);
    await trainAt(WEEKS[2]!, 30);
  };

  it('says plainly when an exercise has never been performed', async () => {
    mockParams.exerciseId = 'pushup';
    const view = renderScreen();
    expect(await view.findByText(/nothing recorded/i)).toBeTruthy();
  });

  it('names the exercise', async () => {
    await seedPress();
    const view = renderScreen();
    expect(await view.findByText('Machine Chest Press')).toBeTruthy();
  });

  it('reads the working weight as a run from oldest to newest', async () => {
    await seedPress();
    const view = renderScreen();
    await view.findByText('Machine Chest Press');
    expect(view.getByText('Working weight')).toBeTruthy();
    expect(view.getByText('25.0')).toBeTruthy();
    expect(view.getByText('27.5')).toBeTruthy();
    expect(view.getByText('30.0')).toBeTruthy();
  });

  it('reports the best set and the best volume', async () => {
    await seedPress();
    const view = renderScreen();
    await view.findByText('Machine Chest Press');
    expect(view.getByText('Best set')).toBeTruthy();
    expect(view.getByText('30.0 × 10')).toBeTruthy();
    expect(view.getByText('Best volume')).toBeTruthy();
    // "900 kg" is both the best-volume figure and the newest session's chip.
    expect(view.getAllByText('900 kg').length).toBe(2);
  });

  it('lists each session with its date, volume and sets', async () => {
    await seedPress();
    const view = renderScreen();
    await view.findByText('Machine Chest Press');
    expect(view.getByText(formatShortDate(WEEKS[2]!))).toBeTruthy();
    expect(view.getByText('30.0×10 · 30.0×10 · 30.0×10')).toBeTruthy();
    expect(view.getByText('750 kg')).toBeTruthy();
  });

  it('omits volume entirely for a bodyweight exercise', async () => {
    await createPlan(ctx.db, {now: daysAgo(30)});
    await editPlan(
      ctx.db,
      d =>
        addExercises(renameDay(d, weekdayOf(WEEKS[2]!), 'Push Day'), weekdayOf(WEEKS[2]!), [
          'pushup',
        ]),
      daysAgo(30),
    );
    await trainAt(WEEKS[2]!, null, 15);
    mockParams.exerciseId = 'pushup';

    const view = renderScreen();
    await view.findByText('Push-up');
    expect(view.queryByText('Working weight')).toBeNull();
    expect(view.queryByText('Best volume')).toBeNull();
    expect(view.getByText('15 reps')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest __tests__/features/history/exerciseHistory.test.tsx --forceExit`
Expected: FAIL — the Task 6 placeholder renders none of this.

- [ ] **Step 3: Write the screen**

Replace `src/features/history/ExerciseHistoryScreen.tsx`:

```tsx
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useRoute} from '@react-navigation/native';
import {Screen} from '@/ui/Screen';
import {Card} from '@/ui/Card';
import {StatGrid, type Stat} from '@/ui/StatGrid';
import {StatusChip} from '@/ui/StatusChip';
import {AppText} from '@/ui/Text';
import {space} from '@/theme';
import type {BestSet, SessionProgress} from '@/domain/exerciseProgress';
import {formatShortDate} from '@/domain/dateLabels';
import {groupDigits} from '@/domain/format';
import {useSettingsQuery} from '@/features/settings/useSettings';
import {useExerciseHistoryQuery} from './useHistory';

/** "30.0×10 · 30.0×10 · 32.5×8" — a session on one line (design 15). */
const setsLine = (session: SessionProgress): string =>
  session.sets
    .map(set =>
      set.weight === null ? `${set.reps}` : `${set.weight.toFixed(1)}×${set.reps}`,
    )
    .join(' · ');

/** "30.0 × 10" for a weighted lift, "15 reps" for a bodyweight one (§26). */
const bestSetLabel = (best: BestSet): string =>
  best.weight === null
    ? `${best.reps} reps`
    : `${best.weight.toFixed(1)} × ${best.reps}`;

/** Design 15: §24's progression, with §26's volume beside it. */
export function ExerciseHistoryScreen() {
  const {exerciseId} = useRoute().params as {exerciseId: string};
  const {data, isPending} = useExerciseHistoryQuery(exerciseId);
  const {data: settings} = useSettingsQuery();
  const unit = settings?.unit ?? 'kg';

  if (!data) {
    return <Screen eyebrow="Exercise history" title={isPending ? '' : 'Not found'} />;
  }

  const {progress} = data;
  const stats: Stat[] = [];
  if (progress.bestSet) {
    stats.push({label: 'Best set', value: bestSetLabel(progress.bestSet)});
  }
  if (progress.bestVolume !== null) {
    stats.push({
      label: 'Best volume',
      value: `${groupDigits(progress.bestVolume)} ${unit}`,
    });
  }

  return (
    <Screen eyebrow="Exercise history" title={data.name}>
      {progress.sessions.length === 0 ? (
        <Card>
          <AppText color="muted">
            Nothing recorded for this exercise yet. It will appear here after
            the first time you train it.
          </AppText>
        </Card>
      ) : null}

      {progress.workingWeights.length > 0 ? (
        <Card>
          <AppText variant="printed" color="muted">
            Working weight
          </AppText>
          <View style={styles.run}>
            {progress.workingWeights.map((weight, index) => {
              const isLatest = index === progress.workingWeights.length - 1;
              return (
                <React.Fragment key={`${weight}-${index}`}>
                  {index > 0 ? (
                    <AppText variant="mono" color="faint">
                      →
                    </AppText>
                  ) : null}
                  <AppText
                    variant={isLatest ? 'inkNum' : 'mono'}
                    color={isLatest ? 'gain' : 'faint'}>
                    {weight.toFixed(1)}
                  </AppText>
                </React.Fragment>
              );
            })}
          </View>
        </Card>
      ) : null}

      {stats.length > 0 ? <StatGrid stats={stats} /> : null}

      {progress.sessions.length > 0 ? (
        <AppText variant="printed" color="muted">
          Sessions
        </AppText>
      ) : null}

      {progress.sessions.map(session => (
        <Card key={session.sessionId}>
          <View style={styles.row}>
            <AppText variant="printed" color="muted">
              {formatShortDate(session.date)}
            </AppText>
            {session.volume === null ? null : (
              <StatusChip
                // The best session so far is worth pointing at; the rest are
                // simply what happened.
                status={
                  session.volume === progress.bestVolume ? 'exceeded' : 'achieved'
                }
                label={`${groupDigits(session.volume)} ${unit}`}
              />
            )}
          </View>
          <AppText variant="monoSmall" color="ink2">
            {setsLine(session)}
          </AppText>
        </Card>
      ))}

      {progress.sessions.length > 0 ? (
        <AppText variant="caption" color="muted">
          Progression charts arrive after validation — the data is already being
          recorded for them.
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  run: {flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap'},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
});
```

- [ ] **Step 4: Reach it from the library too**

In `src/navigation/ExercisesStack.tsx`, import `ExerciseHistoryScreen` and register it:

```tsx
      <Stack.Screen name="ExerciseHistory" component={ExerciseHistoryScreen} />
```

`ExerciseDetailScreen` styles its own control rather than using `Button` — a
`Pressable` with the `styles.edit` rule, rendered only for custom exercises.
Add a matching one directly above it, shown for **every** exercise, since the
question "what have I done on this?" is not limited to exercises you wrote:

```tsx
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          navigation.navigate('ExerciseHistory', {exerciseId: exercise.id})
        }
        style={[styles.edit, {borderColor: colors.rule}]}>
        <AppText variant="bodyStrong" color="plate">
          View history
        </AppText>
      </Pressable>
```

- [ ] **Step 5: Run everything**

Run: `npx jest --forceExit`
Expected: PASS, including the Phase 1 exercise-detail tests — the new button must not break the existing assertions on that screen.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint && npx jest --forceExit
git add -A
git commit -m "feat: show one exercise's progression across past sessions"
```

---

### Task 10: The phase gate

The spec's Phase 4 gate is: *"browse past workouts, open a day's detail, view one exercise's progression — then edit the plan and confirm history is unchanged."*

Three of Phases 2 and 3's worst defects — foreign keys off, a renumbered migration, a removed React Native API — were all invisible to a green test suite and found only by reading logcat and the device database. This task is that pass, done deliberately rather than hoped for.

**Files:**
- Modify: `docs/deferred.md`
- No source changes unless the device finds something.

- [ ] **Step 1: Full verification**

```bash
npm run typecheck && npm run lint && npx jest --forceExit > run.txt 2>&1
```

Read `run.txt` rather than trusting the exit code: confirm the suite count went up by the new files and that nothing was skipped. Delete `run.txt` afterwards.

- [ ] **Step 2: Confirm the phase added no schema**

```bash
git diff main --stat -- src/db drizzle
```

Expected: **no output.** Phase 4 is a different read over data already recorded (spec section 12). If a migration appears here, something was built in the wrong layer.

- [ ] **Step 3: Build and install**

```bash
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Use `adb install -r` rather than `./gradlew installDebug` — MIUI blocks Gradle's ddmlib installer.

- [ ] **Step 4: Walk the gate on the device**

Do these in order, and note what actually happens rather than what should:

1. **Browse.** Open History. The adherence card shows this week; the timeline lists the days below it, newest first. Rest days carry the hatch, missed days the dashed border. Press "Show earlier" and confirm older days appear.
2. **Open a day.** Tap a day that has a workout. Confirm the header shows the date, the day name, the duration and the total volume, and that every exercise has its own ledger with target, actual and result — and that a skipped set shows an em dash, not a zero.
3. **One exercise.** Tap an exercise name in that ledger. Confirm the working-weight run, the best set and best volume, and a card per session. Then reach the same screen from Exercises → an exercise → "View history", and confirm it shows the same thing.
4. **The calendar.** Open it from the History heading. Confirm **seven cells per row** — this is the one thing the test suite cannot see (Task 7, Step 8). Step back a month and forward again. Tap a date and confirm it opens that day.
5. **The invariant.** Edit the plan: rename the day you just looked at, or turn it into a rest day. Return to History. **The past day must be unchanged** — same name, same status, same targets in the ledger. This is success criterion 9, and it is the whole reason `plan_versions` exists.
6. **Live update.** Finish a workout today, then switch straight to History without restarting the app. Today must appear immediately. If it does not, the `historyKeys.all` invalidation added in Task 6 is missing or misplaced.

- [ ] **Step 5: Read the device database**

```bash
adb shell "run-as com.onemorerep cat databases/onemorerep.db" > device.db
sqlite3 device.db "PRAGMA user_version;"
sqlite3 device.db "SELECT COUNT(*) FROM plan_versions;"
sqlite3 device.db "SELECT id, effective_from, effective_to FROM plan_versions ORDER BY effective_from;"
```

Substitute the real application id and database filename if they differ. Confirm:
- `user_version` is still **5** — Phase 4 adds no migration.
- After the step-5 edit there are **two** versions, the older one closed.
- The session you opened still carries the `day_name_snapshot` it was performed under, whatever the plan now says.

Delete `device.db` afterwards.

- [ ] **Step 6: Read logcat for anything the UI swallowed**

```bash
adb logcat -d ReactNativeJS:* *:S | tail -60
```

Warnings about keys, styles, or removed APIs count as findings. This is exactly how Phase 3's `InteractionManager` removal was caught.

- [ ] **Step 7: Update `docs/deferred.md`**

Add anything the device pass turned up. Then re-read the whole file and, per its own rule, **restate every open item to the user when declaring the phase complete** — including the two carried in from earlier phases:

- the plan-fork device check, deferred to after Phase 5;
- the four workout paths never walked on device (skip, bonus set, unplanned exercise, force-kill resume) and the mixed volume verdict.

Also record this phase's own design departures under "Design departures":

- **A calendar button in the History heading.** Design 12 draws no way to reach design 13. One `IconButton` in the timeline's app bar is the smallest honest addition.
- **A previous-month button.** Design 13 draws only a next chevron. A month view you cannot go back in is not usable.
- **"Bonus" rather than "unplanned" in the result column.** Design 14 writes "unplanned"; Phase 3's finish summary already ships "Bonus" from `describeComparison`. Two words for one thing across two screens is worse than one deviation from one mock, so the shared function wins.
- **A "View history" control on the exercise detail screen.** Design 19 does not draw one, but §24 says an exercise's history is reached by selecting the exercise, and the library is where you do that.

- [ ] **Step 8: Commit, tag, and report**

```bash
git add -A
git commit -m "docs: record the Phase 4 design departures and gate findings"
git tag phase-4
```

Then report to the user: what was walked on the device, what was found, and every open item from `docs/deferred.md`. Do not describe the phase as complete without that list.

---

## Exit Criteria

Phase 4 is done when all of these hold:

1. **The five screens exist and match their designs.** Timeline (12), calendar (13), day detail (14), exercise history (15), and the History tab renders `HistoryStack` rather than a placeholder.
2. **`resolveDay` is the single source of a day's status**, and it is pure — it takes no database handle and performs no lookups. The timeline, the calendar and adherence all read from it.
3. **A range costs a constant number of queries.** `historyRepo.range.test.ts` asserts that a one-day range and a 365-day range issue exactly the same four `select` calls. Spec 5.4: "Per-date querying is a defect."
4. **A past day resolves through the plan version in force then.** Asserted twice — in the resolver's unit tests across a fork, and in the repository against a real `editPlan` fork — and walked on the device.
5. **A session's targets are a snapshot.** Editing the plan does not change what the day detail prints in the target column (Task 8, Step 8).
6. **Adherence cannot exceed 100%.** Unplanned work is excluded from both halves at the SQL layer, and days that have not come due are excluded from the denominator.
7. **Volume is omitted, never zeroed,** for a session or an exercise that carries no weight (§26).
8. **No schema change.** `git diff main --stat -- src/db drizzle` is empty and the device is still at `user_version` 5.
9. **History updates without a restart.** Finishing a workout and editing the plan both invalidate `historyKeys.all`.
10. **Typecheck, lint and the full Jest suite pass**, verified with `&&` chaining, and every task was committed separately.
11. **`docs/deferred.md` is current**, and every open item on it was restated to the user at the moment completion was claimed.

---

## Self-Review

**Spec coverage.** Walking the spec's Phase 4 row — *"`dayResolver` + adherence domain, `historyRepo`, timeline, day detail, calendar, exercise history, volume, weekly adherence strip"*:

| Requirement | Task |
|---|---|
| Spec 5.4 `resolveDay`, including the session status mapping | 1 |
| Spec 5.4 batching requirement | 4 (asserted by spy) |
| Spec 5.5 adherence and completion %, unplanned excluded | 2, 4 |
| §22 History timeline | 6 |
| §23 Calendar | 7 |
| §24 Exercise history | 3, 5, 9 |
| §26 Volume, omitted for bodyweight | 3, 4, 8, 9 |
| §27 Adherence metrics and the weekly strip | 2, 6 |
| §16 Set-level results, over a past day | 8 |
| Success criterion 9 — change the routine without corrupting history | 4, 8, 10 |
| §25 progression charts | **deliberately out of scope** — spec section 12 defers them; design 15 says so in its own hint text. |
| §28 planned-vs-actual dashboard | **deliberately out of scope** — spec section 12. |

**Placeholder scan.** Every code step carries the actual code. Three screens are created as one-line placeholders in Task 6 and replaced in Tasks 7, 8 and 9 — that is deliberate sequencing, stated at the point it happens, so each task is independently runnable rather than a TODO.

**Type consistency.** Checked across tasks:

- `ResolvedDay` (Task 1) is the return type of `getDayRange` and `getDay` (Task 4), the input to `summarizeAdherence` (Task 2), `buildCalendarCells` (Task 7) and `DayCard` (Task 6). Same shape throughout.
- `ResolverSession.plannedSets` / `.completedSets` exclude unplanned work in Task 1's doc comment and in Task 4's SQL. Task 2 relies on that and says so.
- `ProgressSession` (Task 3) is what Task 5 builds and `summarizeProgress` consumes; `SessionProgress` — with `volume` and `topWeight` — is what Task 9 renders.
- `ExerciseProgress.bestSet` is `BestSet | null`; Task 9 narrows before rendering.
- `historyKeys` gains `session` in Task 8 rather than being redefined.
- `DayStatus` has exactly six members, and Tasks 6, 7 and 8 each handle all six — `chipFor`, `metaFor`, `nameColorFor`, `TONE`, `SPOKEN`, `emptyMessageFor`.

**Two judgement calls, stated so they are not reversed by accident:**

1. **Adherence counts only days that have come due.** A Friday still ahead is not a workout you missed. Task 2 tests it explicitly.
2. **A weekday left empty and never marked as rest resolves to `no_plan`, not `missed`.** The spec's pseudocode reads `else if date < today → missed`, which would report a day that asked nothing of you as a failure. Task 1 tests it and says why.

**One thing this phase cannot test.** The calendar grid's seven-column layout is invisible to Jest — RNTL renders no layout. Task 7, Step 8 demonstrates that a broken grid keeps the suite green, and Task 10, Step 4 puts "seven cells per row" in the device pass. This is the same class of defect as Phase 2's row spacing, which shipped.

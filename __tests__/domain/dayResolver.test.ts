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
        {
          weekday: 0,
          name: 'Monday',
          isRestDay: false,
          exerciseCount: 0,
          setCount: 0,
        },
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
      restDay(1),
      restDay(2),
      restDay(3),
      restDay(4),
      restDay(5),
      restDay(6),
    ],
  });
  const newVersion = version({
    id: 'v2',
    effectiveFrom: AUG(19),
    effectiveTo: null,
    days: [
      restDay(0),
      trainingDay(1, 'Upper Day'),
      trainingDay(2, 'Fork Day'),
      restDay(3),
      restDay(4),
      restDay(5),
      restDay(6),
    ],
  });
  // Today sits after every date under test, so a training day that was not
  // trained reads as missed rather than as still ahead.
  const both = ctx({versions: [oldVersion, newVersion], today: AUG(31)});

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
    // The 19th is the boundary itself. The old version rested on a Wednesday
    // and the new one trains, so the name proves which side answered — and a
    // `<=` here would silently hand the day back to the closed version.
    expect(resolveDay(AUG(19), both).name).toBe('Fork Day');
    expect(resolveDay(AUG(19), both).status).toBe('missed');
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

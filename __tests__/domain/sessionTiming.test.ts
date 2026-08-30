import {sessionTiming} from '@/domain/sessionTiming';
import {formatRest} from '@/domain/format';
import type {Session, SessionSet} from '@/repositories/sessionRepo';

const set = (completedAt: number | null): SessionSet => ({
  id: `s${completedAt}`,
  setNumber: 1,
  targetReps: 10,
  targetWeight: null,
  actualReps: completedAt === null ? null : 10,
  actualWeight: null,
  status: completedAt === null ? 'skipped' : 'completed',
  isUnplanned: false,
  completedAt,
});

const session = (
  stamps: Array<number | null>,
  completedAt: number | null = null,
): Session =>
  ({
    id: 'ws',
    date: 0,
    dayName: 'Push Day',
    status: completedAt === null ? 'in_progress' : 'completed',
    startedAt: 0,
    completedAt,
    exercises: [
      {
        id: 'pe',
        exerciseId: 'bench',
        name: 'Bench Press',
        weightApplicable: true,
        status: 'pending',
        notes: null,
        orderIndex: 0,
        substitutedFromExerciseId: null,
        plannedExerciseId: null,
        sets: stamps.map(set),
      },
    ],
  } as unknown as Session);

const MIN = 60_000;

describe('sessionTiming', () => {
  it('spans the first recorded set to the last', () => {
    const timing = sessionTiming(session([0, 2 * MIN, 5 * MIN]));
    expect(timing.working).toBe(5 * MIN);
    expect(timing.recorded).toBe(3);
  });

  /**
   * You can record set 3 before set 2 — the rail, the peek and the edge taps
   * all allow it — and a span taken in row order would come out negative.
   */
  it('sorts the timestamps before measuring', () => {
    const timing = sessionTiming(session([5 * MIN, 0, 2 * MIN]));
    expect(timing.working).toBe(5 * MIN);
  });

  it('takes the median gap, not the mean', () => {
    // 1, 1, 20 minutes: a mean would call this a 7-minute rest.
    const timing = sessionTiming(session([0, MIN, 2 * MIN, 22 * MIN]));
    expect(timing.medianRest).toBe(MIN);
    expect(timing.longestRest).toBe(20 * MIN);
  });

  it('averages the middle two on an even number of gaps', () => {
    const timing = sessionTiming(session([0, MIN, 3 * MIN, 4 * MIN, 8 * MIN]));
    // gaps: 1, 2, 1, 4 -> sorted 1, 1, 2, 4 -> median 1.5
    expect(timing.medianRest).toBe(1.5 * MIN);
  });

  it('has no span or rest with a single recorded set', () => {
    const timing = sessionTiming(session([3 * MIN, null, null]));
    expect(timing.working).toBeNull();
    expect(timing.medianRest).toBeNull();
    expect(timing.recorded).toBe(1);
  });

  it('has no span at all when nothing was recorded', () => {
    const timing = sessionTiming(session([null, null]));
    expect(timing.working).toBeNull();
    expect(timing.recorded).toBe(0);
  });

  it('measures the total from start to save on a finished session', () => {
    const timing = sessionTiming(session([MIN, 9 * MIN], 30 * MIN));
    expect(timing.total).toBe(30 * MIN);
    // ...and the working span is the part you were lifting across.
    expect(timing.working).toBe(8 * MIN);
  });

  /** A session abandoned overnight never gets a completedAt. */
  it('has no total on an unfinished session, but keeps the span', () => {
    const timing = sessionTiming(session([MIN, 9 * MIN]));
    expect(timing.total).toBeNull();
    expect(timing.working).toBe(8 * MIN);
  });

  it('measures a live session against now', () => {
    const timing = sessionTiming(session([MIN]), {now: 12 * MIN});
    expect(timing.total).toBe(12 * MIN);
  });
});

describe('formatRest', () => {
  it('keeps seconds where whole minutes would flatten the difference', () => {
    expect(formatRest(92_000)).toBe('92 s');
    expect(formatRest(148_000)).toBe('2 min');
  });

  it('rounds to the nearest second', () => {
    expect(formatRest(45_400)).toBe('45 s');
  });

  it('shows zero rather than nothing', () => {
    expect(formatRest(0)).toBe('0 s');
  });
});

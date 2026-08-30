import {
  aggregateExercise,
  sessionVolume,
  completionPercent,
  countByStatus,
  type ProgressSet,
} from '@/domain/sessionProgress';

const set = (over: Partial<ProgressSet> = {}): ProgressSet => ({
  targetReps: 10,
  targetWeight: 30,
  actualReps: 10,
  actualWeight: 30,
  status: 'completed',
  isUnplanned: false,
  ...over,
});

describe('aggregateExercise', () => {
  it('sums actual and target volume across the sets', () => {
    const result = aggregateExercise([set(), set(), set()], true);
    expect(result.actualVolume).toBe(900);
    expect(result.targetVolume).toBe(900);
    expect(result.status).toBe('achieved');
  });

  it('counts completed, skipped, planned and unplanned separately', () => {
    const result = aggregateExercise(
      [
        set(),
        set({status: 'skipped', actualReps: null, actualWeight: null}),
        set({status: 'pending', actualReps: null, actualWeight: null}),
        set({
          isUnplanned: true,
          targetReps: null,
          targetWeight: null,
          actualReps: 8,
          actualWeight: 40,
        }),
      ],
      true,
    );
    expect(result.plannedSets).toBe(3);
    // One planned set completed, and one bonus set counted on its own. This
    // used to read 2, mixing the two bases against a plan-only denominator.
    expect(result.completedSets).toBe(1);
    expect(result.completedUnplannedSets).toBe(1);
    expect(result.skippedSets).toBe(1);
    expect(result.unplannedSets).toBe(1);
  });

  // §17: a skipped set is reported separately and is never counted as
  // achieved. Its target still stands, which is what drags the total below.
  it('leaves a skipped set counting against the target', () => {
    const result = aggregateExercise(
      [
        set(),
        set(),
        set({status: 'skipped', actualReps: null, actualWeight: null}),
      ],
      true,
    );
    expect(result.actualVolume).toBe(600);
    expect(result.targetVolume).toBe(900);
    expect(result.status).toBe('below');
  });

  it('counts bonus work towards actual volume but not towards the target', () => {
    const result = aggregateExercise(
      [
        set(),
        set({
          isUnplanned: true,
          targetReps: null,
          targetWeight: null,
          actualReps: 10,
          actualWeight: 30,
        }),
      ],
      true,
    );
    expect(result.actualVolume).toBe(600);
    expect(result.targetVolume).toBe(300);
    expect(result.status).toBe('exceeded');
  });

  // §26: volume is omitted entirely for bodyweight work, never recorded as
  // zero. A zero would average into progression charts as a real number.
  it('omits volume for an exercise that carries no weight', () => {
    const result = aggregateExercise(
      [
        set({targetWeight: null, actualWeight: null}),
        set({targetWeight: null, actualWeight: null, actualReps: 12}),
      ],
      false,
    );
    expect(result.actualVolume).toBeNull();
    expect(result.targetVolume).toBeNull();
    expect(result.actualReps).toBe(22);
    expect(result.targetReps).toBe(20);
    expect(result.status).toBe('exceeded');
  });

  it('judges a bodyweight exercise on reps alone', () => {
    const short = aggregateExercise(
      [
        set({targetWeight: null, actualWeight: null, actualReps: 8}),
        set({targetWeight: null, actualWeight: null, actualReps: 8}),
      ],
      false,
    );
    expect(short.status).toBe('below');
  });

  it('handles an exercise with nothing recorded at all', () => {
    const result = aggregateExercise(
      [
        set({status: 'pending', actualReps: null, actualWeight: null}),
        set({status: 'pending', actualReps: null, actualWeight: null}),
      ],
      true,
    );
    expect(result.completedSets).toBe(0);
    expect(result.actualVolume).toBe(0);
    expect(result.status).toBe('below');
  });

  it('survives an empty set list', () => {
    const result = aggregateExercise([], true);
    expect(result.plannedSets).toBe(0);
    expect(result.actualVolume).toBe(0);
    expect(result.status).toBe('achieved');
  });
});

describe('sessionVolume', () => {
  it('adds up every weighted set that was completed', () => {
    expect(
      sessionVolume([
        {sets: [set(), set()], weightApplicable: true},
        {
          sets: [set({actualWeight: 20, actualReps: 5})],
          weightApplicable: true,
        },
      ]),
    ).toBe(700);
  });

  it('leaves bodyweight exercises out of the total entirely', () => {
    expect(
      sessionVolume([
        {sets: [set()], weightApplicable: true},
        {
          sets: [set({targetWeight: null, actualWeight: null})],
          weightApplicable: false,
        },
      ]),
    ).toBe(300);
  });

  it('ignores sets that were never completed', () => {
    expect(
      sessionVolume([
        {
          sets: [
            set(),
            set({status: 'skipped', actualReps: null, actualWeight: null}),
          ],
          weightApplicable: true,
        },
      ]),
    ).toBe(300);
  });
});

describe('completionPercent', () => {
  it('is the share of planned sets that were completed', () => {
    expect(
      completionPercent([
        set(),
        set(),
        set({status: 'skipped', actualReps: null, actualWeight: null}),
      ]),
    ).toBe(67);
  });

  // §19 and spec 5.5: bonus work is excluded from both halves of the fraction,
  // so a workout can never read above 100%.
  it('cannot exceed one hundred percent however much extra is done', () => {
    expect(
      completionPercent([
        set(),
        set(),
        set({
          isUnplanned: true,
          targetReps: null,
          targetWeight: null,
        }),
        set({
          isUnplanned: true,
          targetReps: null,
          targetWeight: null,
        }),
      ]),
    ).toBe(100);
  });

  it('counts a skipped set in the denominator only', () => {
    expect(
      completionPercent([
        set(),
        set({status: 'skipped', actualReps: null, actualWeight: null}),
      ]),
    ).toBe(50);
  });

  // A fully ad-hoc workout planned nothing, so there is no percentage of a
  // plan to report. Zero would read as total failure for a session where
  // everything went right.
  it('has no answer when nothing was planned', () => {
    expect(
      completionPercent([
        set({isUnplanned: true, targetReps: null, targetWeight: null}),
      ]),
    ).toBeNull();
    expect(completionPercent([])).toBeNull();
  });
});

describe('countByStatus', () => {
  it('breaks the session down the way the finish summary reads it', () => {
    expect(
      countByStatus([
        set(),
        set(),
        set({actualReps: 12}),
        set({actualReps: 8}),
        set({status: 'skipped', actualReps: null, actualWeight: null}),
      ]),
    ).toEqual({achieved: 2, exceeded: 1, below: 1, skipped: 1});
  });

  it('leaves bonus sets out of the verdict counts', () => {
    expect(
      countByStatus([
        set(),
        set({isUnplanned: true, targetReps: null, targetWeight: null}),
      ]),
    ).toEqual({achieved: 1, exceeded: 0, below: 0, skipped: 0});
  });

  // Found on the device at the Phase 5 gate: an exercise with one of three
  // planned sets skipped and one bonus set added reported "3 of 3 sets
  // recorded". Counting bonus work in the numerator against a denominator
  // that excludes it is the same error spec 5.5 forbids for adherence.
  it('counts completed planned sets separately from completed bonus sets', () => {
    const aggregate = aggregateExercise(
      [
        {
          targetReps: 12,
          targetWeight: 7.5,
          actualReps: 8,
          actualWeight: 10,
          status: 'completed',
          isUnplanned: false,
        },
        {
          targetReps: 12,
          targetWeight: 7.5,
          actualReps: null,
          actualWeight: null,
          status: 'skipped',
          isUnplanned: false,
        },
        {
          targetReps: 12,
          targetWeight: 7.5,
          actualReps: 12,
          actualWeight: 7.5,
          status: 'completed',
          isUnplanned: false,
        },
        {
          targetReps: null,
          targetWeight: null,
          actualReps: 12,
          actualWeight: 7.5,
          status: 'completed',
          isUnplanned: true,
        },
      ],
      true,
    );
    expect(aggregate.plannedSets).toBe(3);
    expect(aggregate.completedSets).toBe(2);
    expect(aggregate.completedUnplannedSets).toBe(1);
    expect(aggregate.skippedSets).toBe(1);
    // Bonus work still counts as lifted, which is why the volume includes it.
    expect(aggregate.actualVolume).toBe(260);
    expect(aggregate.targetVolume).toBe(270);
  });
});

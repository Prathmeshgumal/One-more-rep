import {compareSet, describeComparison} from '@/domain/setComparison';

const compare = (
  targetReps: number | null,
  targetWeight: number | null,
  actualReps: number | null,
  actualWeight: number | null,
  status: 'pending' | 'completed' | 'skipped' = 'completed',
) =>
  compareSet({targetReps, targetWeight, actualReps, actualWeight, status});

describe('compareSet', () => {
  it('calls an exact match achieved', () => {
    expect(compare(10, 30, 10, 30)).toEqual({
      status: 'achieved',
      delta: {kind: 'none', amount: 0},
    });
  });

  it('reads more reps at the same weight as exceeded', () => {
    expect(compare(10, 30, 12, 30)).toEqual({
      status: 'exceeded',
      delta: {kind: 'reps', amount: 2},
    });
  });

  it('reads fewer reps at the same weight as below', () => {
    expect(compare(10, 30, 8, 30)).toEqual({
      status: 'below',
      delta: {kind: 'reps', amount: -2},
    });
  });

  it('reads more weight at the same reps as exceeded', () => {
    expect(compare(10, 30, 10, 32.5)).toEqual({
      status: 'exceeded',
      delta: {kind: 'weight', amount: 2.5},
    });
  });

  it('reads less weight at the same reps as below', () => {
    expect(compare(10, 30, 10, 25)).toEqual({
      status: 'below',
      delta: {kind: 'weight', amount: -5},
    });
  });

  // Spec 5.1's mixed-result rule. 8 x 32.5 = 260 against a target of 300, so
  // going heavier but shorter is still below — decided by volume, for
  // consistency with §17 and §26 which already aggregate that way.
  it('decides a heavier-but-shorter set by volume', () => {
    expect(compare(10, 30, 8, 32.5)).toEqual({
      status: 'below',
      delta: {kind: 'volume', amount: -40},
    });
  });

  it('decides a lighter-but-longer set by volume', () => {
    // 12 x 27.5 = 330 against 300.
    expect(compare(10, 30, 12, 27.5)).toEqual({
      status: 'exceeded',
      delta: {kind: 'volume', amount: 30},
    });
  });

  it('calls a mixed set that lands on the same volume achieved', () => {
    // 5 x 60 = 300, exactly the target volume.
    expect(compare(10, 30, 5, 60)).toEqual({
      status: 'achieved',
      delta: {kind: 'none', amount: 0},
    });
  });

  it('counts both dimensions rising as exceeded, by volume', () => {
    // 12 x 32.5 = 390 against 300.
    expect(compare(10, 30, 12, 32.5)).toEqual({
      status: 'exceeded',
      delta: {kind: 'volume', amount: 90},
    });
  });

  it('counts both dimensions falling as below, by volume', () => {
    // 8 x 25 = 200 against 300.
    expect(compare(10, 30, 8, 25)).toEqual({
      status: 'below',
      delta: {kind: 'volume', amount: -100},
    });
  });

  // §9 and §26: a bodyweight movement has no weight to compare, so reps decide
  // it alone. Comparing against a weight of 0 would make every set "below".
  it('compares reps only when there is no target weight', () => {
    expect(compare(10, null, 12, null)).toEqual({
      status: 'exceeded',
      delta: {kind: 'reps', amount: 2},
    });
    expect(compare(10, null, 10, null)).toEqual({
      status: 'achieved',
      delta: {kind: 'none', amount: 0},
    });
    expect(compare(10, null, 7, null)).toEqual({
      status: 'below',
      delta: {kind: 'reps', amount: -3},
    });
  });

  it('ignores a weight that was recorded against no target', () => {
    // Someone held a dumbbell during a bodyweight movement. There is no target
    // weight to compare it to, so reps still decide.
    expect(compare(10, null, 10, 5)).toEqual({
      status: 'achieved',
      delta: {kind: 'none', amount: 0},
    });
  });

  it('reports a skipped set as skipped whatever else it holds', () => {
    expect(compare(10, 30, null, null, 'skipped')).toEqual({
      status: 'skipped',
      delta: {kind: 'none', amount: 0},
    });
  });

  // D3: a bonus set had nothing to aim at, so it is not a success or a
  // failure. It is extra work, and it gets a badge rather than a verdict.
  it('reports a set with no target as unplanned', () => {
    expect(compare(null, null, 12, 40)).toEqual({
      status: 'unplanned',
      delta: {kind: 'none', amount: 0},
    });
  });

  it('reports a pending set as pending-shaped, not as below', () => {
    expect(compare(10, 30, null, null, 'pending')).toEqual({
      status: 'skipped',
      delta: {kind: 'none', amount: 0},
    });
  });

  it('does not accumulate floating point noise in a weight delta', () => {
    // 32.5 - 30 is 2.5, not 2.4999999999999996.
    expect(compare(10, 30, 10, 32.5).delta.amount).toBe(2.5);
    expect(compare(10, 0.3, 10, 0.1).delta.amount).toBe(-0.2);
  });
});

describe('describeComparison', () => {
  const describe_ = (
    targetReps: number | null,
    targetWeight: number | null,
    actualReps: number | null,
    actualWeight: number | null,
    unit = 'kg',
    status: 'pending' | 'completed' | 'skipped' = 'completed',
  ) =>
    describeComparison(
      compareSet({targetReps, targetWeight, actualReps, actualWeight, status}),
      unit,
    );

  it('says even when nothing differed', () => {
    expect(describe_(10, 30, 10, 30)).toBe('even');
  });

  it('signs a rep difference', () => {
    expect(describe_(10, 30, 12, 30)).toBe('+2 reps');
    expect(describe_(10, 30, 9, 30)).toBe('−1 rep');
  });

  it('signs a weight difference in the unit it is given', () => {
    expect(describe_(10, 30, 10, 32.5)).toBe('+2.5 kg');
    expect(describe_(10, 30, 10, 25, 'lb')).toBe('−5.0 lb');
  });

  it('words a volume difference as volume', () => {
    expect(describe_(10, 30, 8, 32.5)).toBe('−40 kg vol');
  });

  it('words the states that have no numbers', () => {
    expect(describe_(10, 30, null, null, 'kg', 'skipped')).toBe('Skipped');
    expect(describe_(null, null, 12, 40)).toBe('Bonus');
  });

  // A minus sign, not a hyphen. The design sets these in tabular figures and a
  // hyphen is visibly the wrong width beside them.
  it('uses a true minus sign', () => {
    expect(describe_(10, 30, 8, 30)).toContain('−');
    expect(describe_(10, 30, 8, 30)).not.toContain('-');
  });
});

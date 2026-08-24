import {formatDuration, groupDigits, targetLine} from '@/domain/format';

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

describe('targetLine', () => {
  const set = (targetReps: number, targetWeight: number | null) => ({
    targetReps,
    targetWeight,
  });

  it('collapses uniform sets', () => {
    expect(targetLine([set(10, 60), set(10, 60), set(10, 60)], 'kg')).toBe(
      '3 × 10 · 60.0 kg',
    );
  });

  it('drops the weight for a bodyweight movement', () => {
    expect(targetLine([set(12, null), set(12, null)], 'kg')).toBe('2 × 12');
  });

  it('says varied rather than lying about a ramp', () => {
    expect(targetLine([set(12, 20), set(10, 25), set(8, 30)], 'kg')).toBe(
      '3 sets · varied',
    );
  });

  it('notices a difference in weight alone', () => {
    expect(targetLine([set(10, 20), set(10, 25)], 'kg')).toBe('2 sets · varied');
  });

  it('has something to say about no sets at all', () => {
    expect(targetLine([], 'kg')).toBe('No sets');
  });

  // The Today screen hard-coded "kg" here, which was simply wrong for anyone
  // training in pounds.
  it('uses the unit it is given', () => {
    expect(targetLine([set(10, 135)], 'lb')).toBe('1 × 10 · 135.0 lb');
  });
});

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

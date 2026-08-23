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

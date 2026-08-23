import {
  WEEKDAY_NAMES,
  WEEKDAY_ABBR,
  weekdayIndex,
  startOfLocalDay,
  isSameLocalDay,
} from '@/domain/weekday';

describe('weekday', () => {
  it('names the week starting on Monday, as the design draws it', () => {
    expect(WEEKDAY_NAMES).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    expect(WEEKDAY_ABBR).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
  });

  // The single place Date.getDay()'s Sunday-first convention is converted.
  // Getting this wrong puts every workout on the wrong day.
  it('maps Monday to 0 and Sunday to 6', () => {
    expect(weekdayIndex(new Date(2026, 7, 17))).toBe(0); // Mon 17 Aug 2026
    expect(weekdayIndex(new Date(2026, 7, 18))).toBe(1);
    expect(weekdayIndex(new Date(2026, 7, 22))).toBe(5); // Saturday
    expect(weekdayIndex(new Date(2026, 7, 23))).toBe(6); // Sunday
  });

  it('covers a whole week without gaps or repeats', () => {
    const indices = [17, 18, 19, 20, 21, 22, 23].map(d =>
      weekdayIndex(new Date(2026, 7, d)),
    );
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('truncates to local midnight', () => {
    const noon = new Date(2026, 7, 17, 12, 30, 45, 123).getTime();
    const midnight = new Date(2026, 7, 17, 0, 0, 0, 0).getTime();
    expect(startOfLocalDay(noon)).toBe(midnight);
  });

  it('treats two times on the same calendar day as the same day', () => {
    const morning = new Date(2026, 7, 17, 7, 0).getTime();
    const night = new Date(2026, 7, 17, 23, 59).getTime();
    const nextDay = new Date(2026, 7, 18, 0, 1).getTime();
    expect(isSameLocalDay(morning, night)).toBe(true);
    expect(isSameLocalDay(night, nextDay)).toBe(false);
  });
});

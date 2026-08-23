import {
  WEEKDAY_NAMES,
  WEEKDAY_ABBR,
  weekdayIndex,
  startOfLocalDay,
  isSameLocalDay,
  addLocalDays,
  eachLocalDay,
  startOfLocalWeek,
  startOfLocalMonth,
  endOfLocalMonth,
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
      AUG(17),
      AUG(18),
      AUG(19),
      AUG(20),
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

/**
 * The week, Monday first, as §4 lists it and the design draws it.
 *
 * The index into these arrays is the `weekday` value stored in `plan_days`.
 */
export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const WEEKDAY_ABBR = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const;

/**
 * The one place JavaScript's Sunday-first week is converted to ours.
 *
 * `Date.getDay()` returns 0 for Sunday; we store 0 for Monday. Calling
 * `getDay()` anywhere else in the codebase is a bug — a day out means every
 * workout lands on the wrong day, silently.
 */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** Local midnight for the day containing `ms`. */
export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Whether two instants fall on the same calendar day, in the device's own
 * timezone — which is the only timezone this app has ever needed to care
 * about, since it records what someone did at a gym they were standing in.
 */
export function isSameLocalDay(a: number, b: number): boolean {
  return startOfLocalDay(a) === startOfLocalDay(b);
}

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

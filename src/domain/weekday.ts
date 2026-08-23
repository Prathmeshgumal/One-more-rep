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

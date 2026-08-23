import {WEEKDAY_ABBR, weekdayIndex, weekdayName} from './weekday';

/**
 * Dates are written out rather than run through `Intl` or `toLocaleDateString`.
 *
 * Hermes ships without full ICU data, so `toLocaleDateString` silently returns
 * a different string on a device than it does under Jest in Node — which is
 * exactly the class of bug that only shows up after the screenshot is approved.
 */
export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const monthOf = (ms: number): string =>
  MONTH_NAMES[new Date(ms).getMonth()] ?? '';

/** "Fri 21 August" — the timeline row. */
export function formatDayLabel(ms: number): string {
  const date = new Date(ms);
  return `${WEEKDAY_ABBR[weekdayIndex(date)] ?? ''} ${date.getDate()} ${monthOf(
    ms,
  )}`;
}

/** "Friday 21 August" — the day-detail kicker. */
export function formatLongDate(ms: number): string {
  const date = new Date(ms);
  return `${weekdayName(weekdayIndex(date))} ${date.getDate()} ${monthOf(ms)}`;
}

/** "21 August" — an exercise-history session card. */
export function formatShortDate(ms: number): string {
  return `${new Date(ms).getDate()} ${monthOf(ms)}`;
}

export function formatMonthTitle(ms: number): string {
  return monthOf(ms);
}

export function formatYear(ms: number): string {
  return String(new Date(ms).getFullYear());
}

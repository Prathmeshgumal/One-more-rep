import type {ResolvedDay} from './dayResolver';
import {addLocalDays, startOfLocalDay, weekdayIndex} from './weekday';

export type CalendarCell =
  | {kind: 'pad'; label: string}
  | {kind: 'day'; label: string; day: ResolvedDay; isToday: boolean};

/**
 * Lays a month out as a Monday-first grid (§23).
 *
 * The leading pad shows the previous month's trailing dates rather than blank
 * squares, exactly as the design draws it — an empty corner reads as a bug,
 * and a greyed 31st reads as a calendar.
 */
export function buildCalendarCells(
  days: readonly ResolvedDay[],
  today: number,
): CalendarCell[] {
  const first = days[0];
  if (!first) {
    return [];
  }

  const cells: CalendarCell[] = [];
  const lead = weekdayIndex(new Date(first.date));
  for (let back = lead; back > 0; back -= 1) {
    cells.push({
      kind: 'pad',
      label: String(new Date(addLocalDays(first.date, -back)).getDate()),
    });
  }

  const todayMidnight = startOfLocalDay(today);
  for (const day of days) {
    cells.push({
      kind: 'day',
      label: String(new Date(day.date).getDate()),
      day,
      isToday: day.date === todayMidnight,
    });
  }

  return cells;
}

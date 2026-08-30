import {buildCalendarCells} from '@/domain/calendarGrid';
import type {ResolvedDay} from '@/domain/dayResolver';
import {eachLocalDay, weekdayIndex} from '@/domain/weekday';

const AUG = (day: number) => new Date(2026, 7, day).getTime();

/** A whole month of plain days — the grid only reads dates and status. */
const august: ResolvedDay[] = eachLocalDay(AUG(1), AUG(31)).map(date => ({
  date,
  weekday: weekdayIndex(new Date(date)),
  status: 'rest',
  name: 'Rest day',
  sessionId: null,
  exerciseCount: 0,
  plannedSets: 0,
  completedSets: 0,
  skippedSets: 0,
  volume: null,
}));

describe('buildCalendarCells', () => {
  it('returns nothing for an empty month', () => {
    expect(buildCalendarCells([], AUG(22))).toEqual([]);
  });

  it('pads the leading gap with the previous month, Monday first', () => {
    const cells = buildCalendarCells(august, AUG(22));
    // 1 August 2026 is a Saturday, which is index 5 in a Monday-first week.
    const pads = cells.filter(c => c.kind === 'pad');
    expect(pads).toHaveLength(5);
    expect(pads.map(c => c.label)).toEqual(['27', '28', '29', '30', '31']);
  });

  it('adds one cell per day of the month, in order', () => {
    const cells = buildCalendarCells(august, AUG(22));
    const days = cells.filter(c => c.kind === 'day');
    expect(days).toHaveLength(31);
    expect(days[0]!.label).toBe('1');
    expect(days[30]!.label).toBe('31');
  });

  it('marks exactly one cell as today', () => {
    const cells = buildCalendarCells(august, AUG(22));
    const today = cells.filter(c => c.kind === 'day' && c.isToday);
    expect(today).toHaveLength(1);
    expect(today[0]!.label).toBe('22');
  });

  it('marks no cell as today when today is in another month', () => {
    const cells = buildCalendarCells(august, new Date(2026, 8, 3).getTime());
    expect(cells.some(c => c.kind === 'day' && c.isToday)).toBe(false);
  });

  it('needs no pad when the month begins on a Monday', () => {
    // June 2026 begins on a Monday.
    const june: ResolvedDay[] = eachLocalDay(
      new Date(2026, 5, 1).getTime(),
      new Date(2026, 5, 30).getTime(),
    ).map(date => ({
      ...august[0]!,
      date,
      weekday: weekdayIndex(new Date(date)),
    }));
    expect(
      buildCalendarCells(june, AUG(22)).filter(c => c.kind === 'pad'),
    ).toEqual([]);
  });
});

import {summarizeAdherence} from '@/domain/adherence';
import type {DayStatus, ResolvedDay} from '@/domain/dayResolver';

const AUG = (day: number) => new Date(2026, 7, day).getTime();

let nextDate = 17;
const day = (
  status: DayStatus,
  over: Partial<ResolvedDay> = {},
): ResolvedDay => ({
  date: AUG(nextDate++),
  weekday: 0,
  status,
  name: 'Push Day',
  sessionId: status === 'completed' || status === 'partial' ? 's' : null,
  exerciseCount: 5,
  plannedSets: 15,
  completedSets: status === 'completed' ? 15 : 0,
  skippedSets: 0,
  volume: null,
  ...over,
});

beforeEach(() => {
  nextDate = 17;
});

describe('summarizeAdherence', () => {
  it('reports nothing rather than zero percent for an empty range', () => {
    const a = summarizeAdherence([]);
    expect(a.plannedWorkouts).toBe(0);
    expect(a.percent).toBeNull();
  });

  it('counts four of five workouts as eighty percent', () => {
    const a = summarizeAdherence([
      day('completed'),
      day('completed'),
      day('completed'),
      day('completed'),
      day('missed'),
      day('rest'),
      day('rest'),
    ]);
    expect(a.plannedWorkouts).toBe(5);
    expect(a.completedWorkouts).toBe(4);
    expect(a.missedWorkouts).toBe(1);
    expect(a.restDays).toBe(2);
    expect(a.percent).toBe(80);
  });

  it('counts a partial workout separately from a completed one', () => {
    const a = summarizeAdherence([
      day('completed'),
      day('partial', {completedSets: 9}),
    ]);
    expect(a.completedWorkouts).toBe(1);
    expect(a.partialWorkouts).toBe(1);
    // A workout cut short still counted as owed, so it drags the number down.
    expect(a.plannedWorkouts).toBe(2);
    expect(a.percent).toBe(50);
  });

  // The rule that decides whether the number is fair mid-week.
  it('excludes days that have not happened yet from both halves', () => {
    const a = summarizeAdherence([
      day('completed'),
      day('completed'),
      day('upcoming'),
      day('upcoming'),
      day('upcoming'),
    ]);
    expect(a.plannedWorkouts).toBe(2);
    expect(a.upcomingWorkouts).toBe(3);
    expect(a.percent).toBe(100);
    expect(a.plannedSets).toBe(30);
  });

  it('excludes days with no plan entirely', () => {
    const a = summarizeAdherence([
      day('completed'),
      day('no_plan', {plannedSets: 0}),
    ]);
    expect(a.plannedWorkouts).toBe(1);
    expect(a.percent).toBe(100);
  });

  it('adds up planned and completed sets over the due days only', () => {
    const a = summarizeAdherence([
      day('completed', {plannedSets: 15, completedSets: 15}),
      day('partial', {plannedSets: 12, completedSets: 9, skippedSets: 3}),
      day('missed', {plannedSets: 18, completedSets: 0}),
      day('upcoming', {plannedSets: 15, completedSets: 0}),
    ]);
    expect(a.plannedSets).toBe(45);
    expect(a.completedSets).toBe(24);
    expect(a.skippedSets).toBe(3);
  });

  // Spec 5.5: bonus sets are excluded upstream, in the session aggregate, so
  // the arithmetic here can never produce more than 100%.
  it('never reports more than a hundred percent of the sets planned', () => {
    const a = summarizeAdherence([
      day('completed', {plannedSets: 15, completedSets: 15}),
    ]);
    expect(a.setPercent).toBe(100);
  });

  it('reports no set percentage when nothing was planned', () => {
    const a = summarizeAdherence([day('rest', {plannedSets: 0})]);
    expect(a.setPercent).toBeNull();
  });

  it('totals volume across the range, treating an unmeasured day as zero', () => {
    const a = summarizeAdherence([
      day('completed', {volume: 4280}),
      day('completed', {volume: null}),
      day('missed'),
    ]);
    expect(a.volume).toBe(4280);
  });
});

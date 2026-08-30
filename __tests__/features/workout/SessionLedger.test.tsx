import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {SessionLedger} from '@/features/workout/SessionLedger';
import {SET_LINE_HEIGHT} from '@/ui/SetLine';
import {EXERCISE_LINE_HEIGHT} from '@/ui/ExerciseLine';
import type {Session, SessionSet} from '@/repositories/sessionRepo';

let seq = 0;
const set = (over: Partial<SessionSet> = {}): SessionSet => ({
  id: `set-${++seq}`,
  setNumber: 1,
  targetReps: 12,
  targetWeight: null,
  actualReps: null,
  actualWeight: null,
  status: 'pending',
  isUnplanned: false,
  completedAt: null,
  ...over,
});

/** The real Sunday session, which is what every figure in the design was
 *  measured against. */
const sunday = (): Session => ({
  id: 'session-1',
  date: 0,
  dayName: 'Chest',
  status: 'in_progress',
  startedAt: 0,
  completedAt: null,
  planVersionId: null,
  planDayId: null,
  exercises: [
    {
      id: 'pe-1',
      exerciseId: 'e1',
      name: '3/4 Sit-Up',
      equipment: null,
      weightApplicable: false,
      plannedExerciseId: null,
      orderIndex: 0,
      status: 'pending',
      notes: null,
      substitutedFromName: null,
      sets: [
        set({status: 'completed', actualReps: 12}),
        set({status: 'completed', actualReps: 9}),
        set({status: 'completed', actualReps: 12}),
        set({
          status: 'completed',
          actualReps: 11,
          targetReps: null,
          isUnplanned: true,
        }),
        set(),
      ],
    },
    {
      id: 'pe-2',
      exerciseId: 'e2',
      name: '90/90 Hamstring',
      equipment: null,
      weightApplicable: false,
      plannedExerciseId: null,
      orderIndex: 1,
      status: 'skipped',
      notes: null,
      substitutedFromName: null,
      sets: [
        set({status: 'skipped'}),
        set({status: 'skipped'}),
        set({status: 'skipped'}),
      ],
    },
    {
      id: 'pe-3',
      exerciseId: 'e3',
      name: 'Ab Crunch Machine',
      equipment: null,
      weightApplicable: true,
      plannedExerciseId: null,
      orderIndex: 2,
      status: 'completed',
      notes: null,
      substitutedFromName: null,
      sets: [
        set({
          targetReps: 10,
          targetWeight: 20,
          status: 'completed',
          actualReps: 10,
          actualWeight: 20,
        }),
        set({
          targetReps: 10,
          targetWeight: 20,
          status: 'completed',
          actualReps: 10,
          actualWeight: 20,
        }),
        set({
          targetReps: 10,
          targetWeight: 20,
          status: 'completed',
          actualReps: 10,
          actualWeight: 20,
        }),
      ],
    },
  ],
});

const wrap = (node: React.ReactElement) =>
  render(<ThemeProvider>{node}</ThemeProvider>);

describe('SessionLedger', () => {
  it('lists every exercise and every set', async () => {
    await wrap(<SessionLedger session={sunday()} unit="kg" />);
    expect(screen.getByText('3/4 Sit-Up')).toBeTruthy();
    expect(screen.getByText('90/90 Hamstring')).toBeTruthy();
    expect(screen.getByText('Ab Crunch Machine')).toBeTruthy();
    expect(screen.getAllByText('skipped')).toHaveLength(3);
    expect(screen.getAllByText('10 · 20 kg')).toHaveLength(3);
  });

  /**
   * The claim the whole redesign rests on. Eleven sets and three exercises
   * have to fit the 720dp between the header and the pinned bar, or the
   * screen is back to scrolling and nothing was gained.
   */
  it('fits the whole session in the viewport', () => {
    const session = sunday();
    const sets = session.exercises.reduce((n, e) => n + e.sets.length, 0);
    const height =
      session.exercises.length * EXERCISE_LINE_HEIGHT + sets * SET_LINE_HEIGHT;

    expect(sets).toBe(11);
    expect(height).toBe(580);
    // 873dp screen, less status bar, header and the 96dp pinned bar.
    expect(height).toBeLessThan(720);
  });

  // A bonus set is a row like any other, so it counts on both sides. Leaving
  // it out of the denominator printed 4 / 4 on an exercise whose fifth set was
  // still pending -- a tally that said finished over a ledger that said not.
  it('counts every set in the tally, bonus work included', async () => {
    await wrap(<SessionLedger session={sunday()} unit="kg" />);
    expect(screen.getByText('4 / 5')).toBeTruthy();
    expect(screen.getByText('0 / 3')).toBeTruthy();
    expect(screen.getByText('3 / 3')).toBeTruthy();
  });

  it('marks the live set and the one being amended', async () => {
    const session = sunday();
    const live = session.exercises[0]!.sets[4]!.id;
    const amending = session.exercises[0]!.sets[1]!.id;
    await wrap(
      <SessionLedger
        session={session}
        unit="kg"
        liveSetId={live}
        amendingSetId={amending}
      />,
    );
    expect(screen.getByText('now lifting')).toBeTruthy();
    expect(screen.getByText('correcting…')).toBeTruthy();
  });

  it('reports which set was chosen, and which exercise it belongs to', async () => {
    const session = sunday();
    const onSelectSet = jest.fn();
    await wrap(
      <SessionLedger session={session} unit="kg" onSelectSet={onSelectSet} />,
    );
    await fireEvent.press(screen.getByLabelText('Set 2, 9 reps'));
    expect(onSelectSet).toHaveBeenCalledWith(
      expect.objectContaining({actualReps: 9}),
      'pe-1',
    );
  });

  it('offers the exercise menu only when there is something behind it', async () => {
    const view = await wrap(<SessionLedger session={sunday()} unit="kg" />);
    expect(view.queryByLabelText('Actions for 3/4 Sit-Up')).toBeNull();

    const onPressExerciseMenu = jest.fn();
    await wrap(
      <SessionLedger
        session={sunday()}
        unit="kg"
        onPressExerciseMenu={onPressExerciseMenu}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Actions for 3/4 Sit-Up'));
    expect(onPressExerciseMenu).toHaveBeenCalledWith('pe-1');
  });
});

import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {ExerciseActions} from '@/features/workout/ExerciseActions';
import type {SessionExercise, SessionSet} from '@/repositories/sessionRepo';

const set = (n: number, over: Partial<SessionSet> = {}): SessionSet => ({
  id: `s${n}`,
  setNumber: n,
  targetReps: 10,
  targetWeight: 60,
  actualReps: null,
  actualWeight: null,
  status: 'pending',
  isUnplanned: false,
  completedAt: null,
  ...over,
});

const exercise = (over: Partial<SessionExercise> = {}): SessionExercise => ({
  id: 'pex1',
  exerciseId: 'bench',
  name: 'Bench Press',
  equipment: 'barbell',
  weightApplicable: true,
  plannedExerciseId: 'pe1',
  orderIndex: 0,
  status: 'pending',
  notes: null,
  substitutedFromName: null,
  sets: [set(1), set(2), set(3)],
  ...over,
});

const done = (n: number) =>
  set(n, {status: 'completed', actualReps: 10, actualWeight: 60});

const renderActions = (
  props: Partial<React.ComponentProps<typeof ExerciseActions>> = {},
) =>
  render(
    <ThemeProvider>
      <ExerciseActions
        visible
        exercise={exercise()}
        set={set(1)}
        setNumber={1}
        isFirst={false}
        isLast={false}
        onClose={jest.fn()}
        onAddSet={jest.fn()}
        onRemoveSet={jest.fn()}
        onFinish={jest.fn()}
        onSwap={jest.fn()}
        onNote={jest.fn()}
        onRemove={jest.fn()}
        onMove={jest.fn()}
        {...props}
      />
    </ThemeProvider>,
  );

describe('ExerciseActions', () => {
  it('offers every per-exercise action on a planned exercise', async () => {
    const view = await renderActions();
    // Everything an exercise can do is behind this one glyph now, which is
    // the price a focus flow pays: there is nowhere else to put any of it.
    for (const label of [
      'Add a set',
      'Remove set 1',
      'Skip this exercise',
      'Swap for another exercise',
      'Add a note',
      'Move up',
      'Move down',
      'Remove from this workout',
    ]) {
      expect(view.getByLabelText(label)).toBeTruthy();
    }
  });

  // U7. The recorded sets belong to the old movement.
  it('explains why swap is unavailable rather than hiding it', async () => {
    const onSwap = jest.fn();
    const view = await renderActions({
      exercise: exercise({sets: [done(1), set(2), set(3)]}),
      onSwap,
    });
    const row = view.getByLabelText('Swap for another exercise');
    expect(row.props.accessibilityState.disabled).toBe(true);
    expect(view.getByText(/already recorded/i)).toBeTruthy();
    await fireEvent.press(row);
    expect(onSwap).not.toHaveBeenCalled();
  });

  // U8. Erasing a planned exercise would shrink the denominator of "% of plan".
  it('refuses to remove a planned exercise, and says to skip it', async () => {
    const view = await renderActions();
    const row = view.getByLabelText('Remove from this workout');
    expect(row.props.accessibilityState.disabled).toBe(true);
    expect(view.getByText(/This exercise is in the plan/i)).toBeTruthy();
  });

  it('allows removing an exercise added on the day with nothing recorded', async () => {
    const onRemove = jest.fn();
    const view = await renderActions({
      exercise: exercise({plannedExerciseId: null}),
      onRemove,
    });
    const row = view.getByLabelText('Remove from this workout');
    expect(row.props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(row);
    expect(onRemove).toHaveBeenCalled();
  });

  it('refuses to remove one that has recorded something', async () => {
    const view = await renderActions({
      exercise: exercise({
        plannedExerciseId: null,
        sets: [done(1), set(2)],
      }),
    });
    expect(
      view.getByLabelText('Remove from this workout').props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it('cannot move past either end of the list', async () => {
    const top = await renderActions({isFirst: true});
    expect(
      top.getByLabelText('Move up').props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      top.getByLabelText('Move down').props.accessibilityState.disabled,
    ).toBe(false);

    const bottom = await renderActions({isLast: true});
    expect(
      bottom.getByLabelText('Move down').props.accessibilityState.disabled,
    ).toBe(true);
  });

  /**
   * U11. Finishing and skipping are different acts, and the difference is
   * whether anything actually happened. Calling a part-done exercise skipped
   * understates the work, which is how it came back from the phone.
   */
  it('offers to finish only once something has been recorded', async () => {
    const untouched = await renderActions();
    expect(untouched.getByLabelText('Skip this exercise')).toBeTruthy();

    const started = await renderActions({
      exercise: exercise({sets: [done(1), set(2)]}),
    });
    expect(started.getByLabelText('Finish this exercise')).toBeTruthy();
  });

  // With nothing left to close it could only do nothing -- which is exactly
  // how it was reported as "Finish this exercise isn't working".
  it('explains itself rather than doing nothing once every set is decided', async () => {
    const view = await renderActions({
      exercise: exercise({sets: [done(1), done(2), done(3)]}),
    });
    const row = view.getByLabelText('Finish this exercise');
    expect(row.props.accessibilityState.disabled).toBe(true);
    expect(view.getByText('Every set is already decided')).toBeTruthy();
  });

  it('names the note action for what it will do', async () => {
    const fresh = await renderActions();
    expect(fresh.getByLabelText('Add a note')).toBeTruthy();

    const written = await renderActions({
      exercise: exercise({notes: 'felt heavy'}),
    });
    expect(written.getByLabelText('Edit the note')).toBeTruthy();
  });

  /**
   * U10, and the rule is the repository's. Erasing a *planned* set would
   * shrink the denominator and flatter the workout; erasing a bonus set only
   * ever reduces the credit claimed.
   */
  it('refuses to remove a planned set, and says to skip it', async () => {
    const view = await renderActions();
    const row = view.getByLabelText('Remove set 1');
    expect(row.props.accessibilityState.disabled).toBe(true);
    expect(view.getByText(/This set is in the plan/i)).toBeTruthy();
  });

  it('removes a bonus set, recorded or not', async () => {
    const bonus = set(4, {isUnplanned: true});
    const view = await renderActions({
      exercise: exercise({sets: [set(1), set(2), set(3), bonus]}),
      set: bonus,
      setNumber: 4,
    });
    expect(
      view.getByLabelText('Remove set 4').props.accessibilityState.disabled,
    ).toBe(false);
  });

  // An exercise with no sets is not an exercise.
  it('refuses to remove the only set on an exercise', async () => {
    const only = set(1, {isUnplanned: true});
    const view = await renderActions({
      exercise: exercise({sets: [only]}),
      set: only,
    });
    expect(
      view.getByLabelText('Remove set 1').props.accessibilityState.disabled,
    ).toBe(true);
  });

  it('passes the direction when moving', async () => {
    const onMove = jest.fn();
    const view = await renderActions({onMove});
    await fireEvent.press(view.getByLabelText('Move down'));
    expect(onMove).toHaveBeenCalledWith(1);
  });
});

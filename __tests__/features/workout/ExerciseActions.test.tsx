import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {ExerciseActions} from '@/features/workout/ExerciseActions';
import type {
  SessionExercise,
  SessionSet,
} from '@/repositories/sessionRepo';

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
        isFirst={false}
        isLast={false}
        onClose={jest.fn()}
        onSwap={jest.fn()}
        onRemove={jest.fn()}
        onMove={jest.fn()}
        onSummary={jest.fn()}
        {...props}
      />
    </ThemeProvider>,
  );

describe('ExerciseActions', () => {
  it('offers swap, move and summary on a planned exercise', async () => {
    const view = await renderActions();
    for (const label of [
      'Swap this exercise',
      'Move up',
      'Move down',
      'See the summary',
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
    const row = view.getByLabelText('Swap this exercise');
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
    expect(view.getByText(/skip/i)).toBeTruthy();
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

  it('offers the summary only once something has been recorded', async () => {
    const shut = await renderActions();
    expect(
      shut.getByLabelText('See the summary').props.accessibilityState.disabled,
    ).toBe(true);

    const open = await renderActions({
      exercise: exercise({sets: [done(1), set(2)]}),
    });
    expect(
      open.getByLabelText('See the summary').props.accessibilityState.disabled,
    ).toBe(false);
  });

  it('passes the direction when moving', async () => {
    const onMove = jest.fn();
    const view = await renderActions({onMove});
    await fireEvent.press(view.getByLabelText('Move down'));
    expect(onMove).toHaveBeenCalledWith(1);
  });
});

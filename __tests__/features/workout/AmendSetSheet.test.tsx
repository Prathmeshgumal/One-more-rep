import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {AmendSetSheet} from '@/features/workout/AmendSetSheet';
import type {SessionSet} from '@/repositories/sessionRepo';

const recorded = (over: Partial<SessionSet> = {}): SessionSet => ({
  id: 's1',
  setNumber: 1,
  targetReps: 10,
  targetWeight: 2,
  actualReps: 10,
  actualWeight: 2,
  status: 'completed',
  isUnplanned: false,
  completedAt: 1_700_000_000_000,
  ...over,
});

const renderSheet = (
  props: Partial<React.ComponentProps<typeof AmendSetSheet>> = {},
) =>
  render(
    <ThemeProvider>
      <AmendSetSheet
        visible
        set={recorded()}
        setNumber={1}
        exerciseName="Ab Crunch Machine"
        weightApplicable
        unit="kg"
        increment={0.5}
        onSave={jest.fn()}
        onSkip={jest.fn()}
        onClose={jest.fn()}
        {...props}
      />
    </ThemeProvider>,
  );

describe('AmendSetSheet', () => {
  it('names the set it is about to change', async () => {
    const view = await renderSheet();
    expect(view.getByText('Amending a recorded set')).toBeTruthy();
    expect(view.getByText('Ab Crunch Machine · set 1')).toBeTruthy();
  });

  it('prints the target beside what was recorded against it', async () => {
    const view = await renderSheet();
    expect(view.getByText('target 10 × 2 kg · recorded as 10')).toBeTruthy();
  });

  /**
   * The bug this file exists for. `Stepper` carried `flex: 1`, which in this
   * sheet's column means `flexBasis: 0` — so both controls measured nothing
   * and drew as a pair of empty outlines with no number, no label and no
   * shoulders. There was no test on this component at all, which is how it
   * shipped. Found on the phone.
   */
  it('draws both controls with their numbers in them', async () => {
    const view = await renderSheet();

    const reps = view.getByLabelText('Reps');
    const weight = view.getByLabelText('Weight (kg)');
    expect(reps.props.value).toBe('10');
    expect(weight.props.value).toBe('2');

    // ...and the shoulders that make it a stepper rather than a text box.
    expect(view.getByLabelText('Increase Reps')).toBeTruthy();
    expect(view.getByLabelText('Decrease Weight (kg)')).toBeTruthy();
  });

  it('opens on what was recorded, not on the target', async () => {
    const view = await renderSheet({
      set: recorded({targetReps: 10, actualReps: 8}),
    });
    expect(view.getByLabelText('Reps').props.value).toBe('8');
  });

  it('saves the corrected numbers', async () => {
    const onSave = jest.fn();
    const view = await renderSheet({onSave});

    await fireEvent.press(view.getByLabelText('Increase Reps'));
    await fireEvent.press(view.getByText('Save change'));

    expect(onSave).toHaveBeenCalledWith({actualReps: 11, actualWeight: 2});
  });

  it('writes no weight on a movement that has none', async () => {
    const onSave = jest.fn();
    const view = await renderSheet({
      weightApplicable: false,
      set: recorded({targetWeight: null, actualWeight: null}),
      onSave,
    });
    expect(view.queryByLabelText('Weight (kg)')).toBeNull();

    await fireEvent.press(view.getByText('Save change'));
    expect(onSave).toHaveBeenCalledWith({actualReps: 10, actualWeight: null});
  });

  /**
   * A set recorded that should not have been. Marking it skipped is the
   * honest correction — deleting it would shrink the denominator.
   */
  it('offers to mark a recorded set skipped', async () => {
    const onSkip = jest.fn();
    const view = await renderSheet({onSkip});
    await fireEvent.press(view.getByText('Mark as skipped'));
    expect(onSkip).toHaveBeenCalled();
  });

  it('does not offer that on one that was never recorded', async () => {
    const view = await renderSheet({
      set: recorded({status: 'skipped', actualReps: null, actualWeight: null}),
    });
    expect(view.queryByText('Mark as skipped')).toBeNull();
    expect(view.getByText(/recorded as skipped/)).toBeTruthy();
  });

  it('draws nothing without a set to amend', async () => {
    const view = await renderSheet({set: null});
    expect(view.queryByText('Amending a recorded set')).toBeNull();
  });
});

import React from 'react';
import {Text} from 'react-native';
import {render, fireEvent, act} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {WorkoutExerciseCard} from '@/features/workout/WorkoutExerciseCard';
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

const renderCard = (props: Partial<React.ComponentProps<typeof WorkoutExerciseCard>> = {}) =>
  render(
    <ThemeProvider>
      <WorkoutExerciseCard
        exercise={exercise()}
        expanded={false}
        onToggle={jest.fn()}
        onLayoutY={jest.fn()}
        unit="kg"
        increment={0.5}
        {...props}
      />
    </ThemeProvider>,
  );

describe('WorkoutExerciseCard', () => {
  it('collapsed, shows the name and how far through it is', async () => {
    const view = await renderCard({
      exercise: exercise({sets: [done(1), done(2), set(3)]}),
    });
    expect(view.getByText('Bench Press')).toBeTruthy();
    expect(view.getByText('2 / 3 sets')).toBeTruthy();
  });

  // Complaint 6: what you are aiming for has to be readable without opening
  // anything, so the target survives the collapse.
  it('collapsed, still names the target', async () => {
    const view = await renderCard();
    expect(view.getByText('3 × 10 · 60.0 kg')).toBeTruthy();
  });

  it('collapsed, offers no way to record anything', async () => {
    const view = await renderCard();
    expect(view.queryByLabelText('Weight')).toBeNull();
    expect(view.queryByLabelText('Complete set')).toBeNull();
  });

  it('expanded, shows every set with its own target', async () => {
    const view = await renderCard({expanded: true});
    // Complaint 6 again, from the inside: sets 2 and 3 print their targets
    // while you are still on set 1.
    expect(view.getAllByText('target 10 × 60.0')).toHaveLength(3);
  });

  // An em dash in the number's place reads as broken rather than as empty, and
  // it wastes the one spot on the row where the target could be doing work.
  it('ghosts the target into a set that has not happened yet', async () => {
    const view = await renderCard({expanded: true});
    // Three sets, each showing 60.0 and 10 in the actual's position, greyed.
    expect(view.getAllByText('60.0')).toHaveLength(3);
    expect(view.getAllByText('10')).toHaveLength(3);
    expect(view.queryByText('—')).toBeNull();
  });

  it('leaves a bonus set blank, because it has nothing to aim at', async () => {
    const view = await renderCard({
      expanded: true,
      exercise: exercise({
        sets: [
          set(1, {isUnplanned: true, targetReps: null, targetWeight: null}),
        ],
      }),
    });
    // No target, nothing lifted before it — so nothing is suggested, and the
    // KG and REPS labels carry the meaning on their own.
    expect(view.queryByText('—')).toBeNull();
    expect(view.getByText('bonus set')).toBeTruthy();
  });

  // Reported from the device: a weight-bearing exercise planned without a
  // target weight still showed a dash, because there was no target to ghost.
  // The last weight actually lifted on this exercise is the better guess, and
  // it is the same rule the active set's pre-fill already uses (section 35).
  it('ghosts the last weight lifted when there is no target weight', async () => {
    const view = await renderCard({
      expanded: true,
      exercise: exercise({
        sets: [
          set(1, {
            targetWeight: null,
            status: 'completed',
            actualReps: 10,
            actualWeight: 40,
          }),
          set(2, {targetWeight: null}),
          set(3, {targetWeight: null}),
        ],
      }),
    });
    // Set 1 recorded at 40; sets 2 and 3 carry it forward, greyed.
    expect(view.getAllByText('40.0')).toHaveLength(3);
  });

  it('shows no dash when there is nothing at all to suggest', async () => {
    const view = await renderCard({
      expanded: true,
      exercise: exercise({
        sets: [set(1, {targetWeight: null}), set(2, {targetWeight: null})],
      }),
    });
    // Nothing planned and nothing lifted yet. The KG label carries the meaning;
    // an em dash in the number's place just reads as broken.
    expect(view.queryByText('—')).toBeNull();
  });

  it('shows what was actually lifted once a set is recorded', async () => {
    const view = await renderCard({
      expanded: true,
      exercise: exercise({
        sets: [set(1, {status: 'completed', actualReps: 8, actualWeight: 55})],
      }),
    });
    expect(view.getByText('55.0')).toBeTruthy();
    expect(view.getByText('8')).toBeTruthy();
    // Not the target — the recorded number wins its own row.
    expect(view.queryByText('60.0')).toBeNull();
  });

  it('expanded, puts the editable fields on the active set only', async () => {
    const view = await renderCard({
      expanded: true,
      activeSetId: 's1',
      activeWeight: 60,
      activeReps: 10,
      onSetWeight: jest.fn(),
      onSetReps: jest.fn(),
      onCompleteSet: jest.fn(),
    });
    expect(view.getAllByLabelText('Weight')).toHaveLength(1);
    expect(view.getAllByLabelText('Complete set')).toHaveLength(1);
  });

  it('opens when its header is tapped', async () => {
    const onToggle = jest.fn();
    const view = await renderCard({onToggle});
    await fireEvent.press(view.getByLabelText('Bench Press'));
    expect(onToggle).toHaveBeenCalled();
  });

  it('tells a screen reader whether it is open', async () => {
    const shut = await renderCard();
    expect(
      shut.getByLabelText('Bench Press').props.accessibilityState.expanded,
    ).toBe(false);
    const open = await renderCard({expanded: true});
    expect(
      open.getByLabelText('Bench Press').props.accessibilityState.expanded,
    ).toBe(true);
  });

  it('reports its position so the screen can scroll to it', async () => {
    const onLayoutY = jest.fn();
    const view = await renderCard({onLayoutY});
    await fireEvent(view.getByTestId('exercise-card'), 'layout', {
      nativeEvent: {layout: {y: 420}},
    });
    expect(onLayoutY).toHaveBeenCalledWith(420);
  });

  it('carries a verdict once the exercise is finished', async () => {
    const view = await renderCard({
      exercise: exercise({
        status: 'completed',
        sets: [done(1), done(2), done(3)],
      }),
    });
    expect(view.getByText('Achieved')).toBeTruthy();
  });

  it('says so when the exercise was skipped', async () => {
    const view = await renderCard({
      exercise: exercise({
        status: 'skipped',
        sets: [set(1, {status: 'skipped'}), set(2, {status: 'skipped'})],
      }),
    });
    expect(view.getByText('Skipped')).toBeTruthy();
  });

  it('prints what was lifted last time, when it is known', async () => {
    const view = await renderCard({
      expanded: true,
      previous: {date: 0, sets: [{reps: 10, weight: 57.5}]},
    });
    expect(view.getByText(/last time/)).toBeTruthy();
    expect(view.getByText(/57\.5/)).toBeTruthy();
  });

  it('renders whatever controls the screen hands it', async () => {
    const view = await renderCard({
      expanded: true,
      children: <Text>Add set</Text>,
    });
    expect(view.getByText('Add set')).toBeTruthy();
  });

  it('keeps the controls out of a collapsed card', async () => {
    const view = await renderCard({
      expanded: false,
      children: <Text>Add set</Text>,
    });
    expect(view.queryByText('Add set')).toBeNull();
  });
});

describe('WorkoutExerciseCard controls', () => {
  it('offers a menu on the header', async () => {
    const onMore = jest.fn();
    const view = await renderCard({onMore});
    await fireEvent.press(view.getByLabelText('More for Bench Press'));
    expect(onMore).toHaveBeenCalled();
  });

  it('keeps the menu out of the way when there is nothing to open', async () => {
    const view = await renderCard();
    expect(view.queryByLabelText('More for Bench Press')).toBeNull();
  });

  it('takes a note while the exercise is open', async () => {
    const onNote = jest.fn();
    const view = await renderCard({expanded: true, onNote});
    const field = view.getByLabelText('Note for Bench Press');
    await fireEvent.changeText(field, 'Shoulder felt off.');
    await fireEvent(field, 'blur');
    expect(onNote).toHaveBeenCalledWith('Shoulder felt off.');
  });

  it('shows a note that was written earlier', async () => {
    const view = await renderCard({
      expanded: true,
      onNote: jest.fn(),
      exercise: exercise({notes: 'Rack was busy.'}),
    });
    expect(view.getByLabelText('Note for Bench Press').props.value).toBe(
      'Rack was busy.',
    );
  });

  it('does not write a note that has not changed', async () => {
    const onNote = jest.fn();
    const view = await renderCard({
      expanded: true,
      onNote,
      exercise: exercise({notes: 'Rack was busy.'}),
    });
    await fireEvent(view.getByLabelText('Note for Bench Press'), 'blur');
    expect(onNote).not.toHaveBeenCalled();
  });

  // Found on the emulator: Android's hardware back dismisses the keyboard
  // without blurring the field, so onBlur never fires and the note was lost.
  // PlanDayScreen documents this exact trap -- it ate a rename once already.
  it('commits shortly after typing stops, without waiting for a blur', async () => {
    jest.useFakeTimers();
    try {
      const onNote = jest.fn();
      const view = await renderCard({expanded: true, onNote});
      await fireEvent.changeText(
        view.getByLabelText('Note for Bench Press'),
        'Shoulder felt off.',
      );
      expect(onNote).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(onNote).toHaveBeenCalledWith('Shoulder felt off.');
    } finally {
      jest.useRealTimers();
    }
  });

  // Collapsing the card, opening another one, or leaving the screen all
  // unmount the field, and none of them blur it first.
  it('commits what was typed when the card closes under it', async () => {
    jest.useFakeTimers();
    try {
      const onNote = jest.fn();
      const view = await renderCard({expanded: true, onNote});
      await fireEvent.changeText(
        view.getByLabelText('Note for Bench Press'),
        'Rack was busy.',
      );

      // Closed before the debounce could fire.
      await view.rerender(
        <ThemeProvider>
          <WorkoutExerciseCard
            exercise={exercise()}
            expanded={false}
            onToggle={jest.fn()}
            onLayoutY={jest.fn()}
            unit="kg"
            increment={0.5}
            onNote={onNote}
          />
        </ThemeProvider>,
      );

      expect(onNote).toHaveBeenCalledWith('Rack was busy.');
    } finally {
      jest.useRealTimers();
    }
  });

  it('writes once, not once per keystroke', async () => {
    jest.useFakeTimers();
    try {
      const onNote = jest.fn();
      const view = await renderCard({expanded: true, onNote});
      const field = view.getByLabelText('Note for Bench Press');
      for (const text of ['S', 'Sh', 'Sho', 'Shou']) {
        await fireEvent.changeText(field, text);
      }
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(onNote).toHaveBeenCalledTimes(1);
      expect(onNote).toHaveBeenCalledWith('Shou');
    } finally {
      jest.useRealTimers();
    }
  });

  it('says where a swapped exercise came from', async () => {
    const view = await renderCard({
      exercise: exercise({
        name: 'Dumbbell Press',
        substitutedFromName: 'Bench Press',
      }),
    });
    expect(view.getByText('swapped from Bench Press')).toBeTruthy();
  });

  it('says nothing about swaps when there was none', async () => {
    const view = await renderCard();
    expect(view.queryByText(/swapped from/)).toBeNull();
  });
});

describe('removing a set you added', () => {
  const bonus = (n: number, over: Partial<SessionSet> = {}) =>
    set(n, {isUnplanned: true, targetReps: null, targetWeight: null, ...over});

  it('offers a remove control on a bonus set nothing has touched', async () => {
    const onRemoveSet = jest.fn();
    const view = await renderCard({
      expanded: true,
      onRemoveSet,
      exercise: exercise({sets: [set(1), bonus(2)]}),
    });

    await fireEvent.press(view.getByLabelText('Remove set 2'));
    expect(onRemoveSet).toHaveBeenCalledWith('s2');
  });

  // A planned set you did not do is skipped, never erased: deleting it would
  // shrink the denominator of "% of plan".
  it('offers none on a planned set', async () => {
    const view = await renderCard({
      expanded: true,
      onRemoveSet: jest.fn(),
      exercise: exercise({sets: [set(1), set(2)]}),
    });
    expect(view.queryByLabelText('Remove set 1')).toBeNull();
    expect(view.queryByLabelText('Remove set 2')).toBeNull();
  });

  it('still offers it once the bonus set has recorded something', async () => {
    const onRemoveSet = jest.fn();
    const view = await renderCard({
      expanded: true,
      onRemoveSet,
      exercise: exercise({
        sets: [set(1), bonus(2, {status: 'completed', actualReps: 8})],
      }),
    });

    await fireEvent.press(view.getByLabelText('Remove set 2'));
    expect(onRemoveSet).toHaveBeenCalledWith('s2');
  });

  // An exercise with no sets can never be finished, and draws as an empty card.
  it('offers none on the only set an exercise has', async () => {
    const view = await renderCard({
      expanded: true,
      onRemoveSet: jest.fn(),
      exercise: exercise({sets: [bonus(1)]}),
    });
    expect(view.queryByLabelText('Remove set 1')).toBeNull();
  });

  it('draws nothing when the screen offers no way to remove', async () => {
    const view = await renderCard({
      expanded: true,
      exercise: exercise({sets: [set(1), bonus(2)]}),
    });
    expect(view.queryByLabelText('Remove set 2')).toBeNull();
  });
});

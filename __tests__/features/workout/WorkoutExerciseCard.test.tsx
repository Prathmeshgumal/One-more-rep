import React from 'react';
import {Text} from 'react-native';
import {render, fireEvent} from '@testing-library/react-native';
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

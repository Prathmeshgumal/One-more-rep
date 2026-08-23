import React from 'react';
import {act, render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setTargets} from '@/domain/planDraft';
import {
  startWorkout,
  getActiveSession,
  completeSet,
} from '@/repositories/sessionRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {WorkoutScreen} from '@/features/workout/WorkoutScreen';
import {useActiveSet} from '@/features/workout/useActiveSet';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockFocus: Array<() => void> = [];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate, goBack: mockGoBack}),
  // Runs the callback once and keeps it, so a test can fire focus again the
  // way returning from the exercise summary does.
  useFocusEffect: (cb: () => void) => {
    const React_ = require('react');
    React_.useEffect(() => {
      mockFocus.push(cb);
      cb();
    }, []);
  },
}));

describe('WorkoutScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <WorkoutScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  const today = () => {
    const d = new Date();
    return (d.getDay() + 6) % 7;
  };

  const sets = async () => {
    const session = (await getActiveSession(ctx.db))!;
    return session.exercises[0]!.sets;
  };

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0)`,
    );
    await createPlan(ctx.db);
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, today(), 'Push Day'), today(), ['bench', 'fly']),
    );
    // A real target weight, so the pre-fill has something to pre-fill from.
    // addExercises defaults to 3 x 10 with no weight, which would make every
    // weight assertion below trivially zero.
    await editPlan(ctx.db, d =>
      setTargets(d, today(), 0, [
        {targetReps: 10, targetWeight: 30},
        {targetReps: 10, targetWeight: 30},
        {targetReps: 10, targetWeight: 30},
      ]),
    );
    await startWorkout(ctx.db);

    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    useActiveSet.getState().reset();
    mockNavigate.mockClear();
    mockFocus.length = 0;
    mockGoBack.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('opens on the first exercise with its progress', async () => {
    const view = await renderScreen();
    expect(await view.findByText('Bench Press')).toBeTruthy();
    expect(view.getByText(/0 \/ 6 sets/)).toBeTruthy();
  });

  // §35: the inputs arrive holding the target, so an on-plan set is one tap.
  it('pre-fills the active set with the target', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    expect(view.getByLabelText('Weight').props.children).toBe('30.0');
    expect(view.getByLabelText('Reps').props.children).toBe('10');
  });

  // Spec 6.2: pre-filled is not recorded. Until the set is completed the
  // database holds NULL, or a crash would make an untouched set look done.
  it('records nothing until the set is completed', async () => {
    await renderScreen();
    expect((await sets())[0]!.actualReps).toBeNull();
    expect((await sets())[0]!.status).toBe('pending');
  });

  it('writes the actuals when the set is completed', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Complete set'));

    await waitFor(async () => {
      expect((await sets())[0]!.status).toBe('completed');
    });
    expect((await sets())[0]!.actualReps).toBe(10);
    expect((await sets())[0]!.actualWeight).toBe(30);
  });

  it('steps the weight by the configured increment and the reps by one', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');

    await fireEvent.press(view.getByLabelText('Increase weight'));
    await fireEvent.press(view.getByLabelText('Increase reps'));
    await fireEvent.press(view.getByLabelText('Increase reps'));
    expect(view.getByLabelText('Weight').props.children).toBe('32.5');
    expect(view.getByLabelText('Reps').props.children).toBe('12');

    await fireEvent.press(view.getByLabelText('Complete set'));
    await waitFor(async () => {
      expect((await sets())[0]!.actualWeight).toBe(32.5);
    });
    expect((await sets())[0]!.actualReps).toBe(12);
  });

  it('will not step reps below one or weight below zero', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    for (let i = 0; i < 20; i++) {
      await fireEvent.press(view.getByLabelText('Decrease reps'));
      await fireEvent.press(view.getByLabelText('Decrease weight'));
    }
    expect(view.getByLabelText('Reps').props.children).toBe('1');
    expect(view.getByLabelText('Weight').props.children).toBe('0.0');
  });

  // Spec 6.3: completing a set auto-advances, so the next set is already
  // waiting rather than needing to be found.
  it('advances to the next set once one is recorded', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Complete set'));

    await waitFor(() => {
      expect(view.getByText('Set 2')).toBeTruthy();
    });
    expect(view.getByText(/1 \/ 6 sets/)).toBeTruthy();
  });

  it('shows a recorded set with its verdict', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Increase reps'));
    await fireEvent.press(view.getByLabelText('Complete set'));

    await waitFor(() => {
      expect(view.getByText('+1 rep')).toBeTruthy();
    });
  });

  it('skips a set without recording anything', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Skip set'));

    await waitFor(async () => {
      expect((await sets())[0]!.status).toBe('skipped');
    });
    expect((await sets())[0]!.actualReps).toBeNull();
  });

  it('adds a bonus set with no target', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Add set'));

    await waitFor(async () => {
      expect(await sets()).toHaveLength(4);
    });
    expect((await sets())[3]!.isUnplanned).toBe(true);
  });

  it('skips the whole exercise and moves on', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Skip this exercise'));

    await waitFor(async () => {
      const session = (await getActiveSession(ctx.db))!;
      expect(session.exercises[0]!.status).toBe('skipped');
    });
  });

  it('moves to the next exercise on request', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText(/Next — Cable Fly/));
    await waitFor(() => {
      expect(view.getByText('Cable Fly')).toBeTruthy();
    });
  });

  // §36: what you lifted last time, inline, so nobody leaves the set they are
  // standing in front of to go and look it up.
  it('shows what was lifted last time', async () => {
    await ctx.db.run(
      sql`INSERT INTO workout_sessions (id,date,day_name_snapshot,status,started_at)
          VALUES ('old', 1, 'Push Day', 'completed', 1)`,
    );
    await ctx.db.run(
      sql`INSERT INTO performed_exercises
            (id,workout_session_id,exercise_id,order_index,status)
          VALUES ('opex','old','bench',0,'completed')`,
    );
    await ctx.db.run(
      sql`INSERT INTO performed_sets
            (id,performed_exercise_id,set_number,actual_reps,actual_weight,
             status,is_unplanned)
          VALUES ('ops','opex',1,10,27.5,'completed',0)`,
    );

    const view = await renderScreen();
    expect(await view.findByText(/last time/)).toBeTruthy();
    expect(view.getByText(/27.5×10/)).toBeTruthy();
  });

  it('opens the exercise summary when an exercise is finished', async () => {
    const view = await renderScreen();
    for (let i = 0; i < 3; i++) {
      await fireEvent.press(await view.findByLabelText('Complete set'));
    }
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('ExerciseSummary', {
        exerciseIndex: 0,
      });
    });
  });

  it('leaves the workout when closed', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Close workout'));
    expect(mockGoBack).toHaveBeenCalled();
  });

  // Spec 6.4: resume "at the first pending set". This screen used to open on
  // the first exercise regardless, so on the device a half-finished workout
  // resumed on an exercise that was already done — and the exercise summary's
  // "Next — X" button landed back on the exercise it had just summarised.
  it('opens on the first exercise that still has a pending set', async () => {
    const session = await getActiveSession(ctx.db);
    // Finish everything in the first exercise.
    for (const set of session!.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 20});
    }

    const view = await renderScreen();
    expect(await view.findByText('Cable Fly')).toBeTruthy();
    expect(view.queryByText('Bench Press')).toBeNull();
  });

  // Coming back from an exercise summary does not change the session, so an
  // alignment that only watched the session would never re-run here.
  it('realigns when the screen is focused again', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');

    // Finish the first exercise through the UI, so the query invalidates the
    // way it does in the app.
    for (let i = 0; i < 3; i += 1) {
      await fireEvent.press(await view.findByLabelText('Complete set'));
    }
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('ExerciseSummary', {
        exerciseIndex: 0,
      }),
    );

    // Still on the finished exercise: recording sets must not move the screen
    // out from under someone who is still working on it.
    expect(view.getByText('Bench Press')).toBeTruthy();

    // Now the summary hands focus back.
    await act(async () => {
      for (const focus of mockFocus) {
        focus();
      }
    });
    await waitFor(() => expect(view.getByText('Cable Fly')).toBeTruthy());
  });
});

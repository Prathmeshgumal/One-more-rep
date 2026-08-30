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
import {updateSettings} from '@/repositories/settingsRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {SessionScreen} from '@/features/workout/SessionScreen';
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

describe('SessionScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <SessionScreen />
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
    expect(view.getByLabelText('Weight').props.value).toBe('30.0');
    expect(view.getByLabelText('Reps').props.value).toBe('10');
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
    // Set explicitly rather than leaning on DEFAULT_SETTINGS: this test is
    // named after the configured increment, so it should configure one. It
    // passed by accident while the default happened to be 2.5.
    await updateSettings(ctx.db, {defaultIncrement: 2.5});
    const view = await renderScreen();
    await view.findByText('Bench Press');

    await fireEvent.press(view.getByLabelText('Increase Weight'));
    await fireEvent.press(view.getByLabelText('Increase Reps'));
    await fireEvent.press(view.getByLabelText('Increase Reps'));
    expect(view.getByLabelText('Weight').props.value).toBe('32.5');
    expect(view.getByLabelText('Reps').props.value).toBe('12');

    await fireEvent.press(view.getByLabelText('Complete set'));
    await waitFor(async () => {
      expect((await sets())[0]!.actualWeight).toBe(32.5);
    });
    expect((await sets())[0]!.actualReps).toBe(12);
  });

  it('will not step reps below one or weight below zero', async () => {
    await updateSettings(ctx.db, {defaultIncrement: 2.5});
    const view = await renderScreen();
    await view.findByText('Bench Press');
    for (let i = 0; i < 20; i++) {
      await fireEvent.press(view.getByLabelText('Decrease Reps'));
      await fireEvent.press(view.getByLabelText('Decrease Weight'));
    }
    expect(view.getByLabelText('Reps').props.value).toBe('1');
    expect(view.getByLabelText('Weight').props.value).toBe('0.0');
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
    await fireEvent.press(await view.findByLabelText('Increase Reps'));
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

  // A set added by mistake had no way out: skipping it left a skipped row in
  // history for work that was never intended.
  it('removes a bonus set added by mistake', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Add set'));
    await waitFor(async () => expect(await sets()).toHaveLength(4));

    await fireEvent.press(view.getByLabelText('Remove set 4'));

    await waitFor(async () => expect(await sets()).toHaveLength(3));
    // And the planned three are untouched.
    expect((await sets()).every(s => !s.isUnplanned)).toBe(true);
  });

  // Reported from the phone: "Finish this exercise isn't working". It was
  // still being offered on an exercise that had nothing left to finish, where
  // it is a no-op -- so it looked broken rather than being absent.
  it('stops offering to finish once there is nothing left', async () => {
    const view = await renderScreen();
    for (let i = 0; i < 3; i++) {
      await fireEvent.press(await view.findByLabelText('Complete set'));
    }
    await waitFor(async () =>
      expect((await sets()).every(s => s.status === 'completed')).toBe(true),
    );

    // Reopen the finished exercise; there is nothing there to close.
    await fireEvent.press(view.getByLabelText('Bench Press'));
    await waitFor(() =>
      expect(
        view.getByLabelText('Bench Press').props.accessibilityState.expanded,
      ).toBe(true),
    );
    expect(view.queryByText('Finish this exercise')).toBeNull();
    expect(view.queryByText('Skip this exercise')).toBeNull();
  });

  it('offers no way to remove a planned set', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    expect(view.queryByLabelText('Remove set 1')).toBeNull();
    expect(view.queryByLabelText('Remove set 3')).toBeNull();
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

  // U1: every exercise is on screen at once, so "move to the next one" is no
  // longer a button — it is scrolling, and opening the card you land on.
  it('shows every exercise in the session at once', async () => {
    const view = await renderScreen();
    expect(await view.findByText('Bench Press')).toBeTruthy();
    expect(view.getByText('Cable Fly')).toBeTruthy();
  });

  it('opens a different exercise when its header is tapped', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Cable Fly'));

    await waitFor(() => {
      expect(
        view.getByLabelText('Cable Fly').props.accessibilityState.expanded,
      ).toBe(true);
    });
    // U2: opening one closes the other, so there is never a second set that
    // also looks active.
    expect(
      view.getByLabelText('Bench Press').props.accessibilityState.expanded,
    ).toBe(false);
    expect(view.getAllByLabelText('Complete set')).toHaveLength(1);
  });

  it('closes the open card when its own header is tapped', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Bench Press'));
    await waitFor(() => {
      expect(
        view.getByLabelText('Bench Press').props.accessibilityState.expanded,
      ).toBe(false);
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

  // Spec 6.3 still auto-advances, but no longer by pushing a screen over the
  // workout. Finishing an exercise opens the next one that still has work.
  // Recorded as a design departure in docs/deferred.md.
  it('opens the next exercise when one is finished', async () => {
    const view = await renderScreen();
    for (let i = 0; i < 3; i++) {
      await fireEvent.press(await view.findByLabelText('Complete set'));
    }
    await waitFor(() => {
      expect(
        view.getByLabelText('Cable Fly').props.accessibilityState.expanded,
      ).toBe(true);
    });
    expect(mockNavigate).not.toHaveBeenCalledWith(
      'ExerciseSummary',
      expect.anything(),
    );
  });

  it('does not move the open card out from under a recorded set', async () => {
    // The bug found on the device in Phase 3. It must not come back through
    // the rewrite: two of three sets left means you are still on this exercise.
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Complete set'));

    await waitFor(async () => {
      expect((await sets())[0]!.status).toBe('completed');
    });
    expect(
      view.getByLabelText('Bench Press').props.accessibilityState.expanded,
    ).toBe(true);
    expect(view.getAllByLabelText('Complete set')).toHaveLength(1);
  });

  // U10, reported from the device: a set was skipped by accident and there was
  // no way back to it. completeSet already overwrites and section 14 already
  // says the actual is editable -- the screen simply offered no way in.
  it('reopens a skipped set when it is tapped', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Skip set'));
    await waitFor(async () => expect((await sets())[0]!.status).toBe('skipped'));

    await fireEvent.press(view.getByLabelText('Edit set 1'));
    await waitFor(() =>
      expect(view.getByLabelText('Complete set')).toBeTruthy(),
    );
    await fireEvent.press(view.getByLabelText('Complete set'));

    await waitFor(async () =>
      expect((await sets())[0]!.status).toBe('completed'),
    );
  });

  it('reopens a recorded set so a wrong number can be corrected', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Complete set'));
    await waitFor(async () =>
      expect((await sets())[0]!.actualWeight).toBe(30),
    );

    await fireEvent.press(view.getByLabelText('Edit set 1'));
    await waitFor(() => expect(view.getByLabelText('Weight')).toBeTruthy());
    // Reopening loads what was recorded, not the target -- you are correcting
    // a number, so the number you typed is the better starting point.
    expect(view.getByLabelText('Weight').props.value).toBe('30.0');

    await fireEvent.changeText(view.getByLabelText('Weight'), '55');
    await fireEvent.press(view.getByLabelText('Complete set'));

    await waitFor(async () => expect((await sets())[0]!.actualWeight).toBe(55));
    expect((await sets())[0]!.status).toBe('completed');
  });

  it('goes back to the first pending set once the correction is saved', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Complete set'));
    await waitFor(async () => expect((await sets())[0]!.status).toBe('completed'));

    await fireEvent.press(view.getByLabelText('Edit set 1'));
    await waitFor(() => expect(view.queryByLabelText('Edit set 1')).toBeNull());
    await fireEvent.press(view.getByLabelText('Complete set'));

    // Set 2 is active again, not set 1 forever.
    await waitFor(() =>
      expect(view.getByLabelText('Edit set 1')).toBeTruthy(),
    );
    expect(view.getAllByLabelText('Complete set')).toHaveLength(1);
  });

  it('offers no edit on a set that has not happened yet', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    // Set 1 is active, sets 2 and 3 are pending -- none of them is editable
    // by tapping, because there is nothing yet to correct.
    expect(view.queryByLabelText('Edit set 2')).toBeNull();
    expect(view.queryByLabelText('Edit set 3')).toBeNull();
  });

  // U11, also from the device: skipping understated an exercise that was
  // mostly done.
  it('offers to finish rather than skip once something is recorded', async () => {
    const view = await renderScreen();
    expect(await view.findByText('Skip this exercise')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('Complete set'));

    await waitFor(() =>
      expect(view.getByText('Finish this exercise')).toBeTruthy(),
    );
    expect(view.queryByText('Skip this exercise')).toBeNull();
  });

  it('finishing a part-done exercise records it as completed', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Complete set'));
    await waitFor(() => expect(view.getByText('Finish this exercise')).toBeTruthy());

    await fireEvent.press(view.getByText('Finish this exercise'));

    await waitFor(async () => {
      const session = (await getActiveSession(ctx.db))!;
      expect(session.exercises[0]!.status).toBe('completed');
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
    await view.findByText('Cable Fly');
    await waitFor(() => {
      expect(
        view.getByLabelText('Cable Fly').props.accessibilityState.expanded,
      ).toBe(true);
    });
    // The finished exercise has not vanished — it is on screen, collapsed,
    // still showing what it asked for and how it went.
    expect(
      view.getByLabelText('Bench Press').props.accessibilityState.expanded,
    ).toBe(false);
  });

  // Coming back from an exercise summary does not change the session, so an
  // alignment that only watched the session would never re-run here.
  it('realigns when the screen is focused again', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');

    // Open the second exercise by hand, then come back to it having done
    // nothing — focus must realign to where the work actually is.
    await fireEvent.press(view.getByLabelText('Cable Fly'));
    await waitFor(() =>
      expect(
        view.getByLabelText('Cable Fly').props.accessibilityState.expanded,
      ).toBe(true),
    );

    await act(async () => {
      for (const focus of mockFocus) {
        focus();
      }
    });

    // Bench Press still has all three sets pending, so that is where focus
    // puts you — not on whatever happened to be open when you left.
    await waitFor(() =>
      expect(
        view.getByLabelText('Bench Press').props.accessibilityState.expanded,
      ).toBe(true),
    );
  });

  // Deliberately thin: ExerciseActions owns which rows are offered and why,
  // and sessionRepo owns what each one does. These only prove the screen
  // actually joins the two together.
  it('opens the menu for the exercise whose control was pressed', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('More for Bench Press'));
    await waitFor(() =>
      expect(view.getByLabelText('Swap this exercise')).toBeTruthy(),
    );
  });

  it('reorders the session from the menu', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('More for Bench Press'));
    await fireEvent.press(view.getByLabelText('Move down'));

    await waitFor(async () => {
      const session = (await getActiveSession(ctx.db))!;
      expect(session.exercises.map(e => e.name)).toEqual([
        'Cable Fly',
        'Bench Press',
      ]);
    });
  });

  it('writes a note to the database when the field is left', async () => {
    const view = await renderScreen();
    const field = await view.findByLabelText('Note for Bench Press');
    await fireEvent.changeText(field, 'Shoulder felt off.');
    await fireEvent(field, 'blur');

    await waitFor(async () => {
      const session = (await getActiveSession(ctx.db))!;
      expect(session.exercises[0]!.notes).toBe('Shoulder felt off.');
    });
  });

  it('sends a swap to the picker rather than doing it blind', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('More for Bench Press'));
    await fireEvent.press(view.getByLabelText('Swap this exercise'));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('WorkoutExercisePicker', {
        mode: 'swap',
        performedExerciseId: expect.any(String),
      }),
    );
  });
});

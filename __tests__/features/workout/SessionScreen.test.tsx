import React from 'react';
import {render, fireEvent, act, waitFor} from '@testing-library/react-native';
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
import {SessionScreen} from '@/features/workout/SessionScreen';
import {useActiveSet} from '@/features/workout/useActiveSet';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockFocus: Array<() => void> = [];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate, goBack: mockGoBack}),
  // Kept, so a test can fire focus again the way returning to the screen does.
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

  const today = () => (new Date().getDay() + 6) % 7;

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
      addExercises(renameDay(d, today(), 'Push Day'), today(), [
        'bench',
        'fly',
      ]),
    );
    // A real target weight, so the pre-fill has something to pre-fill from.
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
    mockFocus.length = 0;
    mockGoBack.mockClear();
    mockNavigate.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('opens on the first set of the first exercise', async () => {
    const view = await renderScreen();
    expect(await view.findByText('Bench Press')).toBeTruthy();
    expect(view.getByText('Exercise 1 of 2 · set 1 of 3')).toBeTruthy();
    expect(view.getByText('0 of 6 recorded')).toBeTruthy();
  });

  // §35: the controls arrive holding the target, so an on-plan set is one tap.
  it('pre-fills the set with its target', async () => {
    const view = await renderScreen();
    expect(await view.findByLabelText('10 reps')).toBeTruthy();
    expect(view.getByText('30')).toBeTruthy();
  });

  // Spec 6.2: a number on screen that has not been confirmed must stay
  // indistinguishable from nothing at all.
  it('records nothing just by being looked at', async () => {
    await renderScreen();
    await act(async () => {});
    expect((await sets()).every(s => s.status === 'pending')).toBe(true);
  });

  it('steps reps by one and weight by the configured increment', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('One rep more'));
    expect(useActiveSet.getState().reps).toBe(11);

    await fireEvent.press(view.getByLabelText('Increase weight by 0.5 kg'));
    expect(useActiveSet.getState().weight).toBe(30.5);
  });

  it('will not step reps below one or weight below zero', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    // Awaited: act is async in this version of RNTL, and an un-awaited act
    // scope leaks into whatever test runs next -- which cost six failures
    // here before it was spotted.
    await act(async () => {
      useActiveSet.getState().setReps(1);
      useActiveSet.getState().setWeight(0);
    });
    await fireEvent.press(view.getByLabelText('One rep fewer'));
    await fireEvent.press(view.getByLabelText('Decrease weight by 0.5 kg'));
    expect(useActiveSet.getState().reps).toBe(1);
    expect(useActiveSet.getState().weight).toBe(0);
  });

  /**
   * §36. The same set number from last time, not the first one: on set three,
   * what you did on set three is the useful figure, and it is usually not what
   * you did on set one.
   */
  it('shows what was lifted on this set last time', async () => {
    const previous = (await getActiveSession(ctx.db))!;
    await completeSet(ctx.db, previous.exercises[0]!.sets[0]!.id, {
      actualReps: 8,
      actualWeight: 40,
    });
    // Backdate it so it counts as a previous session rather than this one.
    await ctx.db.run(
      sql`UPDATE workout_sessions SET date = date - 604800000, status = 'completed'`,
    );
    await startWorkout(ctx.db);

    const view = await renderScreen();
    expect(await view.findByText(/last time 8 × 40 kg/)).toBeTruthy();
  });

  // Spec 6.4: an in-progress session resumes at the first pending set. The
  // index is local state, so without the realignment a half-finished workout
  // would reopen on set one of an exercise already done.
  it('resumes at the first set still to be decided', async () => {
    const session = (await getActiveSession(ctx.db))!;
    for (const s of session.exercises[0]!.sets) {
      await completeSet(ctx.db, s.id, {actualReps: 10, actualWeight: 30});
    }
    const view = await renderScreen();
    expect(await view.findByText('Cable Fly')).toBeTruthy();
    expect(view.getByText('Exercise 2 of 2 · set 1 of 3')).toBeTruthy();
  });

  it('realigns when the screen is focused again', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');

    const session = (await getActiveSession(ctx.db))!;
    for (const s of session.exercises[0]!.sets) {
      await completeSet(ctx.db, s.id, {actualReps: 10, actualWeight: 30});
    }
    await act(async () => {
      await client.invalidateQueries();
      mockFocus.forEach(cb => cb());
    });
    expect(await view.findByText('Cable Fly')).toBeTruthy();
  });

  it('jumps to a set when its tick on the rail is pressed', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    await fireEvent.press(view.getByLabelText('Go to set 2 of Cable Fly'));
    expect(view.getByText('Cable Fly')).toBeTruthy();
    expect(view.getByText('Exercise 2 of 2 · set 2 of 3')).toBeTruthy();
  });

  // A bodyweight movement gets no weight control at all, rather than a zero
  // in one — §26's rule, kept from the screen this replaces.
  it('offers no weight control on a bodyweight movement', async () => {
    await ctx.db.run(
      sql`UPDATE exercises SET weight_applicable = 0 WHERE id = 'bench'`,
    );
    const view = await renderScreen();
    await view.findByText('Bench Press');
    expect(view.queryByLabelText('Increase weight by 0.5 kg')).toBeNull();
  });

  it('leaves the workout when closed', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Close workout'));
    expect(mockGoBack).toHaveBeenCalled();
  });

  describe('recording', () => {
    // The button states its consequence rather than showing a bare tick,
    // because the screen it was pressed on is about to be replaced.
    it('names what it is about to write', async () => {
      const view = await renderScreen();
      expect(await view.findByLabelText('Record 10 × 30 kg')).toBeTruthy();
    });

    it('writes the actuals when the set is recorded', async () => {
      const view = await renderScreen();
      await fireEvent.press(await view.findByLabelText('Record 10 × 30 kg'));
      await waitFor(async () => {
        const first = (await sets())[0]!;
        expect(first.status).toBe('completed');
        expect(first.actualReps).toBe(10);
        expect(first.actualWeight).toBe(30);
      });
    });

    it('advances to the next set once one is recorded', async () => {
      const view = await renderScreen();
      await fireEvent.press(await view.findByLabelText('Record 10 × 30 kg'));
      expect(
        await view.findByText('Exercise 1 of 2 · set 2 of 3'),
      ).toBeTruthy();
    });

    it('crosses into the next exercise when this one is done', async () => {
      const session = (await getActiveSession(ctx.db))!;
      for (const s of session.exercises[0]!.sets.slice(0, 2)) {
        await completeSet(ctx.db, s.id, {actualReps: 10, actualWeight: 30});
      }
      const view = await renderScreen();
      await view.findByText('Exercise 1 of 2 · set 3 of 3');
      await fireEvent.press(view.getByLabelText('Record 10 × 30 kg'));
      expect(await view.findByText('Cable Fly')).toBeTruthy();
    });

    // A bodyweight movement has no weight to record, and writing a zero would
    // invent a load nobody lifted (§26).
    it('writes no weight for a bodyweight movement', async () => {
      await ctx.db.run(
        sql`UPDATE exercises SET weight_applicable = 0 WHERE id = 'bench'`,
      );
      const view = await renderScreen();
      await fireEvent.press(await view.findByLabelText('Record 10 reps'));
      await waitFor(async () => {
        expect((await sets())[0]!.actualWeight).toBeNull();
      });
    });

    it('says where it is going next', async () => {
      const view = await renderScreen();
      await view.findByText('Bench Press');
      expect(view.getByText('then set 2')).toBeTruthy();
    });

    // Crossing an exercise boundary names the exercise, not the set number --
    // "then set 1" would be true and useless.
    it('names the exercise when the next set is in a different one', async () => {
      const session = (await getActiveSession(ctx.db))!;
      for (const s of session.exercises[0]!.sets.slice(0, 2)) {
        await completeSet(ctx.db, s.id, {actualReps: 10, actualWeight: 30});
      }
      const view = await renderScreen();
      await view.findByText('Exercise 1 of 2 · set 3 of 3');
      expect(view.getByText('then Cable Fly')).toBeTruthy();
    });
  });

  describe('skipping', () => {
    // §21: skipped, with actuals left empty. Never pretend it happened.
    it('records nothing when a set is skipped', async () => {
      const view = await renderScreen();
      await fireEvent.press(await view.findByLabelText('Skip'));
      await waitFor(async () => {
        const first = (await sets())[0]!;
        expect(first.status).toBe('skipped');
        expect(first.actualReps).toBeNull();
      });
    });

    // Skipping stays on the set rather than moving on, so the decision is
    // visible and can be taken back in one tap.
    it('stays on the skipped set and offers to undo it', async () => {
      const view = await renderScreen();
      await fireEvent.press(await view.findByLabelText('Skip'));
      expect(await view.findByText('Skipped')).toBeTruthy();
      expect(view.getByLabelText('Undo skip')).toBeTruthy();
      expect(view.getByText('Exercise 1 of 2 · set 1 of 3')).toBeTruthy();
    });

    it('puts a skipped set back when the skip is undone', async () => {
      const view = await renderScreen();
      await fireEvent.press(await view.findByLabelText('Skip'));
      await fireEvent.press(await view.findByLabelText('Undo skip'));
      await waitFor(async () => {
        expect((await sets())[0]!.status).toBe('pending');
      });
    });

    it('offers no skip on a set that is already decided', async () => {
      const session = (await getActiveSession(ctx.db))!;
      await completeSet(ctx.db, session.exercises[0]!.sets[0]!.id, {
        actualReps: 10,
        actualWeight: 30,
      });
      const view = await renderScreen();
      await view.findByText('Bench Press');
      await fireEvent.press(view.getByLabelText('Go to set 1 of Bench Press'));
      expect(view.queryByLabelText('Skip')).toBeNull();
    });
  });

  describe('undo', () => {
    it('offers to take back the set it just wrote', async () => {
      const view = await renderScreen();
      await fireEvent.press(await view.findByLabelText('Record 10 × 30 kg'));
      expect(await view.findByText('Set 1 recorded — 10 reps')).toBeTruthy();
    });

    it('puts the set back exactly as it was', async () => {
      const view = await renderScreen();
      await fireEvent.press(await view.findByLabelText('Record 10 × 30 kg'));
      await fireEvent.press(await view.findByLabelText('Undo'));
      await waitFor(async () => {
        const first = (await sets())[0]!;
        expect(first.status).toBe('pending');
        expect(first.actualReps).toBeNull();
        expect(first.completedAt).toBeNull();
      });
    });

    /**
     * Undoing has to return you to the set it came from. Staying on the set
     * the advance landed on would leave you looking at a different exercise
     * from the one you just put back.
     */
    it('returns to the set it came from', async () => {
      const view = await renderScreen();
      await fireEvent.press(await view.findByLabelText('Record 10 × 30 kg'));
      await view.findByText('Exercise 1 of 2 · set 2 of 3');
      await fireEvent.press(await view.findByLabelText('Undo'));
      expect(
        await view.findByText('Exercise 1 of 2 · set 1 of 3'),
      ).toBeTruthy();
    });

    it('offers to take back a skip too', async () => {
      const view = await renderScreen();
      await fireEvent.press(await view.findByLabelText('Skip'));
      expect(await view.findByText('Set 1 skipped')).toBeTruthy();
    });
  });

  /**
   * The peek is what makes this flow viable. A focus screen cannot show you
   * the shape of your day, and the rail cannot tell you that you were three
   * reps short on set two — so this restores what the vertical ledger never
   * had to lose.
   */
  describe('the session peek', () => {
    it('shows every exercise and every set at once', async () => {
      const view = await renderScreen();
      await fireEvent.press(
        await view.findByLabelText('Show the whole session'),
      );
      expect(await view.findByText('Cable Fly')).toBeTruthy();
      expect(
        view.getByText('0 of 6 sets recorded · tap any set to go there'),
      ).toBeTruthy();
      // Five, not six: the set you are standing on reads "now lifting".
      expect(view.getAllByText('not recorded')).toHaveLength(5);
    });

    it('goes to the set that was tapped', async () => {
      const view = await renderScreen();
      await fireEvent.press(
        await view.findByLabelText('Show the whole session'),
      );
      const rows = await view.findAllByLabelText('Set 3, not recorded');
      // The second: set 3 of the second exercise.
      await fireEvent.press(rows[1]!);
      expect(
        await view.findByText('Exercise 2 of 2 · set 3 of 3'),
      ).toBeTruthy();
    });

    it('marks which set you are on', async () => {
      const view = await renderScreen();
      await fireEvent.press(
        await view.findByLabelText('Show the whole session'),
      );
      expect(await view.findByText('now lifting')).toBeTruthy();
    });
  });

  describe('the exercise menu', () => {
    const openMenu = async (view: Awaited<ReturnType<typeof render>>) => {
      await fireEvent.press(
        await view.findByLabelText('Actions for Bench Press'),
      );
    };

    it('adds a bonus set and goes straight to it', async () => {
      const view = await renderScreen();
      await openMenu(view);
      await fireEvent.press(view.getByLabelText('Add a set'));
      expect(
        await view.findByText('Exercise 1 of 2 · set 4 of 4'),
      ).toBeTruthy();
      // A bonus set has no target, so there is nothing to compare it against.
      expect(view.getByText(/bonus set/)).toBeTruthy();
    });

    // U11: an exercise with something recorded is finished, not skipped.
    // Calling it skipped understates the work.
    it('finishes a part-done exercise and moves to the next', async () => {
      const session = (await getActiveSession(ctx.db))!;
      await completeSet(ctx.db, session.exercises[0]!.sets[0]!.id, {
        actualReps: 10,
        actualWeight: 30,
      });
      const view = await renderScreen();
      await openMenu(view);
      await fireEvent.press(view.getByLabelText('Finish this exercise'));
      expect(await view.findByText('Cable Fly')).toBeTruthy();
      const after = await getActiveSession(ctx.db);
      expect(after!.exercises[0]!.status).toBe('completed');
    });

    it('skips an exercise nothing was recorded on', async () => {
      const view = await renderScreen();
      await openMenu(view);
      await fireEvent.press(view.getByLabelText('Skip this exercise'));
      expect(await view.findByText('Cable Fly')).toBeTruthy();
      const after = await getActiveSession(ctx.db);
      expect(after!.exercises[0]!.status).toBe('skipped');
    });

    it('sends a swap to the picker rather than doing it blind', async () => {
      const view = await renderScreen();
      await openMenu(view);
      await fireEvent.press(view.getByLabelText('Swap for another exercise'));
      expect(mockNavigate).toHaveBeenCalledWith('WorkoutExercisePicker', {
        mode: 'swap',
        performedExerciseId: expect.any(String),
      });
    });

    /**
     * The field this replaces committed on a debounce, on blur and on unmount,
     * because on a full screen it was usually below the fold and there was no
     * reliable moment when the user had finished with it. A sheet with a Save
     * button has exactly that moment.
     */
    it('writes a note when the sheet is saved', async () => {
      const view = await renderScreen();
      await openMenu(view);
      await fireEvent.press(view.getByLabelText('Add a note'));
      await fireEvent.changeText(
        await view.findByLabelText('Note'),
        'felt heavy',
      );
      await fireEvent.press(view.getByText('Save note'));
      await waitFor(async () => {
        const after = await getActiveSession(ctx.db);
        expect(after!.exercises[0]!.notes).toBe('felt heavy');
      });
    });

    // An empty field means no note, not a note that is empty -- a blank
    // string would render as a stray line under the exercise.
    it('stores no note rather than an empty one', async () => {
      const view = await renderScreen();
      await openMenu(view);
      await fireEvent.press(view.getByLabelText('Add a note'));
      await fireEvent.changeText(await view.findByLabelText('Note'), '   ');
      await fireEvent.press(view.getByText('Save note'));
      await waitFor(async () => {
        const after = await getActiveSession(ctx.db);
        expect(after!.exercises[0]!.notes).toBeNull();
      });
    });

    /**
     * The complaint that started this: "if I have added a set by mistake and
     * I want to delete it there is no way to do that".
     */
    it('removes a bonus set added by mistake', async () => {
      const view = await renderScreen();
      await openMenu(view);
      await fireEvent.press(view.getByLabelText('Add a set'));
      await view.findByText('Exercise 1 of 2 · set 4 of 4');

      await fireEvent.press(
        await view.findByLabelText('Actions for Bench Press'),
      );
      await fireEvent.press(view.getByLabelText('Remove set 4'));
      await waitFor(async () => {
        expect(await sets()).toHaveLength(3);
      });
      expect(
        await view.findByText('Exercise 1 of 2 · set 3 of 3'),
      ).toBeTruthy();
    });

    // Erasing a planned set would shrink the denominator and flatter the
    // workout. Skipping it is the honest record.
    it('offers no way to remove a planned set', async () => {
      const view = await renderScreen();
      await openMenu(view);
      expect(
        view.getByLabelText('Remove set 1').props.accessibilityState.disabled,
      ).toBe(true);
    });

    it('reorders the session from the menu', async () => {
      const view = await renderScreen();
      await openMenu(view);
      await fireEvent.press(view.getByLabelText('Move down'));
      await waitFor(async () => {
        const after = await getActiveSession(ctx.db);
        expect(after!.exercises[0]!.name).toBe('Cable Fly');
      });
    });
  });

  describe('finishing', () => {
    /**
     * In a flow with no list to fall back to there is no other natural end,
     * so the sheet arrives on its own rather than waiting to be found.
     */
    it('offers to finish once the last set is recorded', async () => {
      const session = (await getActiveSession(ctx.db))!;
      const all = session.exercises.flatMap(e => e.sets);
      for (const set of all.slice(0, all.length - 1)) {
        await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
      }
      const view = await renderScreen();
      await view.findByText('Exercise 2 of 2 · set 3 of 3');
      await fireEvent.press(view.getByLabelText('Record 10 × 30 kg'));
      expect(await view.findByText('That was the last set.')).toBeTruthy();
    });

    it('can be ended early from the header', async () => {
      const view = await renderScreen();
      await fireEvent.press(await view.findByLabelText('Finish workout'));
      expect(await view.findByText('Finish this workout?')).toBeTruthy();
    });

    it('saves the session and leaves', async () => {
      const view = await renderScreen();
      await fireEvent.press(await view.findByLabelText('Finish workout'));
      await fireEvent.press(await view.findByText('Save workout'));
      await waitFor(async () => {
        expect(await getActiveSession(ctx.db)).toBeUndefined();
      });
      expect(mockGoBack).toHaveBeenCalled();
    });

    it('goes back into the workout rather than saving', async () => {
      const view = await renderScreen();
      await fireEvent.press(await view.findByLabelText('Finish workout'));
      await fireEvent.press(await view.findByText('Go back in'));
      expect(await getActiveSession(ctx.db)).toBeDefined();
    });
  });

  describe('amending a recorded set', () => {
    const goToRecordedSet = async (
      view: Awaited<ReturnType<typeof render>>,
    ) => {
      await view.findByText('Bench Press');
      await fireEvent.press(view.getByLabelText('Go to set 1 of Bench Press'));
    };

    beforeEach(async () => {
      const session = (await getActiveSession(ctx.db))!;
      await completeSet(ctx.db, session.exercises[0]!.sets[0]!.id, {
        actualReps: 8,
        actualWeight: 30,
      });
    });

    // Blue means live; ochre means you are altering the record. The caption
    // keeps the old value so you can see what you are moving away from.
    it('says what is on record while you change it', async () => {
      const view = await renderScreen();
      await goToRecordedSet(view);
      expect(view.getByText('amending a recorded set')).toBeTruthy();
      expect(view.getByText(/recorded as 8/)).toBeTruthy();
    });

    // §14 makes the actual editable, and completeSet overwrites: a wrong
    // number must never be stuck in history.
    it('overwrites the number when saved', async () => {
      const view = await renderScreen();
      await goToRecordedSet(view);
      await fireEvent.press(view.getByLabelText('One rep more'));
      await fireEvent.press(view.getByLabelText('Save change'));
      await waitFor(async () => {
        expect((await sets())[0]!.actualReps).toBe(9);
      });
    });

    /**
     * Back to the live set, not forward to the next pending one. Advancing
     * after correcting set 1 would walk you backwards through a workout you
     * had already reached the end of.
     */
    it('returns to the live set once saved', async () => {
      const view = await renderScreen();
      await goToRecordedSet(view);
      await fireEvent.press(view.getByLabelText('Save change'));
      expect(
        await view.findByText('Exercise 1 of 2 · set 2 of 3'),
      ).toBeTruthy();
    });

    it('leaves the record alone when cancelled', async () => {
      const view = await renderScreen();
      await goToRecordedSet(view);
      await fireEvent.press(view.getByLabelText('One rep more'));
      await fireEvent.press(view.getByLabelText('Cancel'));
      expect(
        await view.findByText('Exercise 1 of 2 · set 2 of 3'),
      ).toBeTruthy();
      expect((await sets())[0]!.actualReps).toBe(8);
    });

    // You are fixing a number, so the number that was typed is a better
    // starting point than the one it was aiming at.
    it('opens on what was recorded, not on the target', async () => {
      const view = await renderScreen();
      await goToRecordedSet(view);
      expect(view.getByLabelText('8 reps')).toBeTruthy();
    });
  });
});

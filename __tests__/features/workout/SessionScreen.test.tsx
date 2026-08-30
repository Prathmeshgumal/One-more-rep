import React from 'react';
import {render, fireEvent, act} from '@testing-library/react-native';
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

const mockGoBack = jest.fn();
const mockFocus: Array<() => void> = [];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: jest.fn(), goBack: mockGoBack}),
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
});

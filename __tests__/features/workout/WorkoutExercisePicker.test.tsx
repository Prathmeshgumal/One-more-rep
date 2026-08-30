import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay} from '@/domain/planDraft';
import {startWorkout, getActiveSession} from '@/repositories/sessionRepo';
import {getActivePlan} from '@/repositories/planRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {WorkoutExercisePickerScreen} from '@/features/workout/WorkoutExercisePickerScreen';
import {createTestDb} from '../../helpers/testDb';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
let mockParams: object | undefined;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({goBack: mockGoBack, navigate: mockNavigate}),
  useRoute: () => ({params: mockParams}),
}));

describe('WorkoutExercisePickerScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <WorkoutExercisePickerScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  const today = () => {
    const d = new Date();
    return (d.getDay() + 6) % 7;
  };

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('dip','Parallel Bar Dip','chest','[]','body only','strength',0,0,0)`,
    );
    await createPlan(ctx.db);
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, today(), 'Push Day'), today(), ['bench']),
    );
    await startWorkout(ctx.db);

    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockGoBack.mockClear();
    mockParams = undefined;
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  // Found on the device: the back control had been inserted into the row
  // renderer, so every exercise card drew its own chevron. A structural test
  // that only asks "is there a BackButton" cannot see this. Writing the test
  // also turned up why the control is called "Go back" — this screen has a
  // "Back" muscle filter, and both were announced identically.
  it('draws one back control, not one per row', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    expect(view.getAllByLabelText('Go back')).toHaveLength(1);
  });

  it('lists the library', async () => {
    const view = await renderScreen();
    expect(await view.findByText('Parallel Bar Dip')).toBeTruthy();
  });

  it('adds the exercise on one tap and returns', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Parallel Bar Dip'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());

    const session = (await getActiveSession(ctx.db))!;
    expect(session.exercises.map(e => e.name)).toEqual([
      'Bench Press',
      'Parallel Bar Dip',
    ]);
  });

  // D3: no planned_exercise_id is exactly what keeps bonus work out of the
  // completion percentage.
  it('adds it as unplanned, with a set ready to record', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Parallel Bar Dip'));
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());

    const session = (await getActiveSession(ctx.db))!;
    const added = session.exercises[1]!;
    expect(added.plannedExerciseId).toBeNull();
    expect(added.sets).toHaveLength(1);
    expect(added.sets[0]!.isUnplanned).toBe(true);
    expect(added.sets[0]!.targetReps).toBeNull();
  });

  it('narrows the list as the user searches', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    await fireEvent.changeText(
      view.getByPlaceholderText('Search exercises'),
      'dip',
    );
    await waitFor(() => {
      expect(view.queryByText('Bench Press')).toBeNull();
      expect(view.getByText('Parallel Bar Dip')).toBeTruthy();
    });
  });
});

describe('WorkoutExercisePickerScreen, adding to the plan as well', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <WorkoutExercisePickerScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  const today = () => {
    const d = new Date();
    return (d.getDay() + 6) % 7;
  };

  const planNames = async () =>
    (await getActivePlan(ctx.db))!.days[today()]!.exercises.map(e => e.name);

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('dip','Parallel Bar Dip','chest','[]','body only','strength',0,0,0),
                 ('db','Dumbbell Press','chest','[]','dumbbell','strength',1,0,0)`,
    );
    await createPlan(ctx.db);
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, today(), 'Push Day'), today(), ['bench']),
    );
    await startWorkout(ctx.db);
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockGoBack.mockClear();
    mockParams = undefined;
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('adds to the session only, by default', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Parallel Bar Dip'));
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
    expect(await planNames()).toEqual(['Bench Press']);
  });

  it('also adds to the weekly plan when asked', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Also add to the plan'));
    await fireEvent.press(view.getByText('Parallel Bar Dip'));

    await waitFor(async () =>
      expect(await planNames()).toEqual(['Bench Press', 'Parallel Bar Dip']),
    );
  });

  // Section 39 from the other side: the plan gained an exercise and forked a
  // new version, and the running session's own snapshotted targets did not
  // move. This is the invariant complaint 4 ran into, working as designed.
  it('leaves the running session untouched when the plan is edited', async () => {
    const before = (await getActiveSession(ctx.db))!;
    const plannedBefore = before.exercises.filter(
      e => e.plannedExerciseId !== null,
    );

    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Also add to the plan'));
    await fireEvent.press(view.getByText('Parallel Bar Dip'));
    await waitFor(async () => expect(await planNames()).toHaveLength(2));

    const after = (await getActiveSession(ctx.db))!;
    expect(after.exercises.filter(e => e.plannedExerciseId !== null)).toEqual(
      plannedBefore,
    );
  });

  it('in swap mode, replaces rather than appends', async () => {
    const session = (await getActiveSession(ctx.db))!;
    mockParams = {mode: 'swap', performedExerciseId: session.exercises[0]!.id};

    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Dumbbell Press'));
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());

    const after = (await getActiveSession(ctx.db))!;
    expect(after.exercises).toHaveLength(1);
    expect(after.exercises[0]!.name).toBe('Dumbbell Press');
    expect(after.exercises[0]!.substitutedFromName).toBe('Bench Press');
  });

  it('says what it is swapping, so the wrong tap is obvious', async () => {
    const session = (await getActiveSession(ctx.db))!;
    mockParams = {mode: 'swap', performedExerciseId: session.exercises[0]!.id};
    const view = await renderScreen();
    expect(await view.findByText(/Swap Bench Press/)).toBeTruthy();
  });

  it('offers no plan checkbox in swap mode', async () => {
    const session = (await getActiveSession(ctx.db))!;
    mockParams = {mode: 'swap', performedExerciseId: session.exercises[0]!.id};
    const view = await renderScreen();
    await view.findByText('Dumbbell Press');
    expect(view.queryByLabelText('Also add to the plan')).toBeNull();
  });
  /**
   * Reported from the phone: "I don't see an option to add a custom
   * exercise". It was there — as the list's footer, under four hundred
   * exercises, which is the same as not being there.
   */
  describe('creating one that is not in the library', () => {
    const readingOrder = (tree: unknown): string[] => {
      const strings: string[] = [];
      const walk = (node: unknown): void => {
        if (typeof node === 'string') {
          strings.push(node);
          return;
        }
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        if (node && typeof node === 'object' && 'children' in node) {
          walk((node as {children: unknown}).children);
        }
      };
      walk(tree);
      return strings;
    };

    it('offers it above the results, not under them', async () => {
      const view = await renderScreen();
      await view.findByText('Dumbbell Press');

      const order = readingOrder(view.toJSON());
      expect(order.indexOf('Create a new exercise')).toBeGreaterThan(-1);
      expect(order.indexOf('Create a new exercise')).toBeLessThan(
        order.indexOf('Dumbbell Press'),
      );
    });

    it('names what you typed, so it need not be typed twice', async () => {
      const view = await renderScreen();
      await view.findByText('Dumbbell Press');
      await fireEvent.changeText(
        view.getByPlaceholderText('Search exercises'),
        'Zercher Squat',
      );
      await waitFor(() =>
        expect(view.getByText('Create "Zercher Squat"')).toBeTruthy(),
      );
    });

    it('carries the search into the editor', async () => {
      const view = await renderScreen();
      await view.findByText('Dumbbell Press');
      await fireEvent.changeText(
        view.getByPlaceholderText('Search exercises'),
        'Zercher Squat',
      );
      await waitFor(() =>
        expect(view.getByText('Create "Zercher Squat"')).toBeTruthy(),
      );
      await fireEvent.press(view.getByLabelText('Create "Zercher Squat"'));
      expect(mockNavigate).toHaveBeenCalledWith('ExerciseEditor', {
        initialName: 'Zercher Squat',
      });
    });

    /** Swapping is still a pick, and the movement may still not exist. */
    it('offers it in swap mode too', async () => {
      const session = (await getActiveSession(ctx.db))!;
      mockParams = {
        mode: 'swap',
        performedExerciseId: session.exercises[0]!.id,
      };
      const view = await renderScreen();
      await view.findByText('Dumbbell Press');
      expect(view.getByLabelText('Create a new exercise')).toBeTruthy();
    });
  });
});

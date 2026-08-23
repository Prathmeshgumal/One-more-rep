import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay} from '@/domain/planDraft';
import {startWorkout, getActiveSession} from '@/repositories/sessionRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {WorkoutExercisePickerScreen} from '@/features/workout/WorkoutExercisePickerScreen';
import {createTestDb} from '../../helpers/testDb';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({goBack: mockGoBack, navigate: jest.fn()}),
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

import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan, getActivePlan} from '@/repositories/planRepo';
import {addExercises} from '@/domain/planDraft';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {TargetEditorScreen} from '@/features/plan/TargetEditorScreen';
import {createTestDb} from '../../helpers/testDb';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({goBack: mockGoBack, navigate: jest.fn()}),
  useRoute: () => ({params: {weekday: 0, exerciseIndex: 0}}),
}));

describe('TargetEditorScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <TargetEditorScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  const savedSets = async () => {
    const plan = await getActivePlan(ctx.db);
    return plan!.days[0]!.exercises[0]!.sets;
  };

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    await createPlan(ctx.db);
    await editPlan(ctx.db, d => addExercises(d, 0, ['bench']));
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockGoBack.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('opens on the exercise it was asked for', async () => {
    const view = await renderScreen();
    expect(await view.findByText('Bench Press')).toBeTruthy();
  });

  it('defaults to one target for every set', async () => {
    const view = await renderScreen();
    expect(
      (await view.findByLabelText('Same target every set')).props
        .accessibilityState.checked,
    ).toBe(true);
  });

  it('changes the number of sets', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Increase Sets'));
    await fireEvent.press(view.getByText('Save target'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
    expect(await savedSets()).toHaveLength(4);
  });

  it('applies one target to every set while the toggle is on', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Increase Reps'));
    await fireEvent.press(view.getByLabelText('Increase Weight'));
    await fireEvent.press(view.getByText('Save target'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
    const sets = await savedSets();
    expect(sets).toHaveLength(3);
    expect(sets.every(s => s.targetReps === 11)).toBe(true);
    expect(sets.every(s => s.targetWeight === 2.5)).toBe(true);
  });

  it('never goes below one set or one rep', async () => {
    const view = await renderScreen();
    const sets = await view.findByLabelText('Sets');
    await fireEvent.changeText(sets, '1');
    await fireEvent.press(view.getByLabelText('Decrease Sets'));
    expect(view.getByLabelText('Sets').props.value).toBe('1');
  });

  // Section 9: weight is optional, and NULL is not the same as 0 — a zero
  // target would log zero volume into history forever.
  it('saves no weight at all rather than zero', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Save target'));
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
    expect((await savedSets()).every(s => s.targetWeight === null)).toBe(true);
  });

  it('reveals a per-set table when the toggle is turned off', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Same target every set'));
    expect(view.getByText('Per-set targets')).toBeTruthy();
    expect(view.getByLabelText('Edit set 1')).toBeTruthy();
    expect(view.getByLabelText('Edit set 3')).toBeTruthy();
  });

  it('sets a different target for one set only', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Same target every set'));
    await fireEvent.press(view.getByLabelText('Edit set 3'));
    await fireEvent.changeText(view.getByLabelText('Reps'), '8');
    await fireEvent.changeText(view.getByLabelText('Weight'), '30');
    await fireEvent.press(view.getByText('Save target'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
    const sets = await savedSets();
    expect(sets[0]!.targetReps).toBe(10);
    expect(sets[2]).toEqual({setNumber: 3, targetReps: 8, targetWeight: 30});
  });
});

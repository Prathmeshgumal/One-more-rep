import React from 'react';
import {render, fireEvent, waitFor, act} from '@testing-library/react-native';
import {exerciseKeys} from '@/features/exercises/useExercises';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {runMigrations} from '@/db/migrate';
import {createCustomExercise, listExercises} from '@/repositories/exerciseRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {ExerciseEditorScreen} from '@/features/exercises/ExerciseEditorScreen';
import {createTestDb} from '../../helpers/testDb';

const mockGoBack = jest.fn();
const mockParams: {id?: string} = {};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({goBack: mockGoBack, navigate: jest.fn()}),
  useRoute: () => ({params: mockParams}),
}));

describe('ExerciseEditorScreen, editing an existing exercise', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <ExerciseEditorScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockGoBack.mockClear();

    const created = await createCustomExercise(ctx.db, {
      name: 'Cable Fly',
      primaryMuscle: 'chest',
      secondaryMuscles: [],
      equipment: 'cable',
      weightApplicable: true,
    });
    mockParams.id = created.id;
  });

  afterEach(() => {
    client.clear();
    ctx.close();
    delete mockParams.id;
  });

  it('opens with the exercise already filled in', async () => {
    const view = await renderScreen();
    await waitFor(() => {
      expect(view.getByPlaceholderText('Exercise name').props.value).toBe(
        'Cable Fly',
      );
    });
    expect(view.getByLabelText('Chest').props.accessibilityState.selected).toBe(
      true,
    );
  });

  // The regression this guards: `existing` is a fresh object on every refetch,
  // so an unguarded populate effect re-runs and overwrites whatever has been
  // typed since. Losing someone's edits mid-sentence never reproduces on
  // demand, so it gets a test rather than a careful reading.
  it('does not overwrite what the user has typed when the query refetches', async () => {
    const view = await renderScreen();
    await waitFor(() => {
      expect(view.getByPlaceholderText('Exercise name').props.value).toBe(
        'Cable Fly',
      );
    });

    await fireEvent.changeText(
      view.getByPlaceholderText('Exercise name'),
      'Cable Fly (wide grip)',
    );

    // A refetch, expressed as what a refetch actually does to this component:
    // hand it a fresh object for the same key. Going through
    // invalidateQueries here deadlocks against RNTL's own act().
    await act(async () => {
      client.setQueryData(exerciseKeys.detail(mockParams.id!), {
        ...(client.getQueryData(exerciseKeys.detail(mockParams.id!)) as object),
      });
    });

    expect(view.getByPlaceholderText('Exercise name').props.value).toBe(
      'Cable Fly (wide grip)',
    );
  });

  it('saves the edit back to the same row rather than creating a second one', async () => {
    const view = await renderScreen();
    await waitFor(() => {
      expect(view.getByPlaceholderText('Exercise name').props.value).toBe(
        'Cable Fly',
      );
    });

    await fireEvent.changeText(
      view.getByPlaceholderText('Exercise name'),
      'Cable Fly (wide grip)',
    );
    await fireEvent.press(view.getByText('Save exercise'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());

    const all = await listExercises(ctx.db);
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe('Cable Fly (wide grip)');
  });
});

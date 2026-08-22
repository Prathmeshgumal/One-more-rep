import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { runMigrations } from '@/db/migrate';
import { listExercises } from '@/repositories/exerciseRepo';
import { ThemeProvider } from '@/theme';
import { DatabaseContextTestProvider } from '@/providers/DatabaseGate';
import { ExerciseEditorScreen } from '@/features/exercises/ExerciseEditorScreen';
import { createTestDb } from '../../helpers/testDb';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

describe('ExerciseEditorScreen', () => {
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
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    mockGoBack.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('will not save without a name', async () => {
    const view = await renderScreen();
    await fireEvent.press(view.getByText('Save exercise'));
    expect(await view.findByText(/Give the exercise a name/i)).toBeTruthy();
    expect(await listExercises(ctx.db)).toHaveLength(0);
  });

  it('will not save without a primary muscle', async () => {
    const view = await renderScreen();
    await fireEvent.changeText(
      view.getByPlaceholderText('Exercise name'),
      'Cable Fly',
    );
    await fireEvent.press(view.getByText('Save exercise'));
    expect(await view.findByText(/Pick the muscle/i)).toBeTruthy();
    expect(await listExercises(ctx.db)).toHaveLength(0);
  });

  it('saves a custom exercise and goes back', async () => {
    const view = await renderScreen();
    await fireEvent.changeText(
      view.getByPlaceholderText('Exercise name'),
      'Cable Fly',
    );
    await fireEvent.press(view.getByLabelText('Chest'));
    await fireEvent.press(view.getByLabelText('Cable'));
    await fireEvent.press(view.getByText('Save exercise'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());

    const [saved] = await listExercises(ctx.db);
    expect(saved!.name).toBe('Cable Fly');
    expect(saved!.primaryMuscle).toBe('chest');
    expect(saved!.equipment).toBe('cable');
    expect(saved!.isCustom).toBe(true);
  });

  it('tracks weight by default and can be turned off', async () => {
    const view = await renderScreen();
    expect(
      view.getByLabelText('Track weight').props.accessibilityState.checked,
    ).toBe(true);

    await fireEvent.changeText(
      view.getByPlaceholderText('Exercise name'),
      'Air Squat',
    );
    await fireEvent.press(view.getByLabelText('Chest'));
    await fireEvent.press(view.getByLabelText('Bodyweight'));
    await fireEvent.press(view.getByLabelText('Track weight'));
    await fireEvent.press(view.getByText('Save exercise'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());

    const [saved] = await listExercises(ctx.db);
    expect(saved!.weightApplicable).toBe(false);
  });
});

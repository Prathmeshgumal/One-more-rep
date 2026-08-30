import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {runMigrations} from '@/db/migrate';
import {createCustomExercise} from '@/repositories/exerciseRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {ExerciseListScreen} from '@/features/exercises/ExerciseListScreen';
import {createTestDb} from '../../helpers/testDb';

describe('ExerciseListScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <ExerciseListScreen />
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

    await createCustomExercise(ctx.db, {
      name: 'Cable Fly',
      primaryMuscle: 'chest',
      secondaryMuscles: ['shoulders'],
      equipment: 'cable',
      weightApplicable: true,
    });
    await createCustomExercise(ctx.db, {
      name: 'Air Squat',
      primaryMuscle: 'quadriceps',
      secondaryMuscles: [],
      equipment: 'body only',
      weightApplicable: false,
    });
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('lists what is in the library', async () => {
    const view = await renderScreen();
    expect(await view.findByText('Cable Fly')).toBeTruthy();
    expect(view.getByText('Air Squat')).toBeTruthy();
  });

  it('shows each exercise its muscles and equipment', async () => {
    const view = await renderScreen();
    expect(await view.findByText(/chest.*cable/i)).toBeTruthy();
  });

  it('badges custom exercises', async () => {
    const view = await renderScreen();
    expect((await view.findAllByText('Custom')).length).toBe(2);
  });

  it('narrows the list as the user searches', async () => {
    const view = await renderScreen();
    await view.findByText('Cable Fly');
    await fireEvent.changeText(
      view.getByPlaceholderText('Search exercises'),
      'squat',
    );
    // Wait for what should be there, not for what should be gone: a list that
    // is merely still loading also has no "Cable Fly" in it.
    await waitFor(() => {
      expect(view.queryByText('Cable Fly')).toBeNull();
      expect(view.getByText('Air Squat')).toBeTruthy();
    });
  });

  it('filters by muscle when a chip is tapped', async () => {
    const view = await renderScreen();
    await view.findByText('Cable Fly');
    await fireEvent.press(view.getByLabelText('Chest'));
    await waitFor(() => {
      expect(view.queryByText('Air Squat')).toBeNull();
      expect(view.getByText('Cable Fly')).toBeTruthy();
    });
  });

  it('says so plainly when a search matches nothing', async () => {
    const view = await renderScreen();
    await view.findByText('Cable Fly');
    await fireEvent.changeText(
      view.getByPlaceholderText('Search exercises'),
      'zzzz',
    );
    expect(await view.findByText(/No exercises match/i)).toBeTruthy();
  });

  it('counts the library', async () => {
    const view = await renderScreen();
    expect(await view.findByText('2 exercises')).toBeTruthy();
  });
});

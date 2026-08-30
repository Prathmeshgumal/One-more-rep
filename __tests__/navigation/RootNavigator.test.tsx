import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {NavigationContainer} from '@react-navigation/native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {runMigrations} from '@/db/migrate';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {RootNavigator} from '@/navigation/RootNavigator';
import {createTestDb} from '../helpers/testDb';

describe('RootNavigator', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderApp = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <RootNavigator />
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
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('opens on Today', async () => {
    const view = await renderApp();
    // The fixture has no plan, so Today shows the empty state that points at
    // the Plan tab. Phase 3 replaced the placeholder this used to match.
    expect(await view.findByText(/No plan yet/i)).toBeTruthy();
  });

  it('reaches both tabs', async () => {
    const view = await renderApp();
    // Asserted on each screen's own copy rather than its title, because a tab
    // label and its heading can read the same.
    await fireEvent.press(view.getByRole('button', {name: /Settings/}));
    await waitFor(() => {
      // The section index, which nothing else in the app draws.
      expect(view.getByLabelText('Jump to Lifting')).toBeTruthy();
    });
  });

  // Plan, History and the exercise library were tabs. Losing a tab must not
  // mean losing the screen, so each is asserted reachable by its new route.
  // The fixture has no plan, so Today offers the plan itself rather than a
  // button to the screen that offers it. Either way the week is one tap away.
  it('reaches the plan from Today, where the tab used to be', async () => {
    const view = await renderApp();
    await fireEvent.press(await view.findByText('Create plan'));
    await waitFor(() => {
      expect(view.getAllByText(/Your week/i).length).toBeGreaterThan(0);
    });
  });

  it('reaches history from Today', async () => {
    const view = await renderApp();
    await fireEvent.press(await view.findByLabelText('History'));
    await waitFor(() => {
      expect(
        view.getAllByText(/completed workouts will appear here/i).length,
      ).toBeGreaterThan(0);
    });
  });

  it('reaches the exercise library through Settings', async () => {
    const view = await renderApp();
    await fireEvent.press(view.getByRole('button', {name: /Settings/}));
    await waitFor(() => {
      expect(view.getByText('Exercise library')).toBeTruthy();
    });
    await fireEvent.press(view.getByText('Exercise library'));
    await waitFor(() => {
      expect(view.getAllByText(/create your own/i).length).toBeGreaterThan(0);
    });
  });
});

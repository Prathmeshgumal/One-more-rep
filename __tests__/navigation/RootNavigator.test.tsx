import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { runMigrations } from '@/db/migrate';
import { ThemeProvider } from '@/theme';
import { DatabaseContextTestProvider } from '@/providers/DatabaseGate';
import { RootNavigator } from '@/navigation/RootNavigator';
import { createTestDb } from '../helpers/testDb';

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
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('opens on Today', async () => {
    const view = await renderApp();
    expect(view.getByText(/workout for today/i)).toBeTruthy();
  });

  it('reaches every one of the five tabs', async () => {
    const view = await renderApp();
    // Asserted on each screen's own copy rather than its title, because a tab
    // label and its heading can read the same.
    const tabs: ReadonlyArray<readonly [string, RegExp]> = [
      ['Plan', /weekly routine/i],
      ['History', /past workouts/i],
      ['Exercises', /create your own/i],
      ['Settings', /weight unit/i],
    ];
    for (const [tab, marker] of tabs) {
      await fireEvent.press(
        view.getByRole('button', { name: new RegExp(tab) }),
      );
      await waitFor(() => {
        expect(view.getAllByText(marker).length).toBeGreaterThan(0);
      });
    }
  });
});

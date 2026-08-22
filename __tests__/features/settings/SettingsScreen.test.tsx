import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { runMigrations } from '@/db/migrate';
import { getSettings } from '@/repositories/settingsRepo';
import { ThemeProvider } from '@/theme';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { DatabaseContextTestProvider } from '@/providers/DatabaseGate';
import { createTestDb } from '../../helpers/testDb';

describe('SettingsScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <SettingsScreen />
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    // gcTime 0 so no collection timer outlives the test and hangs the run.
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('shows the stored unit', async () => {
    const view = await renderScreen();
    await waitFor(() => {
      expect(
        view.getByLabelText('Kilograms').props.accessibilityState.selected,
      ).toBe(true);
    });
  });

  it('writes the new unit to the database and re-renders', async () => {
    const view = await renderScreen();

    // The controls are disabled while the first query is in flight, and
    // findBy resolves as soon as the element exists rather than when it is
    // live. Waiting for the loaded state is what makes the press land.
    await waitFor(() => {
      expect(
        view.getByLabelText('Kilograms').props.accessibilityState.selected,
      ).toBe(true);
    });

    await fireEvent.press(view.getByLabelText('Pounds'));

    // Wait on the UI, not on the database. The screen only shows Pounds
    // selected once the write has landed and its invalidation has refetched,
    // so this is deterministic; polling the database directly races the
    // mutation and fails intermittently under load.
    await waitFor(() => {
      expect(
        view.getByLabelText('Pounds').props.accessibilityState.selected,
      ).toBe(true);
    });
    expect((await getSettings(ctx.db)).unit).toBe('lb');
  });
});

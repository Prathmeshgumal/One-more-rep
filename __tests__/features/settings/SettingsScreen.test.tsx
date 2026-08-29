import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { runMigrations } from '@/db/migrate';
import { getSettings } from '@/repositories/settingsRepo';
import { ThemeProvider, useThemeMode } from '@/theme';
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
    useThemeMode.setState({ mode: 'system' });
  });

  /** The controls are disabled until the first query lands. */
  const settled = async (view: Awaited<ReturnType<typeof renderScreen>>) =>
    waitFor(() => {
      expect(
        view.getByLabelText('Kilograms').props.accessibilityState.selected,
      ).toBe(true);
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

  it('starts on the system theme', async () => {
    const view = await renderScreen();
    await settled(view);
    expect(view.getByLabelText('System').props.accessibilityState.selected).toBe(
      true,
    );
  });

  it('writes a theme choice and applies it immediately', async () => {
    const view = await renderScreen();
    await settled(view);

    await fireEvent.press(view.getByLabelText('Dark'));

    await waitFor(() => {
      expect(view.getByLabelText('Dark').props.accessibilityState.selected).toBe(
        true,
      );
    });
    // Written to the database, so it survives a relaunch...
    expect((await getSettings(ctx.db)).themeMode).toBe('dark');
    // ...and pushed into the store, so the app repaints on the tap rather than
    // on the next launch.
    expect(useThemeMode.getState().mode).toBe('dark');
  });

  it('shows the stored weight step', async () => {
    const view = await renderScreen();
    await settled(view);
    expect(
      view.getByLabelText('Step by 0.5').props.accessibilityState.selected,
    ).toBe(true);
  });

  it('writes a weight step choice', async () => {
    const view = await renderScreen();
    await settled(view);

    await fireEvent.press(view.getByLabelText('Step by 2.5'));

    await waitFor(() => {
      expect(
        view.getByLabelText('Step by 2.5').props.accessibilityState.selected,
      ).toBe(true);
    });
    expect((await getSettings(ctx.db)).defaultIncrement).toBe(2.5);
  });
});

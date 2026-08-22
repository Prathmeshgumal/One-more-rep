import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {runMigrations} from '@/db/migrate';
import {getSettings} from '@/repositories/settingsRepo';
import {ThemeProvider} from '@/theme';
import {SettingsScreen} from '@/features/settings/SettingsScreen';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {createTestDb} from '../../helpers/testDb';

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
      defaultOptions: {queries: {retry: false, gcTime: 0}},
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
    await view.findByLabelText('Pounds');
    fireEvent.press(view.getByLabelText('Pounds'));

    await waitFor(async () => {
      expect((await getSettings(ctx.db)).unit).toBe('lb');
    });
    await waitFor(() => {
      expect(
        view.getByLabelText('Pounds').props.accessibilityState.selected,
      ).toBe(true);
    });
  });
});

import React from 'react';
import {render} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {renameDay} from '@/domain/planDraft';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {PlanHistoryScreen} from '@/features/plan/PlanHistoryScreen';
import {createTestDb} from '../../helpers/testDb';

const MON = new Date(2026, 7, 17, 9).getTime();
const TUE = new Date(2026, 7, 18, 9).getTime();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({goBack: jest.fn(), navigate: jest.fn()}),
}));

describe('PlanHistoryScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <PlanHistoryScreen />
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

  it('shows a single active version for a fresh plan', async () => {
    await createPlan(ctx.db, {now: MON});
    const view = await renderScreen();
    expect(await view.findByText('Active')).toBeTruthy();
    expect(view.getByText(/1 version/)).toBeTruthy();
  });

  // The whole point of the screen: an edit across a day boundary must be
  // visible as a second version, or forking is invisible to the user.
  it('shows a second version after an edit forks one', async () => {
    await createPlan(ctx.db, {now: MON});
    await editPlan(ctx.db, d => renameDay(d, 0, 'Push Day'), TUE);

    const view = await renderScreen();
    expect(await view.findByText(/2 versions/)).toBeTruthy();
    expect(view.getAllByText(/Replaced/).length).toBe(1);
    expect(view.getAllByText('Active').length).toBe(1);
  });

  it('says so when there is no plan at all', async () => {
    const view = await renderScreen();
    expect(await view.findByText(/No plan yet/i)).toBeTruthy();
  });
});

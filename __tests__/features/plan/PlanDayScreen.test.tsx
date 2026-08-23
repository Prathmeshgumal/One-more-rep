import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {
  createPlan,
  editPlan,
  getActivePlan,
  listPlanVersions,
} from '@/repositories/planRepo';
import {addExercises, renameDay, setRestDay} from '@/domain/planDraft';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {PlanDayScreen} from '@/features/plan/PlanDayScreen';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
const mockBeforeRemove: Array<() => void> = [];
const mockParams: {weekday: number} = {weekday: 0};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    // Records the listener so a test can fire the screen's removal, which is
    // the only exit Android's hardware back actually takes.
    addListener: (event: string, cb: () => void) => {
      if (event === 'beforeRemove') {
        mockBeforeRemove.push(cb);
      }
      return () => {};
    },
  }),
  useRoute: () => ({params: mockParams}),
}));

describe('PlanDayScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <PlanDayScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0)`,
    );
    await createPlan(ctx.db);
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockParams.weekday = 0;
    mockNavigate.mockClear();
    mockBeforeRemove.length = 0;
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('offers to set up a day that has nothing on it', async () => {
    const view = await renderScreen();
    expect(await view.findByText('Set up Monday')).toBeTruthy();
    expect(view.getByText('Nothing here yet')).toBeTruthy();
    // The design: while the day is undecided, rest is a full button.
    expect(view.getByText('Make Monday a rest day')).toBeTruthy();
  });

  // Found on the device at the Phase 4 gate: Android's hardware back dismisses
  // the keyboard without blurring the input, so onBlur never fired and the new
  // name was silently discarded.
  it('keeps a rename that was never blurred, when the screen is left', async () => {
    const view = await renderScreen();
    const field = await view.findByLabelText('Day name');
    await fireEvent.changeText(field, 'Leg Day');

    // No blur, no submit — just leaving, the way the back button does it.
    for (const listener of mockBeforeRemove) {
      listener();
    }

    await waitFor(async () => {
      const plan = await getActivePlan(ctx.db);
      expect(plan!.days[0]!.customName).toBe('Leg Day');
    });
  });

  it('writes a rename once, even when submit and leaving both fire', async () => {
    const view = await renderScreen();
    const field = await view.findByLabelText('Day name');
    await fireEvent.changeText(field, 'Pull Day');
    await fireEvent(field, 'blur');
    await waitFor(async () => {
      const plan = await getActivePlan(ctx.db);
      expect(plan!.days[0]!.customName).toBe('Pull Day');
    });

    const before = await listPlanVersions(ctx.db);
    for (const listener of mockBeforeRemove) {
      listener();
    }
    // A second identical write would fork a second plan version for nothing.
    const after = await listPlanVersions(ctx.db);
    expect(after).toHaveLength(before.length);
  });

  it('renames the day', async () => {
    const view = await renderScreen();
    const field = await view.findByLabelText('Day name');
    await fireEvent.changeText(field, 'Push Day');
    await fireEvent(field, 'blur');

    await waitFor(async () => {
      const plan = await getActivePlan(ctx.db);
      expect(plan!.days[0]!.customName).toBe('Push Day');
    });
  });

  it('makes the day a rest day', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Make Monday a rest day'));

    await waitFor(async () => {
      const plan = await getActivePlan(ctx.db);
      expect(plan!.days[0]!.isRestDay).toBe(true);
    });
  });

  it('shows a rest day as one, and offers to undo it', async () => {
    await editPlan(ctx.db, d => setRestDay(d, 0, true));
    const view = await renderScreen();
    expect(await view.findByText(/Rest day/i)).toBeTruthy();
    expect(view.getByText('Make Monday a workout day')).toBeTruthy();
  });

  it('lists exercises with their targets once the day has some', async () => {
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench', 'fly']),
    );
    const view = await renderScreen();
    expect(await view.findByText('Push Day')).toBeTruthy();
    expect(view.getByText('Bench Press')).toBeTruthy();
    expect(view.getAllByText('3 × 10').length).toBe(2);
    // Demoted to the quiet line once the day is decided.
    expect(view.getByText('Make Monday a rest day instead')).toBeTruthy();
  });

  it('shows a target weight when one is set', async () => {
    await editPlan(ctx.db, d => addExercises(d, 0, ['bench']));
    await editPlan(ctx.db, d => {
      const day = d.days[0]!;
      day.exercises[0]!.sets = [
        {targetReps: 10, targetWeight: 30},
        {targetReps: 10, targetWeight: 30},
        {targetReps: 10, targetWeight: 30},
      ];
      return d;
    });
    const view = await renderScreen();
    expect(await view.findByText('3 × 10 · 30.0 kg')).toBeTruthy();
  });

  it('removes an exercise', async () => {
    await editPlan(ctx.db, d => addExercises(d, 0, ['bench', 'fly']));
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Remove Bench Press'));

    await waitFor(async () => {
      const plan = await getActivePlan(ctx.db);
      expect(plan!.days[0]!.exercises.map(e => e.name)).toEqual(['Cable Fly']);
    });
  });

  it('opens the picker and the target editor', async () => {
    await editPlan(ctx.db, d => addExercises(d, 0, ['bench']));
    const view = await renderScreen();

    await fireEvent.press(await view.findByText('Add exercise'));
    expect(mockNavigate).toHaveBeenCalledWith('PlanExercisePicker', {weekday: 0});

    await fireEvent.press(view.getByText('Bench Press'));
    expect(mockNavigate).toHaveBeenCalledWith('PlanTargetEditor', {
      weekday: 0,
      exerciseIndex: 0,
    });
  });

  it('offers to copy the day once it has exercises', async () => {
    await editPlan(ctx.db, d => addExercises(d, 0, ['bench']));
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Copy this day'));
    expect(mockNavigate).toHaveBeenCalledWith('PlanCopyDay', {weekday: 0});
  });

  it('uses the weekday of the route it was opened with', async () => {
    mockParams.weekday = 3;
    const view = await renderScreen();
    expect(await view.findByText('Set up Thursday')).toBeTruthy();
  });
});

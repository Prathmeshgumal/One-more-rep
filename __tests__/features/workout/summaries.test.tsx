import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setTargets} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  getActiveSession,
  getSessionForDate,
} from '@/repositories/sessionRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {FinishSheet} from '@/features/workout/FinishSheet';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockPopToTop = jest.fn();
const mockParams = {exerciseIndex: 0};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    popToTop: mockPopToTop,
  }),
  useRoute: () => ({params: mockParams}),
}));

describe('finishing a workout', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const wrap = (ui: React.ReactElement) =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>{ui}</NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  const today = () => {
    const d = new Date();
    return (d.getDay() + 6) % 7;
  };

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
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, today(), 'Push Day'), today(), [
        'bench',
        'fly',
      ]),
    );
    // Real targets, so set 3 below is a genuine mixed case decided by volume
    // rather than a bodyweight comparison on reps alone.
    await editPlan(ctx.db, d =>
      setTargets(d, today(), 0, [
        {targetReps: 10, targetWeight: 30},
        {targetReps: 10, targetWeight: 30},
        {targetReps: 10, targetWeight: 30},
      ]),
    );
    await startWorkout(ctx.db);

    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockNavigate.mockClear();
    mockParams.exerciseIndex = 0;
    mockGoBack.mockClear();
    mockPopToTop.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  /** Records the three bench sets as 10x30, 12x30, 8x32.5 — the design's data. */
  const recordBench = async () => {
    const session = (await getActiveSession(ctx.db))!;
    const [a, b, c] = session.exercises[0]!.sets;
    await completeSet(ctx.db, a!.id, {actualReps: 10, actualWeight: 30});
    await completeSet(ctx.db, b!.id, {actualReps: 12, actualWeight: 30});
    await completeSet(ctx.db, c!.id, {actualReps: 8, actualWeight: 32.5});
  };

  const finish = async (
    props: Partial<React.ComponentProps<typeof FinishSheet>> = {},
  ) => {
    const session = (await getSessionForDate(ctx.db, Date.now()))!;
    return wrap(
      <FinishSheet
        visible
        session={session}
        unit="kg"
        onSave={jest.fn()}
        onClose={jest.fn()}
        {...props}
      />,
    );
  };

  /**
   * The screen this replaces was a whole pushed screen carrying a 56px
   * percentage, a completion bar, four verdict counts, volume, a warning and
   * a Save button — and then Today showed the same summary again the moment
   * you landed. The full report is not deleted, only moved to the finished
   * day, where you go to read it.
   */
  it('states what happened rather than asking a question you did not ask', async () => {
    const session = (await getActiveSession(ctx.db))!;
    for (const e of session.exercises) {
      for (const s of e.sets) {
        await completeSet(ctx.db, s.id, {actualReps: 10, actualWeight: 30});
      }
    }
    const view = await finish();
    expect(await view.findByText('That was the last set.')).toBeTruthy();
  });

  it('asks instead when the workout is being ended early', async () => {
    await recordBench();
    const view = await finish();
    expect(await view.findByText('Finish this workout?')).toBeTruthy();
  });

  it('counts what was recorded and totals the volume', async () => {
    await recordBench();
    const view = await finish();
    // Three of six recorded; 10x30 + 12x30 + 8x32.5 = 920.
    expect(await view.findByText(/3 of 6 recorded/)).toBeTruthy();
    expect(view.getByText(/920 kg lifted/)).toBeTruthy();
  });

  /**
   * §19: finishing with sets outstanding says so rather than silently
   * recording them as skipped — and names the exercises they are on, so the
   * warning can be acted on without dismissing it first.
   */
  it('warns about what has not been recorded, and where', async () => {
    await recordBench();
    const view = await finish();
    const warning = await view.findByText(/never recorded/);
    expect(warning).toBeTruthy();
    expect(view.getByText(/3 sets on Cable Fly/)).toBeTruthy();
    expect(view.getByText(/marks them skipped/)).toBeTruthy();
  });

  it('says nothing about unrecorded sets when there are none', async () => {
    const session = (await getActiveSession(ctx.db))!;
    for (const e of session.exercises) {
      for (const s of e.sets) {
        await completeSet(ctx.db, s.id, {actualReps: 10, actualWeight: 30});
      }
    }
    const view = await finish();
    await view.findByText('That was the last set.');
    expect(view.queryByText(/never recorded/)).toBeNull();
  });

  it('speaks in the singular for one outstanding set', async () => {
    const session = (await getActiveSession(ctx.db))!;
    const all = session.exercises.flatMap(e => e.sets);
    for (const s of all.slice(0, all.length - 1)) {
      await completeSet(ctx.db, s.id, {actualReps: 10, actualWeight: 30});
    }
    const view = await finish();
    expect(await view.findByText(/1 set on Cable Fly was never/)).toBeTruthy();
    expect(view.getByText(/marks it skipped/)).toBeTruthy();
  });

  it('saves when asked', async () => {
    await recordBench();
    const onSave = jest.fn();
    const view = await finish({onSave});
    await fireEvent.press(await view.findByText('Save workout'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  // Not "Cancel" — you are not cancelling anything, you are going back to a
  // workout that is still running.
  it('offers a way back into the workout', async () => {
    const onClose = jest.fn();
    const view = await finish({onClose});
    await fireEvent.press(await view.findByText('Go back in'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('will not save twice while the first is in flight', async () => {
    const onSave = jest.fn();
    const view = await finish({busy: true, onSave});
    await fireEvent.press(await view.findByText('Save workout'));
    expect(onSave).not.toHaveBeenCalled();
  });

  // A bodyweight-only session has no volume to report, and printing "0 kg
  // lifted" would read as a failure rather than as an inapplicable number.
  it('omits volume when nothing carried weight', async () => {
    await ctx.db.run(sql`UPDATE exercises SET weight_applicable = 0`);
    const session = (await getActiveSession(ctx.db))!;
    await completeSet(ctx.db, session.exercises[0]!.sets[0]!.id, {
      actualReps: 10,
      actualWeight: null,
    });
    const view = await finish();
    await view.findByText(/1 of 6 recorded/);
    expect(view.queryByText(/kg lifted/)).toBeNull();
  });

  it('reports how long the session took', async () => {
    const session = (await getSessionForDate(ctx.db, Date.now()))!;
    const view = await finish({now: session.startedAt + 42 * 60000});
    expect(await view.findByText(/42 min/)).toBeTruthy();
  });

  it('reads an hour and over in hours', async () => {
    const session = (await getSessionForDate(ctx.db, Date.now()))!;
    const view = await finish({now: session.startedAt + 75 * 60000});
    expect(await view.findByText(/1 h 15 min/)).toBeTruthy();
  });
});

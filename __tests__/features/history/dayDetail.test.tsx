import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {
  addExercises,
  renameDay,
  setRestDay,
  setTargets,
} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  skipSet,
  addExercise,
  finishWorkout,
  getSessionForDate,
  setExerciseNotes,
  swapExercise,
} from '@/repositories/sessionRepo';
import {addLocalDays, startOfLocalDay, weekdayIndex} from '@/domain/weekday';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {DayDetailScreen} from '@/features/history/DayDetailScreen';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
const mockParams: {date: number} = {date: 0};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()}),
  useRoute: () => ({params: mockParams}),
}));

const TODAY = startOfLocalDay(Date.now());
const daysAgo = (n: number) => addLocalDays(TODAY, -n);
const weekdayOf = (ms: number) => weekdayIndex(new Date(ms));

const TRAINED = daysAgo(7);
const RESTED = daysAgo(6);

describe('DayDetailScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <DayDetailScreen />
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
          VALUES ('press','Machine Chest Press','chest','[]','machine','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0)`,
    );
    await createPlan(ctx.db, {now: daysAgo(30)});
    await editPlan(
      ctx.db,
      d =>
        setTargets(
          setRestDay(
            addExercises(
              renameDay(d, weekdayOf(TRAINED), 'Push Day'),
              weekdayOf(TRAINED),
              ['press'],
            ),
            weekdayOf(RESTED),
            true,
          ),
          weekdayOf(TRAINED),
          0,
          [
            {targetReps: 10, targetWeight: 30},
            {targetReps: 10, targetWeight: 30},
            {targetReps: 10, targetWeight: 30},
          ],
        ),
      daysAgo(30),
    );

    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockNavigate.mockClear();
    mockParams.date = TRAINED;
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  /** Two sets done, one skipped, plus an exercise added on the day. */
  const trainWithAGap = async () => {
    const session = await startWorkout(ctx.db, {now: TRAINED + 9 * 3600_000});
    const sets = session.exercises[0]!.sets;
    await completeSet(ctx.db, sets[0]!.id, {actualReps: 10, actualWeight: 30});
    await completeSet(ctx.db, sets[1]!.id, {actualReps: 12, actualWeight: 30});
    await skipSet(ctx.db, sets[2]!.id);
    await addExercise(ctx.db, session.id, 'fly');
    const reloaded = await getSessionForDate(ctx.db, TRAINED);
    const bonusExercise = reloaded!.exercises.find(
      e => e.plannedExerciseId === null,
    )!;
    await completeSet(ctx.db, bonusExercise.sets[0]!.id, {
      actualReps: 12,
      actualWeight: 10,
    });
    await finishWorkout(ctx.db, session.id);
  };

  it('names the day and dates it', async () => {
    await trainWithAGap();
    const view = await renderScreen();
    expect(await view.findByText('Push Day')).toBeTruthy();
  });

  it('reports the session duration and its total volume', async () => {
    await trainWithAGap();
    const view = await renderScreen();
    await view.findByText('Push Day');
    // 10x30 + 12x30 + the 12x10 added on the day.
    expect(view.getByText(/780 kg total volume/)).toBeTruthy();
  });

  it('lays every exercise out as a ledger of target against actual', async () => {
    await trainWithAGap();
    const view = await renderScreen();
    await view.findByText('Push Day');
    expect(view.getByText('Machine Chest Press')).toBeTruthy();
    expect(view.getAllByText('10 × 30.0').length).toBeGreaterThan(0);
    expect(view.getByText('12 × 30.0')).toBeTruthy();
    expect(view.getByText('+2 reps')).toBeTruthy();
  });

  it('writes an em dash where a set was skipped', async () => {
    await trainWithAGap();
    const view = await renderScreen();
    await view.findByText('Push Day');
    expect(view.getAllByText('—').length).toBeGreaterThan(0);
    expect(view.getByText('Skipped')).toBeTruthy();
  });

  it('marks an exercise that was added on the day', async () => {
    await trainWithAGap();
    const view = await renderScreen();
    await view.findByText('Push Day');
    expect(view.getByText(/added on the day/i)).toBeTruthy();
  });

  it('opens the exercise history when its name is tapped', async () => {
    await trainWithAGap();
    const view = await renderScreen();
    await view.findByText('Push Day');
    await fireEvent.press(view.getByText('Machine Chest Press'));
    expect(mockNavigate).toHaveBeenCalledWith('ExerciseHistory', {
      exerciseId: 'press',
    });
  });

  // Success criterion 9, at the screen that would show a regression first.
  it('keeps the printed targets a later plan edit cannot reach', async () => {
    await trainWithAGap();
    // Raise every target well above what was actually done, the day after.
    await editPlan(
      ctx.db,
      d =>
        setTargets(d, weekdayOf(TRAINED), 0, [
          {targetReps: 20, targetWeight: 60},
          {targetReps: 20, targetWeight: 60},
          {targetReps: 20, targetWeight: 60},
        ]),
      daysAgo(6),
    );

    const view = await renderScreen();
    await view.findByText('Push Day');
    expect(view.queryByText('20 × 60.0')).toBeNull();
    expect(view.getAllByText('10 × 30.0').length).toBeGreaterThan(0);
  });

  it('says so plainly on a rest day, rather than showing an empty ledger', async () => {
    mockParams.date = RESTED;
    const view = await renderScreen();
    expect(await view.findByText(/nothing was scheduled/i)).toBeTruthy();
    // The heading names it too, rather than showing the bare weekday.
    expect(view.getByText('Rest day')).toBeTruthy();
  });

  it('says nothing was recorded on a day that was missed', async () => {
    mockParams.date = daysAgo(14);
    const view = await renderScreen();
    expect(await view.findByText(/nothing was recorded/i)).toBeTruthy();
  });

  // U6 and the notes column. Without these two lines history quietly reports
  // the planned movement as the one performed, and loses what was said about
  // the day entirely.
  it('prints the note under the exercise it belongs to', async () => {
    const session = await startWorkout(ctx.db, {now: TRAINED + 9 * 3600_000});
    await setExerciseNotes(
      ctx.db,
      session.exercises[0]!.id,
      'Shoulder felt off.',
    );
    await finishWorkout(ctx.db, session.id, {now: TRAINED + 10 * 3600_000});

    const view = await renderScreen();
    expect(await view.findByText('Shoulder felt off.')).toBeTruthy();
  });

  it('says where a swapped exercise came from', async () => {
    const session = await startWorkout(ctx.db, {now: TRAINED + 9 * 3600_000});
    await swapExercise(ctx.db, session.exercises[0]!.id, 'fly');
    await finishWorkout(ctx.db, session.id, {now: TRAINED + 10 * 3600_000});

    const view = await renderScreen();
    expect(await view.findByText(/swapped from Machine Chest Press/)).toBeTruthy();
    expect(view.getByText('Cable Fly')).toBeTruthy();
  });

  it('draws no note at all when none was written', async () => {
    await trainWithAGap();
    const view = await renderScreen();
    await view.findByText('Machine Chest Press');
    expect(view.queryByTestId('exercise-note')).toBeNull();
  });

  // Complaint 8. The card is mounted only while a save is running, so the day
  // view does not carry a second copy of itself around.
  it('does not lay out the image until a save is asked for', async () => {
    await trainWithAGap();
    const view = await renderScreen();
    await view.findByText('Machine Chest Press');
    // One of each -- the screen's own, and no shadow copy behind it.
    expect(view.getAllByText('Machine Chest Press')).toHaveLength(1);
    expect(view.queryByText('ONE MORE REP')).toBeNull();
  });

  it('captures the card and files it in the gallery', async () => {
    (CameraRoll.save as jest.Mock).mockClear();
    await trainWithAGap();
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Save image'));

    // The card mounts, and its layout is what triggers the capture.
    await waitFor(() => expect(view.getByTestId('day-image')).toBeTruthy());
    await fireEvent(view.getByTestId('day-image'), 'layout', {
      nativeEvent: {layout: {width: 1080, height: 800}},
    });

    await waitFor(() =>
      expect(CameraRoll.save).toHaveBeenCalledWith('/tmp/shot.png', {
        type: 'photo',
        album: 'One More Rep',
      }),
    );
  });
});

import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan, getActivePlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setRestDay} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  getActiveSession,
  getSessionForDate,
  finishWorkout,
} from '@/repositories/sessionRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {WorkoutHomeScreen} from '@/features/workout/WorkoutHomeScreen';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
const mockParentNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    getParent: () => ({navigate: mockParentNavigate}),
  }),
  useFocusEffect: (cb: () => void) => {
    const React_ = require('react');
    React_.useEffect(cb, []);
  },
}));

describe('WorkoutHomeScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <WorkoutHomeScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  /** Today's weekday, so the fixture always lands on the day under test. */
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
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockNavigate.mockClear();
    mockParentNavigate.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  const planToday = async () => {
    await createPlan(ctx.db);
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, today(), 'Push Day'), today(), [
        'bench',
        'fly',
      ]),
    );
  };

  describe('before there is a plan', () => {
    it('says so', async () => {
      const view = await renderScreen();
      expect(await view.findByText(/No plan yet/i)).toBeTruthy();
    });

    // A button that opens a screen whose only content is another button is a
    // step for its own sake.
    it('hides the plan button, and offers the plan itself', async () => {
      const view = await renderScreen();
      await view.findByText(/No plan yet/i);

      expect(view.queryByLabelText('Weekly plan')).toBeNull();
      expect(view.getByText('Create plan')).toBeTruthy();
      // History still opens, because looking back is always allowed.
      expect(view.getByLabelText('History')).toBeTruthy();
    });

    it('creates the week and opens it in one tap', async () => {
      const view = await renderScreen();
      await fireEvent.press(await view.findByText('Create plan'));

      await waitFor(async () => {
        expect(await getActivePlan(ctx.db)).toBeTruthy();
      });
      expect(mockNavigate).toHaveBeenCalledWith('PlanWeek');
    });

    it('brings the plan button back once there is a plan', async () => {
      await planToday();
      const view = await renderScreen();
      await view.findByText('Push Day');
      expect(view.getByLabelText('Weekly plan')).toBeTruthy();
      expect(view.queryByText('Create plan')).toBeNull();
    });
  });

  it('says so when today has nothing set up', async () => {
    await createPlan(ctx.db);
    const view = await renderScreen();
    expect(await view.findByText(/not set up/i)).toBeTruthy();
  });

  // §33 and design 07: the one screen with no card stack and no primary
  // button. Recovery is a plan, not an absence of one.
  it('shows a rest day as a rest day', async () => {
    await createPlan(ctx.db);
    await editPlan(ctx.db, d => setRestDay(d, today(), true));

    const view = await renderScreen();
    expect(await view.findByText('Rest day')).toBeTruthy();
    expect(view.queryByText('Start workout')).toBeNull();
  });

  it("lists today's exercises and their targets", async () => {
    await planToday();
    const view = await renderScreen();
    expect(await view.findByText('Push Day')).toBeTruthy();
    expect(view.getByText('Bench Press')).toBeTruthy();
    expect(view.getByText('2 exercises · 6 sets')).toBeTruthy();
    expect(view.getAllByText(/3 × 10/).length).toBe(2);
  });

  it('starts a workout and opens it', async () => {
    await planToday();
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Start workout'));

    await waitFor(async () => {
      expect(await getActiveSession(ctx.db)).toBeDefined();
    });
    expect(mockNavigate).toHaveBeenCalledWith('Session');
  });

  // §20 and design 08: after a process kill, the screen offers to continue
  // rather than starting over and losing what was recorded.
  it('offers to continue a session already in progress', async () => {
    await planToday();
    const session = await startWorkout(ctx.db);
    await completeSet(ctx.db, session.exercises[0]!.sets[0]!.id, {
      actualReps: 10,
      actualWeight: 30,
    });

    const view = await renderScreen();
    expect(await view.findByText('Continue workout')).toBeTruthy();
    // The count and its label are separate nodes, as the design sets them:
    // a big plate-coloured number over a printed caption.
    expect(view.getByText('1')).toBeTruthy();
    expect(view.getByText('of 6 sets recorded')).toBeTruthy();
    expect(view.queryByText('Start workout')).toBeNull();
  });

  it('can close an in-progress workout from here', async () => {
    await planToday();
    await startWorkout(ctx.db);

    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Finish here'));

    await waitFor(async () => {
      expect(await getActiveSession(ctx.db)).toBeUndefined();
    });
  });

  it('shows the day as done once the workout is finished', async () => {
    await planToday();
    const session = await startWorkout(ctx.db);
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    await finishWorkout(ctx.db, session.id);

    const view = await renderScreen();
    expect(await view.findByText(/Push Day done/i)).toBeTruthy();
    expect(view.queryByText('Start workout')).toBeNull();
  });

  // Complaint 10: the summary was one tap away on a screen with nothing else
  // on it, which is a layer for its own sake.
  describe('once the day is done', () => {
    const finishedDay = async () => {
      await planToday();
      const session = await startWorkout(ctx.db);
      const sets = session.exercises[0]!.sets;
      await completeSet(ctx.db, sets[0]!.id, {
        actualReps: 10,
        actualWeight: 30,
      });
      await completeSet(ctx.db, sets[1]!.id, {
        actualReps: 12,
        actualWeight: 30,
      });
      await finishWorkout(ctx.db, session.id);
    };

    it('counts the exercises and the sets, without a button being pressed', async () => {
      await finishedDay();
      const view = await renderScreen();
      await view.findByText(/Push Day done/i);

      expect(view.getByText('Exercises')).toBeTruthy();
      expect(view.getByText('Sets')).toBeTruthy();
      // Two exercises of three sets each; two sets recorded on the first, so
      // that exercise reads done and the untouched one does not.
      expect(view.getByText('1 / 2')).toBeTruthy();
      expect(view.getByText('2 / 6')).toBeTruthy();
      expect(view.queryByText('See the summary')).toBeNull();
    });

    // The percentage, the verdict chips and the volume are a report, and a
    // report belongs where you go to read it rather than on the way past.
    it('leaves the full report to the finish screen', async () => {
      await finishedDay();
      const view = await renderScreen();
      await view.findByText(/Push Day done/i);

      expect(view.queryByText('% of plan')).toBeNull();
      expect(view.queryByText('Against target')).toBeNull();
      expect(view.queryByText('total volume')).toBeNull();
      expect(view.queryByText('Achieved')).toBeNull();
    });

    // The header used to say "N of M sets recorded" while counting bonus sets,
    // where the card does not. Two answers to one question, three lines apart.
    it('gives one answer for how many sets were recorded', async () => {
      await finishedDay();
      const view = await renderScreen();
      await view.findByText(/Push Day done/i);

      expect(view.queryByText(/sets recorded/)).toBeNull();
    });

    it('lists every exercise with its sets', async () => {
      await finishedDay();
      const view = await renderScreen();
      await view.findByText(/Push Day done/i);

      expect(view.getByText('Bench Press')).toBeTruthy();
      // The recorded pair, set by set, not just a count. The same ledger row
      // the workout screen and the calendar draw, so the app says one thing.
      expect(view.getByText('10 · 30 kg')).toBeTruthy();
      expect(view.getByText('12 · 30 kg')).toBeTruthy();
    });

    /**
     * A number typed wrong on Tuesday used to be wrong forever. Nothing in the
     * data model was stopping this -- completeSet has always overwritten
     * regardless of the session status -- only the screens declined to offer
     * it.
     */
    it('corrects a set on a day that is already saved', async () => {
      await finishedDay();
      const view = await renderScreen();
      await view.findByText(/Push Day done/i);

      await fireEvent.press(view.getByLabelText('Set 1, 10 · 30 kg'));
      expect(await view.findByText(/Bench Press · set 1/)).toBeTruthy();
      expect(view.getByText(/recorded as 10/)).toBeTruthy();

      await fireEvent.press(view.getByLabelText('Increase Reps'));
      await fireEvent.press(view.getByText('Save change'));

      await waitFor(async () => {
        const after = await getSessionForDate(ctx.db, Date.now());
        expect(after!.exercises[0]!.sets[0]!.actualReps).toBe(11);
      });
    });

    // The session stays completed throughout -- no reopening, so adherence,
    // the calendar and the day resolver are untouched by a correction.
    it('leaves the day finished while correcting it', async () => {
      await finishedDay();
      const view = await renderScreen();
      await view.findByText(/Push Day done/i);

      await fireEvent.press(view.getByLabelText('Set 1, 10 · 30 kg'));
      await fireEvent.press(await view.findByText('Save change'));

      await waitFor(async () => {
        const after = await getSessionForDate(ctx.db, Date.now());
        expect(after!.status).toBe('completed');
      });
    });

    // A set recorded that should not have been. Marking it skipped is the
    // honest correction -- deleting it would shrink the denominator.
    it('can mark a recorded set as skipped instead', async () => {
      await finishedDay();
      const view = await renderScreen();
      await view.findByText(/Push Day done/i);

      await fireEvent.press(view.getByLabelText('Set 1, 10 · 30 kg'));
      await fireEvent.press(await view.findByText('Mark as skipped'));

      await waitFor(async () => {
        const after = await getSessionForDate(ctx.db, Date.now());
        const set = after!.exercises[0]!.sets[0]!;
        expect(set.status).toBe('skipped');
        expect(set.actualReps).toBeNull();
      });
    });

    it('offers the workout screen for the bigger jobs', async () => {
      await finishedDay();
      const view = await renderScreen();
      await view.findByText(/Push Day done/i);
      await fireEvent.press(view.getByText('Edit workout'));
      expect(mockNavigate).toHaveBeenCalledWith('Session');
    });

    it('opens the full day, which is in this stack now', async () => {
      await finishedDay();
      const view = await renderScreen();
      await fireEvent.press(await view.findByText('All exercises'));

      expect(mockNavigate).toHaveBeenCalledWith('DayDetail', {
        date: expect.any(Number),
      });
    });
  });
});

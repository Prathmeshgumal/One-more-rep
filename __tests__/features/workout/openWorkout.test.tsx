import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setRestDay} from '@/domain/planDraft';
import {
  startOpenWorkout,
  getSessionForDate,
} from '@/repositories/sessionRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {NameWorkoutScreen} from '@/features/workout/NameWorkoutScreen';
import {WorkoutHomeScreen} from '@/features/workout/WorkoutHomeScreen';
import {SessionScreen} from '@/features/workout/SessionScreen';
import {WORKOUT_NAME_MAX_LENGTH} from '@/constants';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    replace: mockReplace,
    goBack: mockGoBack,
    popToTop: jest.fn(),
    addListener: () => () => {},
  }),
  useRoute: () => ({params: undefined}),
}));

/** Today as the app counts weekdays: 0 = Monday. */
const todayIndex = () => (new Date().getDay() + 6) % 7;

describe('a workout with no plan', () => {
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

  beforeEach(async () => {
    jest.clearAllMocks();
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    client = new QueryClient({
      defaultOptions: {queries: {retry: false}, mutations: {retry: false}},
    });
  });
  afterEach(() => ctx.close());

  describe('naming it', () => {
    it('will not start until the workout has a name', async () => {
      const {getByText} = await wrap(<NameWorkoutScreen />);

      await fireEvent.press(getByText('Start recording'));

      await waitFor(() => expect(mockReplace).not.toHaveBeenCalled());
      expect(await getSessionForDate(ctx.db, Date.now())).toBeUndefined();
    });

    it('refuses a name that is only whitespace', async () => {
      const {getByText, getByPlaceholderText} = await wrap(<NameWorkoutScreen />);

      await fireEvent.changeText(getByPlaceholderText('Arms & shoulders'), '    ');
      await fireEvent.press(getByText('Start recording'));

      await waitFor(() => expect(mockReplace).not.toHaveBeenCalled());
      expect(await getSessionForDate(ctx.db, Date.now())).toBeUndefined();
    });

    it('creates the session and goes straight into it', async () => {
      const {getByText, getByPlaceholderText} = await wrap(<NameWorkoutScreen />);

      await fireEvent.changeText(
        getByPlaceholderText('Arms & shoulders'),
        'Arms & shoulders',
      );
      await fireEvent.press(getByText('Start recording'));

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('Session'));
      const session = await getSessionForDate(ctx.db, Date.now());
      expect(session?.dayName).toBe('Arms & shoulders');
      expect(session?.exercises).toEqual([]);
    });

    /**
     * Replace rather than navigate: leaving the name screen on the stack puts
     * "what shall we call it" behind the back gesture of a workout already
     * being recorded.
     */
    it('does not leave the naming screen behind it', async () => {
      const {getByText, getByPlaceholderText} = await wrap(<NameWorkoutScreen />);

      await fireEvent.changeText(getByPlaceholderText('Arms & shoulders'), 'Legs');
      await fireEvent.press(getByText('Start recording'));

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      expect(mockNavigate).not.toHaveBeenCalledWith('Session');
    });

    it('fills the field from a suggestion', async () => {
      const {getByText} = await wrap(<NameWorkoutScreen />);

      await fireEvent.press(getByText('Legs'));
      await fireEvent.press(getByText('Start recording'));

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
      const session = await getSessionForDate(ctx.db, Date.now());
      expect(session?.dayName).toBe('Legs');
    });

    it('stops the input at the limit rather than letting the write fail', async () => {
      const {getByPlaceholderText} = await wrap(<NameWorkoutScreen />);
      expect(
        getByPlaceholderText('Arms & shoulders').props.maxLength,
      ).toBe(WORKOUT_NAME_MAX_LENGTH);
    });
  });

  describe('the way in', () => {
    it('is offered when there is no plan at all', async () => {
      const {findByText} = await wrap(<WorkoutHomeScreen />);

      await fireEvent.press(await findByText('Start without a plan'));
      expect(mockNavigate).toHaveBeenCalledWith('NameWorkout');
    });

    it('is offered on a day the plan calls a rest day', async () => {
      await createPlan(ctx.db, {now: Date.now()});
      await editPlan(ctx.db, d => setRestDay(d, todayIndex(), true));

      const {findByText} = await wrap(<WorkoutHomeScreen />);

      await fireEvent.press(await findByText('Start without a plan'));
      expect(mockNavigate).toHaveBeenCalledWith('NameWorkout');
    });

    it('is offered, quietly, on a day that has a workout planned', async () => {
      await createPlan(ctx.db, {now: Date.now()});
      await editPlan(ctx.db, d =>
        addExercises(renameDay(d, todayIndex(), 'Push Day'), todayIndex(), [
          'bench',
        ]),
      );

      const {findByText} = await wrap(<WorkoutHomeScreen />);

      // The plan is still the thing to do; both ways in are on screen.
      expect(await findByText('Start workout')).toBeTruthy();
      await fireEvent.press(await findByText('Start without a plan'));
      expect(mockNavigate).toHaveBeenCalledWith('NameWorkout');
    });

    /**
     * One session per date. On a day that already has one the offer is to add
     * to it, which the finished state makes itself — a second entry point here
     * would lead to a write the repository refuses.
     */
    it('is not offered once today already has a session', async () => {
      await startOpenWorkout(ctx.db, {name: 'Morning'});

      const {queryByText, findByText} = await wrap(<WorkoutHomeScreen />);

      await findByText('Morning');
      expect(queryByText('Start without a plan')).toBeNull();
    });
  });

  describe('the empty session', () => {
    it('offers the first exercise instead of a blank screen', async () => {
      await startOpenWorkout(ctx.db, {name: 'Arms'});

      const {findByText} = await wrap(<SessionScreen />);

      expect(await findByText('Nothing recorded yet')).toBeTruthy();
      await fireEvent.press(await findByText('Add exercise'));
      expect(mockNavigate).toHaveBeenCalledWith('WorkoutExercisePicker', {
        mode: 'add',
      });
    });

    it('names the workout it is about to fill', async () => {
      await startOpenWorkout(ctx.db, {name: 'Arms & shoulders'});

      const {findByText} = await wrap(<SessionScreen />);
      expect(await findByText('Arms & shoulders')).toBeTruthy();
    });
  });
});

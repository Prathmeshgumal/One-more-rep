import React from 'react';
import {Text, Pressable} from 'react-native';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises} from '@/domain/planDraft';
import {weekdayIndex} from '@/domain/weekday';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {useEditPlan} from '@/features/plan/usePlan';
import {useTodayPlanQuery} from '@/features/workout/useSession';
import {createTestDb} from '../../helpers/testDb';

/**
 * Found on the device during the R1 gate, and it is half of complaint 4.
 *
 * The Today tab reads the plan through `useTodayPlanQuery`, which lives under
 * the `session` key with `staleTime: Infinity`. The plan mutations invalidated
 * `plan` and `history` but never `session`, so adding an exercise to today's
 * plan left Today still saying "No plan yet" until the app was restarted.
 *
 * This is deliberately an integration test over the real hooks: the defect was
 * in which key an invalidation named, and only a test that actually runs the
 * mutation against a live cache can see that.
 */
describe('the Today tab follows plan edits', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const today = () => weekdayIndex(new Date());

  function Probe() {
    const {data: plan} = useTodayPlanQuery();
    const edit = useEditPlan();
    return (
      <>
        <Text>
          {`exercises:${plan?.days[today()]?.exercises.length ?? 'none'}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="add"
          onPress={() =>
            edit.mutate(draft => addExercises(draft, today(), ['squat']))
          }>
          <Text>add</Text>
        </Pressable>
      </>
    );
  }

  const renderProbe = () =>
    render(
      <QueryClientProvider client={client}>
        <DatabaseContextTestProvider db={ctx.db}>
          <Probe />
        </DatabaseContextTestProvider>
      </QueryClientProvider>,
    );

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('squat','Back Squat','quadriceps','[]','barbell','strength',1,0,0)`,
    );
    await createPlan(ctx.db);
    await editPlan(ctx.db, draft => addExercises(draft, today(), ['bench']));
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('shows a newly added exercise without a restart', async () => {
    const view = await renderProbe();
    await waitFor(() => expect(view.getByText('exercises:1')).toBeTruthy());

    await fireEvent.press(view.getByLabelText('add'));

    await waitFor(() => expect(view.getByText('exercises:2')).toBeTruthy());
  });
});

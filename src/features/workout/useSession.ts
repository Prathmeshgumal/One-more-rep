import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useDatabase} from '@/providers/DatabaseGate';
import {
  getSessionForDate,
  startWorkout,
  finishWorkout,
  completeSet,
  skipSet,
  skipExercise,
  addSet,
  addExercise,
  getPreviousPerformance,
} from '@/repositories/sessionRepo';
import {getPlanForDate} from '@/repositories/planRepo';
import {startOfLocalDay} from '@/domain/weekday';

export const sessionKeys = {
  all: ['session'] as const,
  today: () => ['session', 'today'] as const,
  todayPlan: () => ['session', 'todayPlan'] as const,
  previous: (exerciseId: string) =>
    ['session', 'previous', exerciseId] as const,
};

/** Today's session, or null when nothing has been started. */
export function useTodaySessionQuery() {
  const db = useDatabase();
  return useQuery({
    queryKey: sessionKeys.today(),
    // Null rather than undefined: TanStack Query treats an undefined result as
    // a failed query, which would make "no workout yet" and "the database
    // threw" render identically.
    queryFn: async () =>
      (await getSessionForDate(db, Date.now())) ?? null,
    staleTime: Infinity,
  });
}

/** The plan as it stands for today, for the pre-workout listing. */
export function useTodayPlanQuery() {
  const db = useDatabase();
  return useQuery({
    queryKey: sessionKeys.todayPlan(),
    queryFn: async () => (await getPlanForDate(db, Date.now())) ?? null,
    staleTime: Infinity,
  });
}

export function usePreviousPerformanceQuery(exerciseId: string) {
  const db = useDatabase();
  return useQuery({
    queryKey: sessionKeys.previous(exerciseId),
    queryFn: async () =>
      (await getPreviousPerformance(db, exerciseId, {
        before: startOfLocalDay(Date.now()),
      })) ?? null,
    enabled: exerciseId !== '',
    staleTime: Infinity,
  });
}

/**
 * Every workout write invalidates the session branch.
 *
 * They are deliberately separate mutations rather than one generic one: each
 * is its own committed transaction (spec 6.4), and naming them separately is
 * what keeps that visible at the call site.
 */
function useSessionMutation<TArgs>(
  run: (db: ReturnType<typeof useDatabase>, args: TArgs) => Promise<unknown>,
) {
  const db = useDatabase();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: TArgs) => run(db, args),
    onSuccess: () => client.invalidateQueries({queryKey: sessionKeys.all}),
  });
}

export const useStartWorkout = () =>
  useSessionMutation<void>(db => startWorkout(db));

export const useFinishWorkout = () =>
  useSessionMutation<string>((db, sessionId) => finishWorkout(db, sessionId));

export const useCompleteSet = () =>
  useSessionMutation<{
    setId: string;
    actualReps: number;
    actualWeight: number | null;
  }>((db, {setId, actualReps, actualWeight}) =>
    completeSet(db, setId, {actualReps, actualWeight}),
  );

export const useSkipSet = () =>
  useSessionMutation<string>((db, setId) => skipSet(db, setId));

export const useSkipExercise = () =>
  useSessionMutation<string>((db, id) => skipExercise(db, id));

export const useAddSet = () =>
  useSessionMutation<string>((db, id) => addSet(db, id));

export const useAddExercise = () =>
  useSessionMutation<{sessionId: string; exerciseId: string}>(
    (db, {sessionId, exerciseId}) => addExercise(db, sessionId, exerciseId),
  );

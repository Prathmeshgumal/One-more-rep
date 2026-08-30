import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useDatabase} from '@/providers/DatabaseGate';
import {historyKeys} from '@/features/history/useHistory';
import {sessionKeys} from '@/features/workout/useSession';
import {
  getActivePlan,
  createPlan,
  editPlan,
  listPlanVersions,
} from '@/repositories/planRepo';
import type {PlanDraft} from '@/domain/planDraft';

export const planKeys = {
  all: ['plan'] as const,
  active: () => ['plan', 'active'] as const,
  versions: () => ['plan', 'versions'] as const,
};

export function usePlanQuery() {
  const db = useDatabase();
  return useQuery({
    queryKey: planKeys.active(),
    // Mapped to null because TanStack Query treats an undefined result as a
    // failed query. Left alone, "no plan yet" and "the database threw" would
    // both surface as `data: undefined` and the screen would offer to create a
    // plan on top of a broken database.
    queryFn: async () => (await getActivePlan(db)) ?? null,
    // The plan changes only when this app changes it, and every mutation below
    // invalidates the branch (D8), so a cached plan cannot go stale unnoticed.
    staleTime: Infinity,
  });
}

export function usePlanVersionsQuery() {
  const db = useDatabase();
  return useQuery({
    queryKey: planKeys.versions(),
    queryFn: () => listPlanVersions(db),
    staleTime: Infinity,
  });
}

export function useCreatePlan() {
  const db = useDatabase();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => createPlan(db),
    // Awaited for the same reason as the workout mutations: callers run their
    // own onSuccess only once the promise returned from here settles.
    onSuccess: async () => {
      await client.invalidateQueries({queryKey: planKeys.all});
      // A plan edit changes which future days count as rest or training.
      await client.invalidateQueries({queryKey: historyKeys.all});
      // The Workout tab reads the plan through the session branch, not this one,
      // and it caches forever. Without this it kept saying "No plan yet" after
      // a plan was created, until the app was restarted.
      await client.invalidateQueries({queryKey: sessionKeys.all});
    },
  });
}

/**
 * Every plan edit goes through here, so every edit invalidates both the active
 * plan and the version list — an edit that forks must make the new version
 * visible in plan history immediately, or the versioning looks broken.
 */
export function useEditPlan() {
  const db = useDatabase();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (mutate: (draft: PlanDraft) => PlanDraft) =>
      editPlan(db, mutate),
    // Awaited for the same reason as the workout mutations: callers run their
    // own onSuccess only once the promise returned from here settles.
    onSuccess: async () => {
      await client.invalidateQueries({queryKey: planKeys.all});
      // A plan edit changes which future days count as rest or training.
      await client.invalidateQueries({queryKey: historyKeys.all});
      // The Workout tab previews the plan through the session branch (see
      // above). An exercise added to today's plan has to appear there without
      // a restart — this is half of complaint 4, found on the device at R1.
      await client.invalidateQueries({queryKey: sessionKeys.all});
    },
  });
}

import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useDatabase} from '@/providers/DatabaseGate';
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
    onSuccess: () => client.invalidateQueries({queryKey: planKeys.all}),
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
    onSuccess: () => client.invalidateQueries({queryKey: planKeys.all}),
  });
}

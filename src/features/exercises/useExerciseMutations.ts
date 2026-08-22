import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useDatabase} from '@/providers/DatabaseGate';
import {
  createCustomExercise,
  updateCustomExercise,
  softDeleteExercise,
  type NewCustomExercise,
  type CustomExercisePatch,
} from '@/repositories/exerciseRepo';
import {exerciseKeys} from './useExercises';

/**
 * Every write invalidates the whole `exercises` key (D8). A list is keyed by
 * its search and filter, so there is no way to know which cached lists a new
 * or renamed exercise belongs in — invalidating the branch is both correct and
 * cheap against a local database.
 */
export function useCreateExercise() {
  const db = useDatabase();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NewCustomExercise) => createCustomExercise(db, input),
    onSuccess: () => client.invalidateQueries({queryKey: exerciseKeys.all}),
  });
}

export function useUpdateExercise() {
  const db = useDatabase();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({id, patch}: {id: string; patch: CustomExercisePatch}) =>
      updateCustomExercise(db, id, patch),
    onSuccess: () => client.invalidateQueries({queryKey: exerciseKeys.all}),
  });
}

export function useDeleteExercise() {
  const db = useDatabase();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeleteExercise(db, id),
    onSuccess: () => client.invalidateQueries({queryKey: exerciseKeys.all}),
  });
}

import {useQuery} from '@tanstack/react-query';
import {useDatabase} from '@/providers/DatabaseGate';
import {
  listExercises,
  getExercise,
  type ExerciseQuery,
} from '@/repositories/exerciseRepo';

/**
 * Query keys for the library. Writes invalidate `all`, which covers every list
 * and every detail at once (D8) — cheap here, and impossible to get subtly
 * wrong the way per-key invalidation is.
 */
export const exerciseKeys = {
  all: ['exercises'] as const,
  list: (query: ExerciseQuery) => ['exercises', 'list', query] as const,
  detail: (id: string) => ['exercises', 'detail', id] as const,
};

export function useExerciseListQuery(query: ExerciseQuery) {
  const db = useDatabase();
  return useQuery({
    queryKey: exerciseKeys.list(query),
    queryFn: () => listExercises(db, query),
  });
}

export function useExerciseQuery(id: string) {
  const db = useDatabase();
  return useQuery({
    queryKey: exerciseKeys.detail(id),
    queryFn: () => getExercise(db, id),
  });
}

import {keepPreviousData, useQuery} from '@tanstack/react-query';
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
    // Every keystroke is a new key. Without this the list empties to "Loading"
    // between each one, which reads as the library flickering out of existence
    // while you type. Holding the previous results until the next arrive is
    // both calmer and honest — they were true a keystroke ago.
    placeholderData: keepPreviousData,
    // The library only changes when this app changes it, and every mutation
    // invalidates `exerciseKeys.all` (D8) — so a cached list cannot go stale
    // behind our back. Without this, clearing a search or tapping back to All
    // re-reads all 876 rows for data already in hand, which measured ~110ms of
    // dropped frames on device for no new information.
    staleTime: Infinity,
  });
}

/**
 * An empty id means "nothing to load" — the editor opened to create rather
 * than edit — so the query stays idle instead of asking for a row that by
 * definition does not exist.
 */
export function useExerciseQuery(id: string) {
  const db = useDatabase();
  return useQuery({
    queryKey: exerciseKeys.detail(id),
    queryFn: () => getExercise(db, id),
    enabled: id !== '',
  });
}

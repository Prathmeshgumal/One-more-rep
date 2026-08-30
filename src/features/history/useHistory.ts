import {useQuery} from '@tanstack/react-query';
import {useDatabase} from '@/providers/DatabaseGate';
import {
  getDay,
  getDayRange,
  getExerciseHistory,
  type DayRange,
} from '@/repositories/historyRepo';
import {getSessionForDate} from '@/repositories/sessionRepo';

export const historyKeys = {
  all: ['history'] as const,
  range: (from: number, to: number) => ['history', 'range', from, to] as const,
  day: (date: number) => ['history', 'day', date] as const,
  session: (date: number) => ['history', 'session', date] as const,
  exercise: (exerciseId: string) =>
    ['history', 'exercise', exerciseId] as const,
};

export function useDayRangeQuery(range: DayRange) {
  const db = useDatabase();
  return useQuery({
    queryKey: historyKeys.range(range.from, range.to),
    queryFn: () => getDayRange(db, range),
    staleTime: Infinity,
  });
}

export function useDayQuery(date: number) {
  const db = useDatabase();
  return useQuery({
    queryKey: historyKeys.day(date),
    queryFn: () => getDay(db, date),
    staleTime: Infinity,
  });
}

/** A past day's whole tree, for the §16 table. */
export function useDaySessionQuery(date: number) {
  const db = useDatabase();
  return useQuery({
    queryKey: historyKeys.session(date),
    queryFn: async () => (await getSessionForDate(db, date)) ?? null,
    staleTime: Infinity,
  });
}

export function useExerciseHistoryQuery(exerciseId: string) {
  const db = useDatabase();
  return useQuery({
    queryKey: historyKeys.exercise(exerciseId),
    // Null rather than undefined: TanStack Query reads undefined as a failed
    // query, which would make a deleted exercise and a database error look
    // identical to the screen.
    queryFn: async () => (await getExerciseHistory(db, exerciseId)) ?? null,
    enabled: exerciseId !== '',
    staleTime: Infinity,
  });
}

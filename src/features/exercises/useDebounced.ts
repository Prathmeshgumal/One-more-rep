import {useEffect, useState} from 'react';

/**
 * The value, but only once it has stopped changing for `delayMs`.
 *
 * Search runs a query per distinct term. Without this, a five-letter word is
 * five full-library queries that serialise on one SQLite connection — measured
 * on device, the last one waited 1.4 seconds behind the backlog even though it
 * matched only 97 rows. Typing stays instant because the input keeps its own
 * state; only the query waits.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}

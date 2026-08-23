import {create} from 'zustand';

/**
 * The weight and reps currently on screen — and nothing else.
 *
 * These are deliberately **not** in the query cache and **not** in the
 * database. Spec 6.2: a pre-filled value that has not been confirmed must stay
 * indistinguishable from nothing at all, so that a process kill loses at most
 * the set being typed rather than inventing one that was never performed.
 */
type ActiveSetState = {
  setId: string | null;
  weight: number | null;
  reps: number;
  /** Called when the active set changes; resets the on-screen numbers. */
  load: (args: {setId: string; weight: number | null; reps: number}) => void;
  adjustWeight: (delta: number) => void;
  adjustReps: (delta: number) => void;
  reset: () => void;
};

/** Two decimals is finer than any plate; beyond that it is float noise. */
const round = (value: number): number => Math.round(value * 100) / 100;

export const useActiveSet = create<ActiveSetState>(set => ({
  setId: null,
  weight: null,
  reps: 10,
  load: ({setId, weight, reps}) => set({setId, weight, reps}),
  adjustWeight: delta =>
    set(state => ({
      // A weight of zero is meaningful here — it is what a bodyweight set
      // shows — so this floors at zero rather than at the increment.
      weight: Math.max(0, round((state.weight ?? 0) + delta)),
    })),
  adjustReps: delta =>
    set(state => ({reps: Math.max(1, state.reps + delta)})),
  reset: () => set({setId: null, weight: null, reps: 10}),
}));

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
  /**
   * Absolute, not a delta. The field below these numbers can be typed into as
   * well as stepped (U5), and a typed 62.5 is not expressible as a delta from
   * whatever happened to be there before.
   */
  setWeight: (value: number) => void;
  setReps: (value: number) => void;
  /**
   * Deltas, applied to whatever is in the store *now*.
   *
   * A caller computing `setReps(reps + 1)` from a rendered value reads a
   * snapshot, and two presses inside one render frame both resolve against the
   * same stale number — the second one silently undoes the first. The stepper
   * shoulders are the fastest-tapped controls in the app, so they go through
   * here instead.
   */
  stepReps: (delta: number) => void;
  stepWeight: (delta: number) => void;
  reset: () => void;
};

/** Two decimals is finer than any plate; beyond that it is float noise. */
const round = (value: number): number => Math.round(value * 100) / 100;

export const useActiveSet = create<ActiveSetState>(set => ({
  setId: null,
  weight: null,
  reps: 10,
  load: ({setId, weight, reps}) => set({setId, weight, reps}),
  // A weight of zero is meaningful here — it is what a bodyweight set shows —
  // so this floors at zero rather than at the increment.
  setWeight: value => set({weight: Math.max(0, round(value))}),
  setReps: value => set({reps: Math.max(1, Math.round(value))}),
  stepReps: delta =>
    set(state => ({reps: Math.max(1, Math.round(state.reps + delta))})),
  stepWeight: delta =>
    set(state => ({weight: Math.max(0, round((state.weight ?? 0) + delta))})),
  reset: () => set({setId: null, weight: null, reps: 10}),
}));

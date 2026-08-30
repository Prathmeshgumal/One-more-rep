import {
  setExerciseNotes,
  swapExercise,
  removeExercise,
  removeSet,
  moveExercise,
  restoreSet,
  type SetSnapshot,
} from '@/repositories/sessionRepo';
import {useSessionMutation} from './useSession';

/**
 * Fixing a workout while you are standing in it (U3).
 *
 * Every one of these goes through `useSessionMutation`, exported from
 * `useSession` rather than copied here, so the awaited double invalidation —
 * the session branch, then the history branch — stays in one place. A second
 * copy would drift, and the symptom would be a screen that quietly stops
 * refreshing.
 */
export const useSetExerciseNotes = () =>
  useSessionMutation<{performedExerciseId: string; notes: string | null}>(
    (db, {performedExerciseId, notes}) =>
      setExerciseNotes(db, performedExerciseId, notes),
  );

export const useSwapExercise = () =>
  useSessionMutation<{performedExerciseId: string; newExerciseId: string}>(
    (db, {performedExerciseId, newExerciseId}) =>
      swapExercise(db, performedExerciseId, newExerciseId),
  );

export const useRemoveExercise = () =>
  useSessionMutation<string>((db, id) => removeExercise(db, id));

/** Deletes a set that was added by hand and never used. */
export const useRemoveSet = () =>
  useSessionMutation<string>((db, id) => removeSet(db, id));

/**
 * Undo, for a screen that leaves.
 *
 * The focus flow replaces the whole screen with the next set the moment one is
 * recorded, so what you just wrote is off screen before you can check it. That
 * makes an unreversible tap unacceptable here in a way it was not on a list.
 */
export const useRestoreSet = () =>
  useSessionMutation<{setId: string; snapshot: SetSnapshot}>(
    (db, {setId, snapshot}) => restoreSet(db, setId, snapshot),
  );

export const useMoveExercise = () =>
  useSessionMutation<{performedExerciseId: string; direction: -1 | 1}>(
    (db, {performedExerciseId, direction}) =>
      moveExercise(db, performedExerciseId, direction),
  );

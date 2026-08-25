import React from 'react';
import {ActionSheet, type SheetAction} from '@/ui/ActionSheet';
import type {SessionExercise} from '@/repositories/sessionRepo';

/**
 * The `⋯` menu on one exercise in a running workout.
 *
 * Every row stays on the sheet whether or not it currently applies, with its
 * reason printed underneath when it does not. Hiding a control that was there
 * a minute ago leaves somebody hunting for it, and "not yet, because" answers
 * the question that hiding it would raise.
 *
 * The rules it enforces are U7 (a swap is refused once a set has been decided,
 * because those sets belong to the old movement) and U8 (only an exercise
 * added during the workout can be deleted; a planned one you did not do is
 * skipped, not erased).
 */
export function ExerciseActions({
  visible,
  exercise,
  isFirst,
  isLast,
  onClose,
  onSwap,
  onRemove,
  onMove,
  onSummary,
}: {
  visible: boolean;
  exercise: SessionExercise;
  isFirst: boolean;
  isLast: boolean;
  onClose: () => void;
  onSwap: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onSummary: () => void;
}) {
  const anyDecided = exercise.sets.some(s => s.status !== 'pending');
  const anyRecorded = exercise.sets.some(s => s.status === 'completed');
  const isPlanned = exercise.plannedExerciseId !== null;

  const actions: SheetAction[] = [
    {
      label: 'Swap this exercise',
      onPress: onSwap,
      disabled: anyDecided,
      reason: 'A set is already recorded — finish it and add the new one',
    },
    {
      label: 'Move up',
      onPress: () => onMove(-1),
      disabled: isFirst,
      reason: 'Already first',
    },
    {
      label: 'Move down',
      onPress: () => onMove(1),
      disabled: isLast,
      reason: 'Already last',
    },
    {
      label: 'See the summary',
      onPress: onSummary,
      disabled: !anyRecorded,
      reason: 'Nothing recorded yet',
    },
    {
      label: 'Remove from this workout',
      onPress: onRemove,
      quiet: true,
      disabled: isPlanned || anyDecided,
      reason: isPlanned
        ? 'This one is in the plan — skip it instead'
        : 'A set is already recorded, so it is part of the workout now',
    },
  ];

  return (
    <ActionSheet
      visible={visible}
      title={exercise.name}
      actions={actions}
      onClose={onClose}
    />
  );
}

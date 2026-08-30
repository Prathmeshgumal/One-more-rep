import React from 'react';
import {ActionGrid, type GridAction} from '@/ui/ActionGrid';
import type {SessionExercise, SessionSet} from '@/repositories/sessionRepo';

/**
 * The `⋯` menu on one exercise in a running workout.
 *
 * Everything an exercise can do lives here now. In the list this replaced,
 * "Add a set" and "Finish this exercise" were full-width buttons inside every
 * expanded card — 56dp each, once per exercise, on a screen whose whole
 * problem was vertical space. A focus flow has nowhere to put them at all, so
 * one door for all of it: which does mean this is the one control a new user
 * has to find, and the reason it is a plain `⋯` rather than anything clever.
 *
 * It is a grid of tiles rather than a column of rows, because eight identical
 * lines of text told you nothing about which of them you wanted, and a 44dp
 * row is a target designed for a cursor. The order below is fixed and never
 * depends on state — a tile that moves between openings is a tile you have to
 * read again every time.
 *
 * Every action stays on the grid whether or not it currently applies, and an
 * unavailable one explains itself when pressed. Hiding a control that was
 * there a minute ago leaves somebody hunting for it, and "not yet, because"
 * answers the question that hiding it would raise.
 *
 * The rules it enforces are U7 (a swap is refused once a set has been decided,
 * because those sets belong to the old movement) and U8 (only an exercise
 * added during the workout can be deleted; a planned one you did not do is
 * skipped, not erased).
 */
export function ExerciseActions({
  visible,
  exercise,
  set,
  setNumber,
  isFirst,
  isLast,
  onClose,
  onAddSet,
  onRemoveSet,
  onFinish,
  onSwap,
  onNote,
  onRemove,
  onMove,
}: {
  visible: boolean;
  exercise: SessionExercise;
  /** The set in focus — the sheet acts on it as well as on the exercise. */
  set: SessionSet;
  setNumber: number;
  isFirst: boolean;
  isLast: boolean;
  onClose: () => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onFinish: () => void;
  onSwap: () => void;
  onNote: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const anyPending = exercise.sets.some(s => s.status === 'pending');
  const anyDecided = exercise.sets.some(s => s.status !== 'pending');
  const anyRecorded = exercise.sets.some(s => s.status === 'completed');
  const isPlanned = exercise.plannedExerciseId !== null;

  const actions: GridAction[] = [
    {
      label: 'Add a set',
      short: 'Add set',
      glyph: '＋',
      onPress: onAddSet,
    },
    {
      label: exercise.notes ? 'Edit the note' : 'Add a note',
      short: 'Note',
      glyph: '✎',
      onPress: onNote,
    },
    {
      /**
       * U11. Finishing and skipping are different acts, and the difference is
       * whether anything actually happened. The control used to say "Skip"
       * always, and marked a part-done exercise skipped — which understates
       * the work, and came back from the phone as a complaint.
       *
       * Greyed rather than gone once nothing is pending: with nothing left to
       * close it could only do nothing, which is exactly how it was reported
       * as "Finish this exercise isn't working".
       */
      label: anyRecorded ? 'Finish this exercise' : 'Skip this exercise',
      short: anyRecorded ? 'Finish' : 'Skip',
      glyph: '✓',
      onPress: onFinish,
      disabled: !anyPending,
      reason: 'Every set is already decided',
    },
    {
      label: 'Move up',
      short: 'Up',
      glyph: '▲',
      onPress: () => onMove(-1),
      disabled: isFirst,
      reason: 'Already first',
    },
    {
      label: 'Move down',
      short: 'Down',
      glyph: '▼',
      onPress: () => onMove(1),
      disabled: isLast,
      reason: 'Already last',
    },
    {
      label: 'Swap for another exercise',
      short: 'Swap',
      glyph: '⇄',
      onPress: onSwap,
      disabled: anyDecided,
      reason: 'A set is already recorded — finish it and add the new one',
    },
    {
      /**
       * A set added by mistake, taken back. The rule is the repository's: a
       * planned set is skipped rather than erased, because deleting it would
       * shrink the denominator and flatter the workout — whereas deleting a
       * bonus set only ever reduces the credit claimed.
       */
      label: `Remove set ${setNumber}`,
      short: 'Del set',
      glyph: '−',
      onPress: onRemoveSet,
      disabled: !set.isUnplanned || exercise.sets.length <= 1,
      reason: !set.isUnplanned
        ? 'This set is in the plan — skip it instead'
        : 'An exercise needs a set. Remove the exercise instead.',
    },
    {
      label: 'Remove from this workout',
      short: 'Remove',
      glyph: '✕',
      onPress: onRemove,
      disabled: isPlanned || anyDecided,
      reason: isPlanned
        ? 'This exercise is in the plan — skip it instead'
        : 'A set is already recorded, so it is part of the workout now',
    },
  ];

  return (
    <ActionGrid
      visible={visible}
      title={exercise.name}
      actions={actions}
      onClose={onClose}
    />
  );
}

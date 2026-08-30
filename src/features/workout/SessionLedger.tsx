import React from 'react';
import {View} from 'react-native';
import {SetLine} from '@/ui/SetLine';
import {ExerciseLine} from '@/ui/ExerciseLine';
import type {Session, SessionSet} from '@/repositories/sessionRepo';

/**
 * A whole session as one flat run of lines.
 *
 * This is the component all three candidate flows shared, which is why it was
 * built first: whether the workout screen ends up a vertical list, a carousel
 * or one set at a time, the ledger is the same — the peek reads it, the
 * finished day reads it, and the calendar's day detail reads it.
 *
 * The whole of a three-exercise, eleven-set session is 624dp here, against a
 * 720dp viewport. The screen it replaces spent 591dp on one exercise.
 */
export function SessionLedger({
  session,
  unit,
  liveSetId = null,
  amendingSetId = null,
  onSelectSet,
  onPressExerciseMenu,
}: {
  session: Session;
  unit: string;
  /** The set being worked on, if the caller is a live workout. */
  liveSetId?: string | null;
  amendingSetId?: string | null;
  onSelectSet?: (set: SessionSet, performedExerciseId: string) => void;
  onPressExerciseMenu?: (performedExerciseId: string) => void;
}) {
  return (
    <View>
      {session.exercises.map(exercise => {
        // Every row counts, in both halves. Excluding a bonus set from the
        // denominator would print 4 / 4 on an exercise with a set still
        // pending -- the tally would read finished while the ledger beneath it
        // plainly was not.
        const done = exercise.sets.filter(s => s.status === 'completed').length;
        return (
          <View key={exercise.id}>
            <ExerciseLine
              name={exercise.name}
              done={done}
              total={exercise.sets.length}
              dimmed={exercise.status !== 'pending'}
              note={exercise.notes}
              onPressMenu={
                onPressExerciseMenu
                  ? () => onPressExerciseMenu(exercise.id)
                  : undefined
              }
            />
            {exercise.sets.map((set, index) => (
              <SetLine
                key={set.id}
                index={index + 1}
                targetReps={set.targetReps}
                targetWeight={set.targetWeight}
                actualReps={set.actualReps}
                actualWeight={set.actualWeight}
                status={set.status}
                isUnplanned={set.isUnplanned}
                isLive={set.id === liveSetId}
                isAmending={set.id === amendingSetId}
                unit={unit}
                onPress={
                  onSelectSet ? () => onSelectSet(set, exercise.id) : undefined
                }
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

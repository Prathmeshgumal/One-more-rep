import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {AppText} from '@/ui/Text';
import {StatusChip} from '@/ui/StatusChip';
import {useTheme, space, radius} from '@/theme';
import {targetLine} from '@/domain/format';
import {aggregateExercise} from '@/domain/sessionProgress';
import type {
  SessionExercise,
  PreviousPerformance,
} from '@/repositories/sessionRepo';
import {SetRow} from './SetRow';

/**
 * One exercise in the workout list (U1).
 *
 * Collapsed it is a name, how far through it is, what it is asking for, and —
 * once it is finished — how that went. Expanded it is the sets themselves.
 *
 * The collapsed state deliberately keeps the target line. Complaint 6 was that
 * you could not see what set 3 wanted while you were standing on set 1; a card
 * that hides its target when shut would reintroduce that one level up.
 *
 * It owns no state. Which card is open is the screen's business (U2 — exactly
 * one), and so is which set is active, because both are decisions about the
 * workout rather than about this card.
 */
export function WorkoutExerciseCard({
  exercise,
  expanded,
  onToggle,
  onLayoutY,
  unit,
  increment,
  previous,
  activeSetId,
  activeWeight,
  activeReps,
  onSetWeight,
  onSetReps,
  onCompleteSet,
  children,
}: {
  exercise: SessionExercise;
  expanded: boolean;
  onToggle: () => void;
  /** Feeds the screen's auto-scroll; see WorkoutScreen. */
  onLayoutY: (y: number) => void;
  unit: string;
  increment: number;
  previous?: PreviousPerformance | null;
  activeSetId?: string | null;
  activeWeight?: number | null;
  activeReps?: number;
  onSetWeight?: (value: number) => void;
  onSetReps?: (value: number) => void;
  onCompleteSet?: () => void;
  /** The action row — add set, skip, notes. Only drawn when open. */
  children?: React.ReactNode;
}) {
  const {colors} = useTheme();

  // A bonus set carries no target, and neither does a planned set whose target
  // never made it in — so both are excluded from the target line rather than
  // being described as something they are not. The guard is what tells the
  // compiler that too.
  const planned = exercise.sets.filter(
    (s): s is typeof s & {targetReps: number} =>
      !s.isUnplanned && s.targetReps !== null,
  );
  const recorded = exercise.sets.filter(s => s.status === 'completed').length;
  const finished = exercise.status !== 'pending';

  const aggregate = aggregateExercise(exercise.sets, exercise.weightApplicable);

  // A skipped exercise says so plainly. Anything else that is finished reports
  // how it went against its target — ochre when short, never red.
  const verdict = !finished
    ? null
    : exercise.status === 'skipped'
      ? ('skipped' as const)
      : aggregate.status;

  return (
    <View
      testID="exercise-card"
      onLayout={event => onLayoutY(event.nativeEvent.layout.y)}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: expanded ? colors.plate : colors.ruleSoft,
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={exercise.name}
        accessibilityState={{expanded}}
        accessibilityHint={
          expanded ? 'Closes this exercise' : 'Opens this exercise'
        }
        onPress={onToggle}
        style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="bodyStrong" color={finished ? 'muted' : 'ink'}>
            {exercise.name}
          </AppText>
          {/* Full contrast, open or shut: this is the number you are working
              towards, not decoration. */}
          <AppText variant="printed" color="muted">
            {targetLine(planned, unit)}
          </AppText>
        </View>
        <View style={styles.headerMeta}>
          <AppText variant="mono" color="ink2">
            {`${recorded} / ${exercise.sets.length} sets`}
          </AppText>
          {verdict ? <StatusChip status={verdict} /> : null}
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          {previous ? (
            <AppText variant="printed" color="muted">
              {`last time ${previous.sets
                .map(
                  s =>
                    `${s.weight === null ? '' : `${s.weight.toFixed(1)}×`}${
                      s.reps
                    }`,
                )
                .join(' · ')}`}
            </AppText>
          ) : null}

          {exercise.sets.map((set, index) => {
            const isActive = activeSetId === set.id;
            // The most recent weight recorded *before* this set, so a ghost
            // never suggests a number from further down the exercise.
            const fallbackWeight =
              [...exercise.sets.slice(0, index)]
                .reverse()
                .find(s => s.status === 'completed' && s.actualWeight !== null)
                ?.actualWeight ?? null;
            return (
              <SetRow
                key={set.id}
                setNumber={set.setNumber}
                targetReps={set.targetReps}
                targetWeight={set.targetWeight}
                actualReps={isActive ? (activeReps ?? null) : set.actualReps}
                actualWeight={
                  isActive ? (activeWeight ?? null) : set.actualWeight
                }
                status={set.status}
                isUnplanned={set.isUnplanned}
                isActive={isActive}
                unit={unit}
                increment={increment}
                weightApplicable={exercise.weightApplicable}
                fallbackWeight={fallbackWeight}
                onSetWeight={isActive ? onSetWeight : undefined}
                onSetReps={isActive ? onSetReps : undefined}
                onComplete={isActive ? onCompleteSet : undefined}
              />
            );
          })}

          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    // 44px minimum, so a collapsed card is a comfortable target with a
    // chalked-up thumb.
    minHeight: 44,
  },
  headerText: {flex: 1, gap: 2},
  headerMeta: {alignItems: 'flex-end', gap: space.xs},
  body: {paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm},
});

import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {AppText} from '@/ui/Text';
import {StatusChip} from '@/ui/StatusChip';
import {useTheme, space, radius} from '@/theme';
import {compareSet, describeComparison} from '@/domain/setComparison';

/**
 * One row of design 09.
 *
 * The target is printed across the head strip; the actual is written large
 * beneath it. A recorded row shrinks and carries its verdict; the active row
 * gets the steppers and the check; anything further down is dimmed, because it
 * has not happened yet and should not compete for attention.
 */
export function SetRow({
  setNumber,
  targetReps,
  targetWeight,
  actualReps,
  actualWeight,
  status,
  isUnplanned,
  isActive,
  unit,
  increment,
  onAdjustWeight,
  onAdjustReps,
  onComplete,
}: {
  setNumber: number;
  targetReps: number | null;
  targetWeight: number | null;
  actualReps: number | null;
  actualWeight: number | null;
  status: 'pending' | 'completed' | 'skipped';
  isUnplanned: boolean;
  isActive: boolean;
  unit: string;
  increment: number;
  onAdjustWeight?: (delta: number) => void;
  onAdjustReps?: (delta: number) => void;
  onComplete?: () => void;
}) {
  const {colors} = useTheme();

  const targetLabel =
    targetReps === null
      ? 'bonus set'
      : targetWeight === null
        ? `target ${targetReps}`
        : `target ${targetReps} × ${targetWeight.toFixed(1)}`;

  const comparison = compareSet({
    targetReps,
    targetWeight,
    actualReps,
    actualWeight,
    status,
  });

  const done = status !== 'pending';

  return (
    <View
      style={[
        styles.row,
        {borderColor: isActive ? colors.plate : colors.ruleSoft},
        {backgroundColor: colors.surface},
        !done && !isActive && styles.dim,
      ]}>
      <View
        style={[
          styles.head,
          {
            borderBottomColor: isActive ? colors.plate : colors.ruleSoft,
            backgroundColor: isActive ? colors.plateSoft : 'transparent',
          },
        ]}>
        <AppText variant="eyebrow" color={isActive ? 'plate' : 'muted'}>
          {`Set ${setNumber}`}
        </AppText>
        <AppText variant="printed" color="muted">
          {targetLabel}
        </AppText>
      </View>

      <View style={styles.body}>
        <View style={styles.field}>
          <AppText
            accessibilityLabel={isActive ? 'Weight' : undefined}
            variant={isActive ? 'display' : 'inkNum'}
            color={done || isActive ? 'ink' : 'faint'}>
            {(isActive ? actualWeight : actualWeight) === null
              ? '—'
              : (actualWeight ?? 0).toFixed(1)}
          </AppText>
          <AppText variant="printed" color="muted">
            {unit}
          </AppText>
          {isActive && onAdjustWeight ? (
            <Stepper
              onDown={() => onAdjustWeight(-increment)}
              onUp={() => onAdjustWeight(increment)}
              label="weight"
            />
          ) : null}
        </View>

        <AppText variant="printed" color="faint">
          ×
        </AppText>

        <View style={styles.field}>
          <AppText
            accessibilityLabel={isActive ? 'Reps' : undefined}
            variant={isActive ? 'display' : 'inkNum'}
            color={done || isActive ? 'ink' : 'faint'}>
            {actualReps === null ? '—' : String(actualReps)}
          </AppText>
          <AppText variant="printed" color="muted">
            reps
          </AppText>
          {isActive && onAdjustReps ? (
            <Stepper
              onDown={() => onAdjustReps(-1)}
              onUp={() => onAdjustReps(1)}
              label="reps"
            />
          ) : null}
        </View>

        {isActive && onComplete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Complete set"
            onPress={onComplete}
            style={[styles.check, {backgroundColor: colors.plate}]}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Path
                d="M5 13l4 4L19 7"
                stroke={colors.plateInk}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        ) : done ? (
          <StatusChip
            status={isUnplanned ? 'unplanned' : comparison.status}
            label={
              isUnplanned
                ? 'Bonus'
                : comparison.status === 'achieved'
                  ? 'Achieved'
                  : describeComparison(comparison, unit)
            }
          />
        ) : null}
      </View>
    </View>
  );
}

/** The design's −/+ shoulders. Big enough to hit with a chalked-up thumb. */
function Stepper({
  onDown,
  onUp,
  label,
}: {
  onDown: () => void;
  onUp: () => void;
  label: string;
}) {
  const {colors} = useTheme();
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        onPress={onDown}
        style={[styles.shoulder, {borderColor: colors.rule}]}>
        <AppText variant="bodyStrong" color="ink2">
          −
        </AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        onPress={onUp}
        style={[styles.shoulder, {borderColor: colors.rule}]}>
        <AppText variant="bodyStrong" color="ink2">
          +
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space.sm,
  },
  dim: {opacity: 0.55},
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
  },
  field: {flex: 1, alignItems: 'center', gap: 2},
  stepper: {flexDirection: 'row', gap: space.sm, marginTop: space.sm},
  shoulder: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
  },
  check: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {AppText} from '@/ui/Text';
import {StatusChip} from '@/ui/StatusChip';
import {useTheme, space, radius} from '@/theme';
import {NumberField} from '@/ui/NumberField';
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
  weightApplicable = true,
  onSetWeight,
  onSetReps,
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
  /** A bodyweight movement gets no weight field at all, not a zero in one. */
  weightApplicable?: boolean;
  onSetWeight?: (value: number) => void;
  onSetReps?: (value: number) => void;
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
        {weightApplicable ? (
          <View style={styles.field}>
            {isActive && onSetWeight ? (
              <NumberField
                label="Weight"
                size="display"
                value={actualWeight}
                step={increment}
                min={0}
                decimals={1}
                unit={unit}
                onChange={onSetWeight}
              />
            ) : (
              <>
                <AppText variant="inkNum" color={done ? 'ink' : 'faint'}>
                  {actualWeight === null ? '—' : actualWeight.toFixed(1)}
                </AppText>
                <AppText variant="printed" color="muted">
                  {unit}
                </AppText>
              </>
            )}
          </View>
        ) : null}

        {weightApplicable ? (
          <AppText variant="printed" color="faint">
            ×
          </AppText>
        ) : null}

        <View style={styles.field}>
          {isActive && onSetReps ? (
            <NumberField
              label="Reps"
              size="display"
              value={actualReps}
              step={1}
              min={1}
              unit="reps"
              onChange={onSetReps}
            />
          ) : (
            <>
              <AppText variant="inkNum" color={done ? 'ink' : 'faint'}>
                {actualReps === null ? '—' : String(actualReps)}
              </AppText>
              <AppText variant="printed" color="muted">
                reps
              </AppText>
            </>
          )}
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
  check: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

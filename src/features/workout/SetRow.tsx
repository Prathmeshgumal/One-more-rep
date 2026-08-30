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
 * gets the fields and the check.
 *
 * A set further down used to have the whole row drawn at 55% opacity, on the
 * reasoning that it had not happened yet and should not compete for attention.
 * On a phone at arm's length that read as absent, and it is the whole of
 * complaint 6: "I didn't see the weight and reps target for the next sets."
 * The head strip now keeps full contrast — the target is what you are working
 * towards, and you need it *before* you lift, not after — and only the empty
 * actual is drawn faint, which is honest, because there is nothing there yet.
 */
/** A space, not an empty string: it holds the line's height so the row keeps
 *  its shape when there is no number to print. */
const BLANK = ' ';

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
  fallbackWeight,
  onSetWeight,
  onSetReps,
  onComplete,
  onEdit,
  onRemove,
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
  /**
   * What to suggest when this set has no target weight of its own — the last
   * weight actually lifted on this exercise today. Same rule as the active
   * set's pre-fill (§35), so the ghost and the pre-fill never disagree.
   */
  fallbackWeight?: number | null;
  onSetWeight?: (value: number) => void;
  onSetReps?: (value: number) => void;
  onComplete?: () => void;
  /**
   * U10. Offered only on a set that has already been decided — completed or
   * skipped. A pending set is either already the active one or is reached by
   * finishing the sets before it, so there is nothing there to correct yet.
   */
  onEdit?: () => void;
  /**
   * Offered only on a set you added yourself and have not used. A planned set
   * you did not do is skipped rather than erased — see `removeSet`.
   */
  onRemove?: () => void;
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

  /**
   * A set that has not happened yet shows its **target**, greyed, rather than
   * an em dash.
   *
   * The dash was accurate — nothing has been lifted — but it read as broken
   * rather than as empty, and it wasted the one place on the row where the
   * number you are about to aim for could be doing some work.
   *
   * A weight-bearing exercise planned without a target weight has nothing to
   * ghost, so it falls back to the last weight actually lifted on it today.
   * When even that is missing the slot is left blank rather than dashed: the
   * KG label already says what the space is for, and an em dash in the
   * number's place reads as broken rather than as empty.
   */
  const ghosting = !isActive;
  const shownWeight =
    actualWeight ?? (ghosting ? (targetWeight ?? fallbackWeight ?? null) : null);
  const shownReps = actualReps ?? (ghosting ? targetReps : null);

  const editable = done && onEdit !== undefined;

  const Row = editable ? Pressable : View;

  return (
    <Row
      {...(editable
        ? {
            accessibilityRole: 'button' as const,
            accessibilityLabel: `Edit set ${setNumber}`,
            accessibilityHint: 'Reopens this set so it can be corrected',
            onPress: onEdit,
          }
        : {})}
      style={[
        styles.row,
        {borderColor: isActive ? colors.plate : colors.ruleSoft},
        {backgroundColor: colors.surface},
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
        <View style={styles.headRight}>
          <AppText variant="printed" color="muted">
            {targetLabel}
          </AppText>
          {onRemove ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove set ${setNumber}`}
              accessibilityHint="Deletes this set, which you added"
              // Drawn small; the slop is what makes it a thumb target.
              hitSlop={space.md}
              onPress={onRemove}>
              <AppText variant="body" color="faint">
                ✕
              </AppText>
            </Pressable>
          ) : null}
        </View>
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
                <AppText
                  variant="inkNum"
                  color={actualWeight === null ? 'faint' : 'ink'}>
                  {shownWeight === null ? BLANK : shownWeight.toFixed(1)}
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
              <AppText
                variant="inkNum"
                color={actualReps === null ? 'faint' : 'ink'}>
                {shownReps === null ? BLANK : String(shownReps)}
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
    </Row>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space.sm,
  },
  headRight: {flexDirection: 'row', alignItems: 'center', gap: space.md},
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

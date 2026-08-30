import React, {useEffect, useState} from 'react';
import {Modal, Pressable, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {Stepper} from '@/ui/Stepper';
import {useTheme, space, radius} from '@/theme';
import type {SessionSet} from '@/repositories/sessionRepo';

/**
 * Correcting one set on a day that is already saved.
 *
 * There was no route to this at all: a number typed wrong on Tuesday was wrong
 * forever. Nothing in the data model was stopping it — `completeSet` overwrites
 * regardless of the session's status, and always has — only the screens
 * declined to offer it.
 *
 * Correction happens **in place**, with the session left `completed`
 * throughout. The alternative was to reopen the day into an in-progress state,
 * which is more powerful and introduces a day that is finished and then is not
 * — something the adherence figures, the calendar and the day resolver all
 * read. This covers the real case, which is a wrong number, and costs no new
 * states.
 *
 * Ochre, not blue: blue means live, ochre means you are altering the record.
 */
export function AmendSetSheet({
  visible,
  set,
  setNumber,
  exerciseName,
  weightApplicable,
  unit,
  increment,
  busy = false,
  onSave,
  onSkip,
  onClose,
}: {
  visible: boolean;
  set: SessionSet | null;
  setNumber: number;
  exerciseName: string;
  weightApplicable: boolean;
  unit: string;
  increment: number;
  busy?: boolean;
  onSave: (actuals: {actualReps: number; actualWeight: number | null}) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const [reps, setReps] = useState(0);
  const [weight, setWeight] = useState<number | null>(null);

  // Opens on what was recorded, falling back to the target: you are fixing a
  // number, so the number that was typed is a better starting point than the
  // one it was aiming at.
  useEffect(() => {
    if (visible && set) {
      setReps(set.actualReps ?? set.targetReps ?? 10);
      setWeight(
        set.actualWeight ?? set.targetWeight ?? (weightApplicable ? 0 : null),
      );
    }
  }, [visible, set, weightApplicable]);

  if (!set) {
    return null;
  }

  const wasRecorded = set.status === 'completed' && set.actualReps !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={[styles.scrim, {backgroundColor: colors.board}]}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.short,
            paddingBottom: Math.max(insets.bottom, space.lg),
          },
        ]}>
        <View style={[styles.grab, {backgroundColor: colors.rule}]} />

        <AppText variant="eyebrow" color="short">
          Amending a recorded set
        </AppText>
        <AppText variant="h2">{`${exerciseName} · set ${setNumber}`}</AppText>
        <AppText variant="printed" color="muted">
          {[
            set.targetReps === null
              ? 'bonus set · no target'
              : `target ${set.targetReps}${
                  set.targetWeight !== null
                    ? ` × ${set.targetWeight} ${unit}`
                    : ''
                }`,
            // What is on record, beside what you are changing it to.
            wasRecorded
              ? `recorded as ${set.actualReps}`
              : set.status === 'skipped'
              ? 'recorded as skipped'
              : 'never recorded',
          ].join(' · ')}
        </AppText>

        {weightApplicable ? (
          <Stepper
            label={`Weight (${unit})`}
            value={weight ?? 0}
            step={increment}
            min={0}
            onChange={setWeight}
          />
        ) : null}
        <Stepper
          label="Reps"
          value={reps}
          step={1}
          min={1}
          onChange={setReps}
        />

        <Button
          label="Save change"
          disabled={busy}
          onPress={() =>
            onSave({
              actualReps: reps,
              actualWeight: weightApplicable ? weight : null,
            })
          }
        />
        {/* A set recorded that should not have been. Marking it skipped is the
            honest correction — deleting it would shrink the denominator. */}
        {wasRecorded ? (
          <Button
            label="Mark as skipped"
            variant="ghost"
            size="sm"
            disabled={busy}
            onPress={onSkip}
          />
        ) : null}
        <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {flex: 1, opacity: 0.6},
  sheet: {
    // Two, not one: the ochre edge is how this reads as an amendment at a
    // glance rather than as another sheet.
    borderTopWidth: 2,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    gap: space.sm,
  },
  grab: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: space.xs,
  },
});

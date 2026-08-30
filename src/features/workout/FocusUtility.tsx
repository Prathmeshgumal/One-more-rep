import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {AppText} from '@/ui/Text';
import {useTheme, space, radius} from '@/theme';

export const UTILITY_HEIGHT = 36;

/**
 * A 32dp pill in a 36dp row, with the touch area grown to clear 44.
 *
 * The row is small on purpose — it is what the action bar gave up two lines
 * to make space for — so the targets are grown rather than the pills.
 */
const SLOP = {top: 10, bottom: 10, left: 8, right: 8};

/**
 * The strip between the set and the buttons.
 *
 * What was here before was a single `Pressable` laid out as
 * `← set 2 · ▲ the whole session · set 1 →`, so three things that looked like
 * buttons all did the same one thing. The arrows were never controls; they
 * were labels describing what the rail above already does, and they read as a
 * promise the screen did not keep.
 *
 * One button now, saying what it opens and how far through you are. Beside it
 * the note, which was two taps and a scan of eight menu rows away — far enough
 * that "left shoulder tight" never got written down. And on the right, the
 * line the Record button used to carry as a second row of type, which is what
 * lets that button be one line and 56dp instead of two and 76.
 */
export function FocusUtility({
  done,
  total,
  exerciseName,
  hasNote,
  nextLabel,
  onOpenSession,
  onOpenNote,
}: {
  done: number;
  total: number;
  /** Named in the note button's label: the ⋯ menu offers the same act, and
      two controls answering to one name is a maze with a screen reader. */
  exerciseName: string;
  hasNote: boolean;
  /** Where the primary button goes next, named. */
  nextLabel: string | null;
  onOpenSession: () => void;
  onOpenNote: () => void;
}) {
  const {colors} = useTheme();

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show the whole session"
        hitSlop={SLOP}
        onPress={onOpenSession}
        style={[styles.pill, {borderColor: colors.rule}]}>
        <AppText variant="monoSmall" color="ink2">
          {`▲ session ${done}/${total}`}
        </AppText>
      </Pressable>

      {/* Filled once there is a note, so the exercise's note is visible as a
          state rather than as something you have to go and check. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          hasNote
            ? `Edit the note on ${exerciseName}`
            : `Add a note to ${exerciseName}`
        }
        hitSlop={SLOP}
        onPress={onOpenNote}
        style={[
          styles.pill,
          {
            borderColor: hasNote ? colors.short : colors.rule,
            // paper, not transparent: it is what the pill sits on, so this
            // reads as unfilled without a literal in the style.
            backgroundColor: hasNote ? colors.shortSoft : colors.paper,
          },
        ]}>
        <AppText variant="monoSmall" color={hasNote ? 'short' : 'ink2'}>
          {hasNote ? '✎ note' : '✎ add note'}
        </AppText>
      </Pressable>

      <View style={styles.spacer} />

      <AppText variant="monoSmall" color="faint" numberOfLines={1}>
        {nextLabel ? `then ${nextLabel}` : 'the last set'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: UTILITY_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  pill: {
    height: 32,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    justifyContent: 'center',
  },
  spacer: {flex: 1},
});

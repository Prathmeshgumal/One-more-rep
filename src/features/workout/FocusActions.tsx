import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {AppText} from '@/ui/Text';
import {useTheme, space, radius} from '@/theme';
import type {FocusMode} from './FocusSet';

export const ACTION_BAR_HEIGHT = 56;

/**
 * The one control you touch, in the one place it always is.
 *
 * Its label states the consequence — "Record 12 reps", never a bare tick — so
 * there is no question about what was just written on a screen that is about
 * to be replaced by the next set.
 *
 * 56dp, not the 76 this started at. Two buttons carrying two lines each came
 * to 92dp with their padding, a tenth of the screen, and the second line was
 * saying where the *next* set is — which is a fact about the session, not
 * about this button. It lives in the utility row above now.
 */
export function FocusActions({
  mode,
  reps,
  weight,
  unit,
  weightInPlay,
  nextLabel,
  busy = false,
  onRecord,
  onSkip,
  onSaveAmendment,
  onCancelAmendment,
  onAdvance,
}: {
  mode: FocusMode;
  reps: number;
  weight: number | null;
  unit: string;
  /** Whether this set has a weight worth naming in the label. */
  weightInPlay: boolean;
  /** Where the primary button goes next, when it is a move rather than a write. */
  nextLabel: string | null;
  busy?: boolean;
  onRecord: () => void;
  onSkip: () => void;
  onSaveAmendment: () => void;
  onCancelAmendment: () => void;
  onAdvance: () => void;
}) {
  const {colors} = useTheme();

  const recordLabel =
    weightInPlay && weight !== null && weight > 0
      ? `Record ${reps} × ${weight} ${unit}`
      : `Record ${reps} reps`;

  const primary =
    mode === 'amending'
      ? {
          label: 'Save change',
          onPress: onSaveAmendment,
          tone: colors.short,
          ink: colors.plateInk,
        }
      : mode === 'skipped'
      ? {
          label: nextLabel ? `Go to ${nextLabel}` : 'Back to the workout',
          onPress: onAdvance,
          tone: colors.plate,
          ink: colors.plateInk,
        }
      : {
          label: recordLabel,
          onPress: onRecord,
          tone: colors.plate,
          ink: colors.plateInk,
        };

  // Amending offers Cancel; a live set offers Skip; a set already skipped has
  // its own Undo in the body and needs no second control here.
  const secondary =
    mode === 'amending'
      ? {label: 'Cancel', glyph: '↩', onPress: onCancelAmendment}
      : mode === 'live'
      ? {label: 'Skip', glyph: '⤼', onPress: onSkip}
      : null;

  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={primary.label}
        accessibilityState={{disabled: busy}}
        disabled={busy}
        onPress={primary.onPress}
        style={[
          styles.primary,
          busy && styles.busy,
          {backgroundColor: primary.tone},
        ]}>
        <AppText variant="h3" style={{color: primary.ink}} numberOfLines={1}>
          {primary.label}
        </AppText>
      </Pressable>

      {secondary ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={secondary.label}
          accessibilityState={{disabled: busy}}
          disabled={busy}
          onPress={secondary.onPress}
          style={[styles.secondary, {borderColor: colors.rule}]}>
          <AppText variant="body" color="ink2">
            {`${secondary.glyph} ${secondary.label}`}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
  },
  primary: {
    flex: 1,
    height: ACTION_BAR_HEIGHT,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  busy: {opacity: 0.6},
  secondary: {
    width: 88,
    height: ACTION_BAR_HEIGHT,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

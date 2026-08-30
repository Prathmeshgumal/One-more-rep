import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {AppText} from '@/ui/Text';
import {useTheme, space, radius} from '@/theme';
import type {FocusMode} from './FocusSet';

/** The block is 96dp: two 44dp rows with 8 between them, and Record matches. */
const BLOCK_HEIGHT = 96;
const CLUSTER_WIDTH = 104;

export const FOOTER_HEIGHT = BLOCK_HEIGHT + space.sm + 14 + space.md;

/**
 * One cell of the 2×2. Glyph over a micro-label, because a bare ⤼ is
 * guessable rather than legible, and the first fortnight of guessing is a
 * fortnight of skipped sets nobody meant to skip.
 */
function Cell({
  glyph,
  label,
  accessibilityLabel,
  tone = 'ink2',
  fill = false,
  disabled = false,
  onPress,
}: {
  glyph: string;
  label: string;
  accessibilityLabel: string;
  tone?: 'ink2' | 'short';
  fill?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.cell,
        {
          borderColor: tone === 'short' ? colors.short : colors.rule,
          backgroundColor: fill
            ? colors.shortSoft
            : pressed
            ? colors.surface2
            : colors.paper,
        },
        disabled && styles.dim,
      ]}>
      <AppText variant="body" color={tone}>
        {glyph}
      </AppText>
      <AppText variant="printed" color={disabled ? 'faint' : 'muted'}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * Everything you can press at the bottom of a set, as one object.
 *
 * What this replaces was four controls in three shapes — a 32dp pill, a 56dp
 * filled rectangle, a 56dp outlined box — plus a caption with no border
 * sitting in the row with them, and a ⋯ stranded 700dp away in the header.
 * Nothing in that arrangement said which one you press ninety-five times a
 * session.
 *
 * So: one block for the thing you press, one 2×2 keypad for the four you
 * don't, both inside a single thumb arc, and the caption underneath as type
 * rather than as a button that lost its outline.
 *
 * Skip loses three quarters of its area in the move. It was the same height as
 * Record and directly under the same thumb, which is how a set gets skipped by
 * accident; at 48×44 in the corner it is still one tap, just not the one your
 * thumb lands on by default.
 */
export function FocusFooter({
  mode,
  reps,
  weight,
  unit,
  weightInPlay,
  nextLabel,
  done,
  total,
  exerciseName,
  hasNote,
  busy = false,
  onRecord,
  onSkip,
  onSaveAmendment,
  onCancelAmendment,
  onAdvance,
  onOpenSession,
  onOpenNote,
  onOpenMenu,
}: {
  mode: FocusMode;
  reps: number;
  weight: number | null;
  unit: string;
  weightInPlay: boolean;
  /** Where the primary button goes next, named. */
  nextLabel: string | null;
  done: number;
  total: number;
  exerciseName: string;
  hasNote: boolean;
  busy?: boolean;
  onRecord: () => void;
  onSkip: () => void;
  onSaveAmendment: () => void;
  onCancelAmendment: () => void;
  onAdvance: () => void;
  onOpenSession: () => void;
  onOpenNote: () => void;
  onOpenMenu: () => void;
}) {
  const {colors} = useTheme();

  const actuals =
    weightInPlay && weight !== null && weight > 0
      ? `${reps} × ${weight} ${unit}`
      : `${reps} reps`;

  // Two lines when there are numbers to put on the second one. The verb stays
  // small and the figures get the size, because the figures are what you are
  // checking before you commit them.
  const primary =
    mode === 'amending'
      ? {
          label: 'Save change',
          detail: actuals,
          a11y: 'Save change',
          tone: colors.short,
        }
      : mode === 'skipped'
      ? {
          label: nextLabel ? `Go to ${nextLabel}` : 'Back to the workout',
          detail: null,
          a11y: nextLabel ? `Go to ${nextLabel}` : 'Back to the workout',
          tone: colors.plate,
        }
      : {
          label: 'Record',
          detail: actuals,
          // The label the screen has always answered to: it names the whole
          // consequence, which two lines of type cannot.
          a11y: `Record ${actuals}`,
          tone: colors.plate,
        };

  const onPrimary =
    mode === 'amending'
      ? onSaveAmendment
      : mode === 'skipped'
      ? onAdvance
      : onRecord;

  // The third cell is whatever undoing this set means right now. On a set
  // already skipped it stays in place and disabled — the body carries the
  // Undo, and a cell that vanishes takes the grid's shape with it.
  const third =
    mode === 'amending'
      ? {
          glyph: '↩',
          label: 'cancel',
          a11y: 'Cancel the amendment',
          onPress: onCancelAmendment,
          disabled: false,
        }
      : {
          glyph: '⤼',
          label: 'skip',
          a11y: 'Skip this set',
          onPress: onSkip,
          disabled: mode === 'skipped',
        };

  return (
    <View style={styles.footer}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primary.a11y}
          accessibilityState={{disabled: busy}}
          disabled={busy}
          onPress={onPrimary}
          style={[
            styles.primary,
            busy && styles.dim,
            {backgroundColor: primary.tone},
          ]}>
          <AppText variant="h3" style={{color: colors.plateInk}}>
            {primary.label}
          </AppText>
          {primary.detail ? (
            <AppText variant="h1" style={{color: colors.plateInk}}>
              {primary.detail}
            </AppText>
          ) : null}
        </Pressable>

        <View style={styles.cluster}>
          <Cell
            glyph="▲"
            label={`${done}/${total}`}
            accessibilityLabel="Show the whole session"
            onPress={onOpenSession}
          />
          <Cell
            glyph="✎"
            label="note"
            tone={hasNote ? 'short' : 'ink2'}
            fill={hasNote}
            accessibilityLabel={
              hasNote
                ? `Edit the note on ${exerciseName}`
                : `Add a note to ${exerciseName}`
            }
            onPress={onOpenNote}
          />
          <Cell
            glyph={third.glyph}
            label={third.label}
            accessibilityLabel={third.a11y}
            disabled={third.disabled || busy}
            onPress={third.onPress}
          />
          <Cell
            glyph="⋯"
            label="more"
            accessibilityLabel={`Actions for ${exerciseName}`}
            onPress={onOpenMenu}
          />
        </View>
      </View>

      {/* Where you are going, as type. It was a fourth button that had lost
          its border. Hidden while skipped, because the primary names the
          destination itself there. */}
      <AppText
        variant="printed"
        color="faint"
        numberOfLines={1}
        style={styles.caption}>
        {mode === 'skipped'
          ? ' '
          : nextLabel
          ? `then ${nextLabel}`
          : 'the last set'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {paddingHorizontal: space.lg, paddingBottom: space.md},
  row: {flexDirection: 'row', gap: space.sm, alignItems: 'stretch'},
  primary: {
    flex: 1,
    height: BLOCK_HEIGHT,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: space.sm,
  },
  cluster: {
    width: CLUSTER_WIDTH,
    height: BLOCK_HEIGHT,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  cell: {
    // Two per row inside 104dp with an 8dp gap: 48 each.
    width: 48,
    height: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: {opacity: 0.45},
  caption: {textAlign: 'center', marginTop: space.sm},
});

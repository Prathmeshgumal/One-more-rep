import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {AppText} from './Text';
import {useTheme, space, type ColorToken} from '@/theme';
import {compareSet} from '@/domain/setComparison';

/**
 * How a line reads. Not the same thing as the set's status: `live` and
 * `amending` describe where you are looking, which the database knows nothing
 * about, and `pending` has to stay distinct from `skipped` — one is undecided,
 * the other is a decision.
 */
export type SetTone =
  | 'exceeded'
  | 'achieved'
  | 'below'
  | 'bonus'
  | 'skipped'
  | 'pending'
  | 'live'
  | 'amending';

/** The height the whole redesign is built on. */
export const SET_LINE_HEIGHT = 44;

const ACCENT: Record<SetTone, ColorToken> = {
  exceeded: 'gain',
  achieved: 'gain',
  below: 'short',
  bonus: 'gain',
  skipped: 'skip',
  pending: 'ruleSoft',
  live: 'plate',
  amending: 'short',
};

/**
 * Decides how one set should read.
 *
 * `live` and `amending` win over everything, because they are about the screen
 * rather than the record. Below them, a pending set is faint and a skipped one
 * is grey — the old row let `compareSet` collapse both to "skipped", which is
 * right for arithmetic and wrong for a ledger you are reading mid-workout.
 */
export function toneForSet(args: {
  targetReps: number | null;
  targetWeight: number | null;
  actualReps: number | null;
  actualWeight: number | null;
  status: 'pending' | 'completed' | 'skipped';
  isUnplanned: boolean;
  isLive?: boolean;
  isAmending?: boolean;
}): SetTone {
  if (args.isAmending) {
    return 'amending';
  }
  if (args.isLive) {
    return 'live';
  }
  if (args.status === 'pending') {
    return 'pending';
  }
  if (args.status === 'skipped') {
    return 'skipped';
  }
  const comparison = compareSet(args);
  return comparison.status === 'unplanned' ? 'bonus' : comparison.status;
}

const formatValue = (args: {
  tone: SetTone;
  actualReps: number | null;
  actualWeight: number | null;
  unit: string;
}): {text: string; strong: boolean} => {
  switch (args.tone) {
    case 'live':
      return {text: 'now lifting', strong: true};
    case 'amending':
      return {text: 'correcting…', strong: true};
    case 'pending':
      return {text: 'not recorded', strong: false};
    case 'skipped':
      return {text: 'skipped', strong: false};
    default:
      break;
  }
  if (args.actualReps === null) {
    return {text: '—', strong: false};
  }
  // The weight is only worth a line when there was one. A bodyweight set
  // reading "12 reps · 0 kg" would be inventing a load nobody lifted.
  return {
    text:
      args.actualWeight === null || args.actualWeight === 0
        ? `${args.actualReps} reps`
        : `${args.actualReps} · ${args.actualWeight} ${args.unit}`,
    strong: true,
  };
};

/**
 * One set, on one line, in 44dp.
 *
 * This replaces a 94dp row that gave a single recorded number a header strip,
 * a 38px numeral, a unit label and a verdict chip. Four of them filled half a
 * phone with information already acted on. Here the verdict is a 2dp edge and
 * a dot, the target is ghosted alongside, and what is left is legible at a
 * glance without competing with the set you are actually doing.
 *
 * 44dp is not an aesthetic choice: it is the minimum comfortable touch target,
 * and every line here is tappable — during a workout to work on that set, and
 * after it is saved to correct one.
 */
export function SetLine({
  index,
  targetReps,
  targetWeight,
  actualReps,
  actualWeight,
  status,
  isUnplanned,
  isLive = false,
  isAmending = false,
  unit,
  onPress,
}: {
  /** 1-based, as printed. */
  index: number;
  targetReps: number | null;
  targetWeight: number | null;
  actualReps: number | null;
  actualWeight: number | null;
  status: 'pending' | 'completed' | 'skipped';
  isUnplanned: boolean;
  isLive?: boolean;
  isAmending?: boolean;
  unit: string;
  onPress?: () => void;
}) {
  const {colors} = useTheme();
  const tone = toneForSet({
    targetReps,
    targetWeight,
    actualReps,
    actualWeight,
    status,
    isUnplanned,
    isLive,
    isAmending,
  });
  const value = formatValue({tone, actualReps, actualWeight, unit});

  const valueColor: ColorToken =
    tone === 'live'
      ? 'plate'
      : tone === 'amending'
      ? 'short'
      : tone === 'pending'
      ? 'faint'
      : tone === 'skipped'
      ? 'muted'
      : 'ink';

  const background =
    tone === 'live'
      ? colors.plateSoft
      : tone === 'amending'
      ? colors.shortSoft
      : 'transparent';

  const body = (
    <View style={[styles.row, {backgroundColor: background}]}>
      {/* The status edge. A chip said the same thing in twenty times the
          space, and had to be read rather than glanced at. */}
      <View style={[styles.edge, {backgroundColor: colors[ACCENT[tone]]}]} />
      <AppText
        variant="monoSmall"
        color={tone === 'live' ? 'plate' : 'faint'}
        style={styles.index}>
        {String(index)}
      </AppText>
      <AppText
        variant={value.strong ? 'bodyStrong' : 'body'}
        color={valueColor}
        numberOfLines={1}
        style={styles.value}>
        {value.text}
      </AppText>
      {isUnplanned ? (
        <AppText variant="monoSmall" color="plate">
          bonus
        </AppText>
      ) : targetReps !== null ? (
        <AppText variant="monoSmall" color="faint">
          {String(targetReps)}
        </AppText>
      ) : null}
      <View style={[styles.dot, {backgroundColor: colors[ACCENT[tone]]}]} />
    </View>
  );

  if (!onPress) {
    return body;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Set ${index}, ${value.text}`}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: SET_LINE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.md,
    paddingRight: space.lg,
  },
  edge: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 2,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  index: {width: 14},
  value: {flex: 1},
  dot: {width: 7, height: 7, borderRadius: 4},
});

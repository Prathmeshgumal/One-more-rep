import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {AppText} from './Text';
import {useTheme, space, radius} from '@/theme';

export const EXERCISE_LINE_HEIGHT = 32;

/**
 * An exercise's name and its tally, on one line.
 *
 * The card this replaces was 65dp of padding around the same two facts, and it
 * had a 56dp "Finish this exercise" button inside it — one per exercise, on a
 * screen where vertical space was the whole problem. Those actions live in the
 * sheet behind `⋯` now.
 *
 * `done / total` counts recorded sets against planned ones, so an exercise
 * with a bonus set can read 4 / 3. That is the honest number: the plan asked
 * for three and four were done.
 */
export function ExerciseLine({
  name,
  done,
  total,
  dimmed = false,
  note,
  onPressMenu,
}: {
  name: string;
  done: number;
  total: number;
  /** Finished exercises sit back; the one you are on does not. */
  dimmed?: boolean;
  note?: string | null;
  onPressMenu?: () => void;
}) {
  const {colors} = useTheme();

  return (
    <View>
      <View style={styles.row}>
        <AppText
          variant="bodyStrong"
          color={dimmed ? 'muted' : 'ink'}
          numberOfLines={1}
          style={styles.name}>
          {name}
        </AppText>
        <AppText variant="monoSmall" color="muted">
          {`${done} / ${total}`}
        </AppText>
        {onPressMenu ? (
          <Pressable
            onPress={onPressMenu}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Actions for ${name}`}
            style={[styles.menu, {borderColor: colors.ruleSoft}]}>
            <AppText variant="bodyStrong" color="muted">
              ⋯
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {/* A note used to render below the sets, which on a full screen meant
          off it. Here it sits under the name, where it is read. */}
      {note ? (
        <AppText
          variant="small"
          color="muted"
          numberOfLines={2}
          style={styles.note}>
          {note}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: EXERCISE_LINE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    marginTop: space.xs,
  },
  name: {flex: 1},
  menu: {
    width: 28,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {paddingHorizontal: space.lg, paddingBottom: space.xs},
});

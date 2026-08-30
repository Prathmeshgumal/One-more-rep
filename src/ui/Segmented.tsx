import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useTheme, space, radius} from '@/theme';
import {AppText} from './Text';

export type SegmentedOption<T> = {
  value: T;
  /** What fits in a fifth of a row. */
  label: string;
  /**
   * The whole word, announced. "kg" is a fine thing to print and a poor
   * thing to hear, and a screen reader should get the same control everyone
   * else does.
   */
  accessibilityLabel: string;
};

/**
 * A row of mutually exclusive choices, drawn as one object.
 *
 * What this replaces was one bordered card per option — 60dp tall, with a
 * caption — which meant "0.5" cost the same vertical space as a paragraph and
 * Settings ran to 1100dp for four questions. A segmented control says the same
 * thing in 36 and, unlike a column of cards, looks like a single decision
 * rather than four unrelated ones.
 *
 * `selected` goes on `accessibilityState` and not only into the colour,
 * because a filled pill is invisible to a screen reader and to anyone who
 * cannot separate those two blues.
 */
export function Segmented<T extends string | number>({
  options,
  value,
  disabled = false,
  onChange,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T | undefined;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const {colors} = useTheme();
  return (
    <View style={[styles.track, {backgroundColor: colors.surface2}]}>
      {options.map(option => {
        const on = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="button"
            accessibilityLabel={option.accessibilityLabel}
            accessibilityState={{selected: on, disabled}}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[styles.segment, on && {backgroundColor: colors.plate}]}>
            <AppText
              variant={on ? 'bodyStrong' : 'body'}
              style={on ? {color: colors.plateInk} : undefined}
              color={on ? undefined : 'muted'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: space.xs,
    padding: space.xs,
    borderRadius: radius.pill,
  },
  segment: {
    flex: 1,
    // 36dp of pill plus 8dp of track: 44 on the row, which is the floor.
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
  },
});

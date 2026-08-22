import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {useTheme, space, radius} from '@/theme';
import {AppText} from './Text';

/**
 * A filter pill. Selection is carried by `accessibilityState` as well as by
 * colour, because the plate/surface contrast alone is not a state a screen
 * reader can report.
 */
export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{selected}}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.plate : colors.surface,
          borderColor: selected ? colors.plate : colors.rule,
        },
      ]}>
      <AppText variant="small" color={selected ? 'plateInk' : 'ink2'}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
});

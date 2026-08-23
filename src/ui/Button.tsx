import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {useTheme, space, radius, type ColorToken} from '@/theme';
import {AppText} from './Text';

type Variant = 'primary' | 'secondary' | 'ghost';

/**
 * The design's `.btn`, `.btn.sec` and `.btn.ghost`.
 *
 * Primary is a filled plate; secondary is outlined; ghost is outlined and
 * quieter, used for "Add exercise" inside a list where a filled button would
 * outshout the content it sits under.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  size = 'md',
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  size?: 'md' | 'sm';
}) {
  const {colors} = useTheme();

  const fill: Record<Variant, string> = {
    primary: colors.plate,
    secondary: colors.surface,
    ghost: 'transparent',
  };
  const border: Record<Variant, string> = {
    primary: colors.plate,
    secondary: colors.rule,
    ghost: colors.ruleSoft,
  };
  const ink: Record<Variant, ColorToken> = {
    primary: 'plateInk',
    secondary: 'ink',
    ghost: 'plate',
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        {backgroundColor: fill[variant], borderColor: border[variant]},
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <AppText variant={size === 'sm' ? 'small' : 'bodyStrong'} color={ink[variant]}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {borderWidth: 1, borderRadius: radius.md, alignItems: 'center'},
  md: {paddingVertical: space.lg, paddingHorizontal: space.xl},
  sm: {paddingVertical: space.md, paddingHorizontal: space.lg},
  pressed: {opacity: 0.75},
  disabled: {opacity: 0.4},
});

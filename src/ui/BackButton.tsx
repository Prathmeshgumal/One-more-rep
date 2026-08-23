import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useNavigation} from '@react-navigation/native';
import {useTheme, space} from '@/theme';

/**
 * The way out of a pushed screen.
 *
 * The approved design draws no back control anywhere — screen 19's app-bar
 * button is *create*, not back — so this is invented, and recorded as a design
 * departure. It is deliberately quieter than `IconButton`: no border, no
 * plate, just the chevron, because leaving a screen is not an action worth
 * advertising.
 */
export function BackButton({label = 'Back'}: {label?: string}) {
  const navigation = useNavigation();
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => navigation.goBack()}
      hitSlop={space.sm}
      style={({pressed}) => [styles.button, pressed && styles.pressed]}>
      <Svg
        width={22}
        height={22}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colors.ink2}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round">
        <Path d="M15 5l-7 7 7 7" />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 44px of target around a 22px glyph, pulled left so the glyph lines up with
  // the text below it rather than the padding around it.
  button: {
    width: 44,
    height: 44,
    marginLeft: -space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {opacity: 0.5},
});

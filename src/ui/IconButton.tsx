import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useTheme, radius} from '@/theme';

/** Copied from the design rather than redrawn — `.iconbtn svg` in screens.html. */
const GLYPHS = {
  calendar: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
} as const;

/** The design's `.iconbtn`: a 38px circle with a hairline border. */
export function IconButton({
  glyph,
  label,
  onPress,
}: {
  glyph: keyof typeof GLYPHS;
  /** Spoken name — the glyph carries no text of its own. */
  label: string;
  onPress: () => void;
}) {
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        {
          backgroundColor: pressed ? colors.surface2 : colors.surface,
          borderColor: colors.rule,
        },
      ]}>
      <Svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colors.ink2}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round">
        <Path d={GLYPHS[glyph]} />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

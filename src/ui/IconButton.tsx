import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useTheme, radius, space} from '@/theme';

/**
 * Copied from the design rather than redrawn — `.iconbtn svg` in screens.html.
 *
 * `plan` and `history` are the design's own tab glyphs, moved here unchanged
 * when those sections stopped being tabs. Same drawing, different control: the
 * thing you tap to reach the plan should not have changed its appearance just
 * because it moved from the bottom of the screen to the top.
 */
const GLYPHS = {
  calendar: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  plan: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  history: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4M12 8v4l3 2',
  dumbbell: 'M3 10v4M7 7v10M17 7v10M21 10v4M7 12h10',
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
      // The design draws 38px. The slop clears the 44px minimum without
      // making the circle bigger than the design says it is.
      hitSlop={space.xs}
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

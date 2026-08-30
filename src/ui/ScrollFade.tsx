import React from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {useTheme} from '@/theme';

export const FADE_HEIGHT = 28;

/**
 * The soft edge a scrolling list runs out under.
 *
 * Content sliding under a pinned header cut off mid-letter — a hard horizontal
 * line straight through a row of type, which reads as a rendering fault rather
 * than as an edge. A gradient to the page's own background says "there is more
 * above this" without drawing a rule to say it.
 *
 * SVG rather than a stack of Views at stepped opacities: eight hairlines
 * approximating a gradient band on an OLED panel is exactly where banding
 * shows, and `react-native-svg` is already here for the charts.
 *
 * `pointerEvents="none"` matters — this sits over the list, and a fade that
 * swallowed the top 28dp of taps would be worse than the cut it fixes.
 */
export function ScrollFade({
  height = FADE_HEIGHT,
  edge = 'top',
}: {
  height?: number;
  /** A pinned footer needs the mirror image of the same thing. */
  edge?: 'top' | 'bottom';
}) {
  const {colors} = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        styles.fade,
        {height},
        edge === 'top' ? styles.top : styles.bottom,
      ]}>
      <Svg width="100%" height={height}>
        <Defs>
          <LinearGradient id="scrollFade" x1="0" y1="0" x2="0" y2="1">
            <Stop
              offset="0"
              stopColor={colors.paper}
              stopOpacity={edge === 'top' ? 1 : 0}
            />
            <Stop
              offset="1"
              stopColor={colors.paper}
              stopOpacity={edge === 'top' ? 0 : 1}
            />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height={height} fill="url(#scrollFade)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fade: {position: 'absolute', left: 0, right: 0, zIndex: 1},
  top: {top: 0},
  bottom: {bottom: 0},
});

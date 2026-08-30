import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Animated, StyleSheet} from 'react-native';
import type {NativeScrollEvent, NativeSyntheticEvent} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {useTheme} from '@/theme';

export const FADE_HEIGHT = 28;

/** Below this the list has not really moved, and there is nothing to cover. */
const THRESHOLD = 2;

/**
 * Tracks whether a list has anything underneath its top edge.
 *
 * The fade was drawn unconditionally, which meant it also washed out the top
 * 28dp of a list sitting at rest — on the workout screen that is exactly where
 * the date line lives, so `SUNDAY, 30 AUGUST` came out half-erased on a screen
 * nobody had scrolled. A gradient is a way of saying "there is more above
 * this"; when there is not, it should not be there at all.
 */
export function useScrollFade() {
  const [faded, setFaded] = useState(false);
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setFaded(event.nativeEvent.contentOffset.y > THRESHOLD);
    },
    [],
  );
  return {
    faded,
    // Spread onto the ScrollView. 32ms is twice a frame: fast enough that the
    // fade arrives with the movement, cheap enough not to bridge every frame.
    scrollProps: {onScroll, scrollEventThrottle: 32},
  };
}

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
  visible = true,
}: {
  height?: number;
  /** A pinned footer needs the mirror image of the same thing. */
  edge?: 'top' | 'bottom';
  /** Drive this from `useScrollFade` on any list that starts at rest. */
  visible?: boolean;
}) {
  const {colors} = useTheme();
  // Crossfaded rather than mounted and unmounted: a gradient snapping into
  // existence over a line of type on the first pixel of a scroll draws more
  // attention than the cut it exists to hide.
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 140,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.fade,
        {height, opacity},
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fade: {position: 'absolute', left: 0, right: 0, zIndex: 1},
  top: {top: 0},
  bottom: {bottom: 0},
});

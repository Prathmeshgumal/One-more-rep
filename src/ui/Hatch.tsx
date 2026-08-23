import React from 'react';
import {StyleSheet} from 'react-native';
import Svg, {Defs, Line, Pattern, Rect} from 'react-native-svg';

/**
 * The diagonal hatch on a rest-day tile.
 *
 * The design expresses it as `repeating-linear-gradient`, which React Native
 * has no equivalent for — so it is drawn, using the SVG renderer already
 * bundled for the tab bar icons. Absolutely positioned to fill its parent, and
 * non-interactive so it never intercepts a tap meant for the tile.
 */
export function Hatch({color}: {color: string}) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern
          id="hatch"
          width={14}
          height={14}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)">
          <Line x1={0} y1={0} x2={0} y2={14} stroke={color} strokeWidth={7} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#hatch)" />
    </Svg>
  );
}

import React from 'react';
import Svg, {Path} from 'react-native-svg';
import type {RootTabParamList} from '@/navigation/types';

/**
 * The five tab glyphs, copied verbatim from the approved design
 * (docs/design/screens.html, the TABS array) rather than redrawn — the whole
 * point of an approved design is that it is the source, not a reference.
 *
 * Stroked paths on a 24-unit grid, rendered with `currentColor` so a single
 * tint prop drives both the glyph and its label.
 */
const PATHS: Record<keyof RootTabParamList, string> = {
  Today: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  Plan: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  History: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4M12 8v4l3 2',
  Exercises: 'M3 10v4M7 7v10M17 7v10M21 10v4M7 12h10',
  Settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M4 12h2M18 12h2M12 4v2M12 18v2',
};

/** 21px and stroke 1.7, both as specified by the design's `.tab svg` rule. */
export function TabIcon({
  name,
  color,
}: {
  name: keyof RootTabParamList;
  color: string;
}) {
  return (
    <Svg
      width={21}
      height={21}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round">
      <Path d={PATHS[name]} />
    </Svg>
  );
}

/**
 * One stable renderer per tab, built once at module scope.
 *
 * React Navigation takes `tabBarIcon` as a render prop. Writing that inline in
 * `screenOptions` hands it a new component type on every render, which throws
 * away the subtree each time — so the renderers live here instead.
 */
export const TAB_ICON: Record<
  keyof RootTabParamList,
  (props: {color: string}) => React.ReactElement
> = {
  Today: ({color}) => <TabIcon name="Today" color={color} />,
  Plan: ({color}) => <TabIcon name="Plan" color={color} />,
  History: ({color}) => <TabIcon name="History" color={color} />,
  Exercises: ({color}) => <TabIcon name="Exercises" color={color} />,
  Settings: ({color}) => <TabIcon name="Settings" color={color} />,
};

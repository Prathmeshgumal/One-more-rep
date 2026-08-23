import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme, radius} from '@/theme';

/**
 * The design's `.progress`: a 5px rule that fills as the workout does.
 *
 * `gain` is for a finished workout; `plate` for one in progress.
 */
export function ProgressBar({
  value,
  total,
  variant = 'plate',
  label,
}: {
  value: number;
  total: number;
  variant?: 'plate' | 'gain';
  label?: string;
}) {
  const {colors} = useTheme();

  // A session with nothing planned would divide by zero and render NaN, which
  // React Native treats as a fatal style value rather than an empty bar.
  const percent =
    total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;

  return (
    <View
      // Without `accessible`, React Native does not treat this View as an
      // accessibility element, so the role is set but nothing can find it —
      // neither a screen reader nor getByRole.
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{min: 0, max: total, now: value}}
      style={[styles.track, {backgroundColor: colors.ruleSoft}]}>
      <View
        style={[
          styles.fill,
          {width: `${percent}%`, backgroundColor: colors[variant]},
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {height: 5, borderRadius: radius.pill, overflow: 'hidden'},
  fill: {height: '100%', borderRadius: radius.pill},
});

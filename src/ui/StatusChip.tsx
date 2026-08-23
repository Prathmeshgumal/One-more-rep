import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme, space, radius, type ColorToken} from '@/theme';
import {AppText} from './Text';
import type {ComparisonStatus} from '@/domain/setComparison';

/**
 * The design's `.chip` in its five states.
 *
 * Below target is ochre and never red: falling short of a target is
 * information, not an error, and the palette says so.
 */
const TONE: Record<ComparisonStatus, {fill: ColorToken; ink: ColorToken}> = {
  achieved: {fill: 'plateSoft', ink: 'plate'},
  exceeded: {fill: 'gainSoft', ink: 'gain'},
  below: {fill: 'shortSoft', ink: 'short'},
  skipped: {fill: 'skipSoft', ink: 'skip'},
  unplanned: {fill: 'surface2', ink: 'muted'},
};

const DEFAULT_LABEL: Record<ComparisonStatus, string> = {
  achieved: 'Achieved',
  exceeded: 'Exceeded',
  below: 'Below',
  skipped: 'Skipped',
  unplanned: 'Bonus',
};

export function StatusChip({
  status,
  label,
}: {
  status: ComparisonStatus;
  label?: string;
}) {
  const {colors} = useTheme();
  const tone = TONE[status];
  return (
    <View style={[styles.chip, {backgroundColor: colors[tone.fill]}]}>
      <AppText variant="monoSmall" color={tone.ink}>
        {label ?? DEFAULT_LABEL[status]}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
});

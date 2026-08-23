import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme, space, radius} from '@/theme';
import {AppText} from './Text';

export type Stat = {label: string; value: string};

/** The design's `.statgrid`: equal columns of a printed label over a big figure. */
export function StatGrid({stats}: {stats: readonly Stat[]}) {
  const {colors} = useTheme();
  return (
    <View style={styles.grid}>
      {stats.map(stat => (
        <View
          key={stat.label}
          style={[
            styles.stat,
            {backgroundColor: colors.surface, borderColor: colors.ruleSoft},
          ]}>
          <AppText variant="printed" color="muted">
            {stat.label}
          </AppText>
          <AppText variant="inkNum">{stat.value}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {flexDirection: 'row', gap: space.sm},
  stat: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.xs,
  },
});

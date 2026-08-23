import React from 'react';
import {StyleSheet, View} from 'react-native';
import {space, type ColorToken} from '@/theme';
import {AppText} from './Text';

/** The largest number in the app, and it is used exactly twice. */
export function BigNumber({
  value,
  suffix,
  color = 'ink',
}: {
  value: string;
  suffix?: string;
  color?: ColorToken;
}) {
  return (
    <View style={styles.row}>
      <AppText variant="bignum" color={color}>
        {value}
      </AppText>
      {suffix ? (
        <AppText variant="printed" color="muted">
          {suffix}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'baseline', gap: space.sm},
});

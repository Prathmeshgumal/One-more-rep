import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme, space, type ColorToken} from '@/theme';
import {AppText} from './Text';
import type {ComparisonStatus} from '@/domain/setComparison';

const RESULT_INK: Record<ComparisonStatus, ColorToken> = {
  achieved: 'plate',
  exceeded: 'gain',
  below: 'short',
  skipped: 'skip',
  unplanned: 'muted',
};

export type LedgerRow = {
  setNumber: number;
  target: string;
  actual: string;
  result: string;
  status: ComparisonStatus;
};

/**
 * The §16 set-by-set table: target in faint type, actual written over it, the
 * verdict on the right. Monospaced and tabular so the columns line up as a
 * ledger rather than drifting per row.
 */
export function LedgerTable({rows}: {rows: readonly LedgerRow[]}) {
  const {colors} = useTheme();
  return (
    <View>
      <View style={[styles.head, {borderBottomColor: colors.rule}]}>
        <AppText variant="printed" color="muted" style={styles.setCol}>
          Set
        </AppText>
        <AppText variant="printed" color="muted" style={styles.grow}>
          Target
        </AppText>
        <AppText variant="printed" color="muted" style={styles.grow}>
          Actual
        </AppText>
        <AppText variant="printed" color="muted" style={styles.resultCol}>
          Result
        </AppText>
      </View>
      {rows.map(row => (
        <View
          key={row.setNumber}
          style={[styles.row, {borderBottomColor: colors.ruleSoft}]}>
          <AppText variant="mono" color="muted" style={styles.setCol}>
            {String(row.setNumber)}
          </AppText>
          <AppText variant="mono" color="faint" style={styles.grow}>
            {row.target}
          </AppText>
          <AppText variant="mono" style={styles.grow}>
            {row.actual}
          </AppText>
          <AppText
            variant="mono"
            color={RESULT_INK[row.status]}
            style={styles.resultCol}>
            {row.result}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {flexDirection: 'row', paddingBottom: space.sm, borderBottomWidth: 1},
  row: {flexDirection: 'row', paddingVertical: space.sm, borderBottomWidth: 1},
  setCol: {width: 32},
  grow: {flex: 1},
  resultCol: {width: 86, textAlign: 'right'},
});

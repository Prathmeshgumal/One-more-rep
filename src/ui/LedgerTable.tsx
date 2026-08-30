import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
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
export function LedgerTable({
  rows,
  caption,
  onSelectRow,
}: {
  rows: readonly LedgerRow[];
  /**
   * What these rows belong to, for the screen reader. A page carrying one
   * table per exercise otherwise announces several identical "Correct set 1"
   * buttons and gives no way to tell them apart.
   */
  caption?: string;
  /**
   * Makes each row correctable. A mistake in a workout is usually noticed
   * days later, looking back — nobody spots a typo with their heart rate at
   * 150 — so this table is the place the correction is most often wanted.
   */
  onSelectRow?: (setNumber: number) => void;
}) {
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
      {rows.map(row => {
        const Row = onSelectRow ? Pressable : View;
        return (
          <Row
            key={row.setNumber}
            {...(onSelectRow
              ? {
                  onPress: () => onSelectRow(row.setNumber),
                  accessibilityRole: 'button' as const,
                  accessibilityLabel: caption
                    ? `Correct set ${row.setNumber} of ${caption}`
                    : `Correct set ${row.setNumber}`,
                }
              : {})}
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
          </Row>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {flexDirection: 'row', paddingBottom: space.sm, borderBottomWidth: 1},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    // A row that can be pressed has to be reachable by a thumb.
    minHeight: 44,
  },
  setCol: {width: 32},
  grow: {flex: 1},
  resultCol: {width: 86, textAlign: 'right'},
});

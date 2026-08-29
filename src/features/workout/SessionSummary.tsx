import React from 'react';
import {StyleSheet, View} from 'react-native';
import {AppText} from '@/ui/Text';
import {Card} from '@/ui/Card';
import {BigNumber} from '@/ui/BigNumber';
import {StatusChip} from '@/ui/StatusChip';
import {ProgressBar} from '@/ui/ProgressBar';
import {useTheme, space} from '@/theme';
import {
  completionPercent,
  countByStatus,
  sessionVolume,
} from '@/domain/sessionProgress';
import type {Session} from '@/repositories/sessionRepo';

/**
 * How a session went, in one block.
 *
 * Lifted out of `WorkoutCompleteScreen` unchanged so Today can show the same
 * thing without a button press (complaint 10). It renders from a `Session`
 * alone — no queries, no navigation — which is what lets two screens draw it
 * without either owning it.
 *
 * The saving stayed behind on the finish screen. That is the one part there
 * must never be two of.
 */
export function SessionSummary({
  session,
  unit,
}: {
  session: Session;
  unit: string;
}) {
  const {colors} = useTheme();

  const allSets = session.exercises.flatMap(e => e.sets);
  const plannedSets = allSets.filter(s => !s.isUnplanned);
  const doneSets = allSets.filter(s => s.status === 'completed');

  const percent = completionPercent(allSets);
  const counts = countByStatus(allSets);
  const volume = sessionVolume(session.exercises);
  const doneExercises = session.exercises.filter(
    e => e.status === 'completed',
  ).length;

  return (
    <>
      {percent === null ? (
        <AppText variant="body" color="muted">
          Nothing was planned for this session, so there is no percentage to
          report — just what you actually did.
        </AppText>
      ) : (
        <>
          <BigNumber value={String(percent)} suffix="% of plan" />
          <ProgressBar
            value={doneSets.filter(s => !s.isUnplanned).length}
            total={plannedSets.length}
            variant="gain"
            label="Completion"
          />
        </>
      )}

      <View style={styles.stats}>
        <Card>
          <AppText variant="eyebrow" color="muted">
            Exercises
          </AppText>
          <AppText variant="inkNum">
            {`${doneExercises} / ${session.exercises.length}`}
          </AppText>
        </Card>
        <Card>
          <AppText variant="eyebrow" color="muted">
            Sets
          </AppText>
          <AppText variant="inkNum">
            {`${doneSets.filter(s => !s.isUnplanned).length} / ${
              plannedSets.length
            }`}
          </AppText>
        </Card>
      </View>

      <Card>
        <AppText variant="eyebrow" color="muted">
          Against target
        </AppText>
        {(
          [
            ['achieved', counts.achieved],
            ['exceeded', counts.exceeded],
            ['below', counts.below],
            ['skipped', counts.skipped],
          ] as const
        ).map(([status, count]) => (
          <View key={status} style={styles.row}>
            <StatusChip status={status} />
            <AppText variant="inkNum">{String(count)}</AppText>
          </View>
        ))}
        <View style={[styles.divider, {backgroundColor: colors.ruleSoft}]} />
        <View style={styles.row}>
          <AppText variant="printed" color="muted">
            total volume
          </AppText>
          <AppText variant="inkNum">{`${volume} ${unit}`}</AppText>
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  stats: {flexDirection: 'row', gap: space.sm},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  divider: {height: 1, marginVertical: space.md},
});

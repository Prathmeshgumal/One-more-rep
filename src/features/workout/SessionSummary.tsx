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
 * How much of the day got done: exercises, and sets.
 *
 * This is all Today shows. Standing there having finished, the useful question
 * is "did I do the work", and two counts answer it — a percentage, four
 * verdict chips and a volume total are a report, and a report is something you
 * go and look at rather than something that should meet you on the way past.
 *
 * The full report still exists on the finish screen, which is where you have
 * just stopped and are actually reviewing.
 *
 * Bonus sets are excluded from both numerators and denominators, so the ratio
 * stays "of what was planned" rather than moving because extra work was done.
 */
export function SessionCounts({session}: {session: Session}) {
  const allSets = session.exercises.flatMap(e => e.sets);
  const plannedSets = allSets.filter(s => !s.isUnplanned);
  const donePlanned = allSets.filter(
    s => s.status === 'completed' && !s.isUnplanned,
  );
  const doneExercises = session.exercises.filter(
    e => e.status === 'completed',
  ).length;

  return (
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
          {`${donePlanned.length} / ${plannedSets.length}`}
        </AppText>
      </Card>
    </View>
  );
}

/**
 * The full report: how far through the plan, and how every set went.
 *
 * The finish screen only. Today used to draw this too and it was too much for
 * a screen you walk past — see `SessionCounts` above.
 *
 * It renders from a `Session` alone — no queries, no navigation. The saving
 * stayed behind on the finish screen itself; that is the one part there must
 * never be two of.
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

      <SessionCounts session={session} />

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

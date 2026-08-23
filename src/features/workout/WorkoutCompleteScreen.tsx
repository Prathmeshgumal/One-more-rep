import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
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
import {useSettingsQuery} from '@/features/settings/useSettings';
import {useTodaySessionQuery, useFinishWorkout} from './useSession';

const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

/** Design 11: §19's summary, and the only place a workout is saved. */
export function WorkoutCompleteScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const {data: session} = useTodaySessionQuery();
  const {data: settings} = useSettingsQuery();
  const finish = useFinishWorkout();

  if (!session) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  const unit = settings?.unit ?? 'kg';
  const allSets = session.exercises.flatMap(e => e.sets);
  const plannedSets = allSets.filter(s => !s.isUnplanned);
  const doneSets = allSets.filter(s => s.status === 'completed');
  const pendingSets = allSets.filter(s => s.status === 'pending');

  const percent = completionPercent(allSets);
  const counts = countByStatus(allSets);
  const volume = sessionVolume(session.exercises);
  const doneExercises = session.exercises.filter(
    e => e.status === 'completed',
  ).length;

  const isOpen = session.status === 'in_progress';

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.xl},
      ]}>
      <View style={styles.headerBlock}>
        <AppText variant="eyebrow" color="muted">
          {longDate(session.date)}
        </AppText>
        <AppText variant="h1">{`${session.dayName} done`}</AppText>
      </View>

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

      {isOpen && pendingSets.length > 0 ? (
        <AppText variant="small" color="short">
          {`${pendingSets.length} ${
            pendingSets.length === 1 ? 'set' : 'sets'
          } not recorded. Saving marks them skipped.`}
        </AppText>
      ) : null}

      <Button
        label={isOpen ? 'Save workout' : 'Done'}
        disabled={finish.isPending}
        onPress={() => {
          if (!isOpen) {
            navigation.popToTop();
            return;
          }
          finish.mutate(session.id, {onSuccess: () => navigation.popToTop()});
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.md,
  },
  headerBlock: {gap: 2},
  stats: {flexDirection: 'row', gap: space.sm},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  divider: {height: 1, marginVertical: space.md},
});

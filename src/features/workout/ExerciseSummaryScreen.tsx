import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {Card} from '@/ui/Card';
import {StatusChip} from '@/ui/StatusChip';
import {ProgressBar} from '@/ui/ProgressBar';
import {LedgerTable, type LedgerRow} from '@/ui/LedgerTable';
import {BackButton} from '@/ui/BackButton';
import {useTheme, space} from '@/theme';
import {compareSet, describeComparison} from '@/domain/setComparison';
import {aggregateExercise} from '@/domain/sessionProgress';
import {useSettingsQuery} from '@/features/settings/useSettings';
import {useTodaySessionQuery} from './useSession';

const pair = (reps: number | null, weight: number | null): string => {
  if (reps === null) {
    return '—';
  }
  return weight === null ? `${reps}` : `${reps} × ${weight.toFixed(1)}`;
};

/** Design 10: the §16 table for one exercise, plus its §26 volume. */
export function ExerciseSummaryScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {exerciseIndex} = useRoute().params as {exerciseIndex: number};

  const {data: session} = useTodaySessionQuery();
  const {data: settings} = useSettingsQuery();

  const exercise = session?.exercises[exerciseIndex];
  if (!session || !exercise) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  const unit = settings?.unit ?? 'kg';
  const aggregate = aggregateExercise(exercise.sets, exercise.weightApplicable);
  const next = session.exercises[exerciseIndex + 1];

  const rows: LedgerRow[] = exercise.sets.map(set => {
    const comparison = compareSet(set);
    return {
      setNumber: set.setNumber,
      target: set.isUnplanned ? 'bonus' : pair(set.targetReps, set.targetWeight),
      actual: pair(set.actualReps, set.actualWeight),
      result:
        comparison.status === 'skipped'
          ? 'Skipped'
          : describeComparison(comparison, unit),
      status: comparison.status,
    };
  });

  const volumeGap =
    aggregate.actualVolume !== null && aggregate.targetVolume !== null
      ? aggregate.actualVolume - aggregate.targetVolume
      : null;

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.lg},
      ]}>
      <BackButton />
      <ProgressBar
        value={exerciseIndex + 1}
        total={session.exercises.length}
        label="Workout progress"
      />

      <StatusChip status={aggregate.status} label="Exercise complete" />
      <AppText variant="h1">{exercise.name}</AppText>
      <AppText variant="printed" color="muted">
        {`${aggregate.completedSets} of ${aggregate.plannedSets} sets recorded`}
      </AppText>

      <LedgerTable rows={rows} />

      {aggregate.actualVolume !== null ? (
        <View style={styles.stats}>
          <Card>
            <AppText variant="eyebrow" color="muted">
              Volume
            </AppText>
            <AppText variant="inkNum">
              {`${aggregate.actualVolume} ${unit}`}
            </AppText>
          </Card>
          <Card>
            <AppText variant="eyebrow" color="muted">
              vs target
            </AppText>
            {/* Ochre when short, never red. */}
            <AppText
              variant="inkNum"
              color={
                volumeGap === null || volumeGap === 0
                  ? 'ink'
                  : volumeGap > 0
                    ? 'gain'
                    : 'short'
              }>
              {volumeGap === null
                ? '—'
                : `${volumeGap > 0 ? '+' : volumeGap < 0 ? '−' : ''}${Math.abs(
                    volumeGap,
                  )}`}
            </AppText>
          </Card>
        </View>
      ) : null}

      <Button
        label={next ? `Next — ${next.name}` : 'Back to the workout'}
        onPress={() => navigation.goBack()}
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
  stats: {flexDirection: 'row', gap: space.sm},
});

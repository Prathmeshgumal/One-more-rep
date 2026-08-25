import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '@/ui/Screen';
import {Card} from '@/ui/Card';
import {AppText} from '@/ui/Text';
import {LedgerTable, type LedgerRow} from '@/ui/LedgerTable';
import {space} from '@/theme';
import {compareSet, describeComparison} from '@/domain/setComparison';
import {sessionVolume} from '@/domain/sessionProgress';
import {formatLongDate} from '@/domain/dateLabels';
import {formatDuration, groupDigits} from '@/domain/format';
import type {ResolvedDay} from '@/domain/dayResolver';
import type {Session} from '@/repositories/sessionRepo';
import {useSettingsQuery} from '@/features/settings/useSettings';
import type {HistoryStackParamList} from '@/navigation/types';
import {useDayQuery, useDaySessionQuery} from './useHistory';

/** "10 × 30.0", or an em dash where nothing was recorded (design 14). */
const pair = (reps: number | null, weight: number | null): string => {
  if (reps === null) {
    return '—';
  }
  return weight === null ? `${reps}` : `${reps} × ${weight.toFixed(1)}`;
};

/** The one line under the heading: how long it took, and how much moved. */
function subtitleFor(session: Session, unit: string): string {
  const parts: string[] = [];
  if (session.completedAt !== null) {
    parts.push(formatDuration(session.completedAt - session.startedAt));
  }
  const volume = sessionVolume(session.exercises);
  if (volume > 0) {
    parts.push(`${groupDigits(volume)} ${unit} total volume`);
  }
  return parts.join(' · ');
}

/** What a day with no session has to say for itself. */
function emptyMessageFor(day: ResolvedDay | undefined): string {
  switch (day?.status) {
    case 'rest':
      return 'A rest day. Nothing was scheduled, and nothing is missing.';
    case 'missed':
      return `${day.name ?? 'A workout'} was planned. Nothing was recorded.`;
    case 'upcoming':
      return `${day.name ?? 'A workout'} is still ahead.`;
    default:
      return 'No plan covered this day.';
  }
}

/** Design 14: the §16 set-by-set table for a day that has already happened. */
export function DayDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<HistoryStackParamList>>();
  const {date} = useRoute().params as {date: number};

  const {data: day} = useDayQuery(date);
  const {data: session, isPending} = useDaySessionQuery(date);
  const {data: settings} = useSettingsQuery();
  const unit = settings?.unit ?? 'kg';

  // A rest day names itself, rather than showing the bare weekday the plan
  // stores when the day was never given a custom name.
  const title =
    session?.dayName ??
    (day?.status === 'rest' ? 'Rest day' : day?.name) ??
    'No plan';

  if (!session) {
    return (
      <Screen back eyebrow={formatLongDate(date)} title={title}>
        {isPending ? null : (
          <Card>
            <AppText color="muted">{emptyMessageFor(day)}</AppText>
          </Card>
        )}
      </Screen>
    );
  }

  return (
    <Screen back eyebrow={formatLongDate(date)} title={title}>
      <AppText variant="printed" color="muted">
        {subtitleFor(session, unit)}
      </AppText>

      {session.exercises.map(exercise => {
        const rows: LedgerRow[] = exercise.sets.map(set => {
          const comparison = compareSet(set);
          return {
            setNumber: set.setNumber,
            // An unplanned set had no target, so there is nothing to print in
            // the target column — it is labelled, not scored.
            target: set.isUnplanned
              ? '—'
              : pair(set.targetReps, set.targetWeight),
            actual: pair(set.actualReps, set.actualWeight),
            result:
              comparison.status === 'skipped'
                ? 'Skipped'
                : describeComparison(comparison, unit),
            status: comparison.status,
          };
        });

        return (
          <View key={exercise.id} style={styles.block}>
            <View style={styles.label}>
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Opens this exercise's history"
                onPress={() =>
                  navigation.navigate('ExerciseHistory', {
                    exerciseId: exercise.exerciseId,
                  })
                }>
                <AppText variant="printed" color="muted">
                  {exercise.name}
                </AppText>
              </Pressable>
              {exercise.plannedExerciseId === null ? (
                <AppText variant="printed" color="plate">
                  · added on the day
                </AppText>
              ) : null}
              {exercise.substitutedFromName ? (
                // U6: the slot was served by a different movement, and saying
                // so is the whole reason the column exists. Without this line
                // history quietly reports the planned exercise as performed.
                <AppText variant="printed" color="plate">
                  {`· swapped from ${exercise.substitutedFromName}`}
                </AppText>
              ) : null}
            </View>
            <LedgerTable rows={rows} />
            {exercise.notes ? (
              <AppText
                testID="exercise-note"
                variant="printed"
                color="muted">
                {exercise.notes}
              </AppText>
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: {gap: space.sm},
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    flexWrap: 'wrap',
  },
});

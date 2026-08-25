import React, {useCallback, useRef, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Button} from '@/ui/Button';
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
import {DayImageCard, IMAGE_WIDTH} from './DayImageCard';
import {useSaveDayImage} from './useSaveDayImage';

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

  const shot = useRef<React.ComponentRef<typeof View>>(null);
  const image = useSaveDayImage();

  /**
   * The card is mounted only while a save is in flight.
   *
   * Keeping it mounted always would lay out a 1080px-wide copy of the day
   * behind every visit to this screen, and would put a second copy of every
   * exercise name into the tree — which is a real cost and, incidentally, what
   * made half the tests here start matching two elements.
   *
   * `onLayout` is the signal that it has been measured and is safe to
   * rasterise; the ref guard is because layout can fire more than once.
   */
  const [capturing, setCapturing] = useState(false);
  const captured = useRef(false);

  const startCapture = () => {
    captured.current = false;
    setCapturing(true);
  };

  const onCardLaidOut = useCallback(async () => {
    if (captured.current) {
      return;
    }
    captured.current = true;
    await image.save(shot);
    setCapturing(false);
  }, [image]);

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

      <Button
        label={capturing ? 'Saving…' : 'Save image'}
        variant="secondary"
        disabled={capturing}
        onPress={startCapture}
      />
      {image.message ? (
        <AppText
          variant="small"
          color={image.status === 'failed' ? 'short' : 'muted'}>
          {image.message}
        </AppText>
      ) : null}

      {/* Laid out for real so the capture has something measured to work from,
          and parked off-screen so nobody ever sees it. */}
      {capturing ? (
        <View style={styles.offscreen} pointerEvents="none">
          <View
            testID="day-image"
            ref={shot}
            collapsable={false}
            onLayout={onCardLaidOut}>
            <DayImageCard session={session} unit={unit} />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: {gap: space.sm},
  offscreen: {position: 'absolute', left: -IMAGE_WIDTH * 2, top: 0},
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    flexWrap: 'wrap',
  },
});

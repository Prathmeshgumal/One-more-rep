import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '@/ui/Screen';
import {Card} from '@/ui/Card';
import {Button} from '@/ui/Button';
import {IconButton} from '@/ui/IconButton';
import {ProgressBar} from '@/ui/ProgressBar';
import {AppText} from '@/ui/Text';
import {space} from '@/theme';
import {summarizeAdherence} from '@/domain/adherence';
import type {ResolvedDay} from '@/domain/dayResolver';
import {addLocalDays, startOfLocalDay, startOfLocalWeek} from '@/domain/weekday';
import type {HistoryStackParamList} from '@/navigation/types';
import {DayCard} from './DayCard';
import {useDayRangeQuery} from './useHistory';

/** A fortnight at a time — far enough back to see a pattern, short enough to scan. */
const WINDOW = 14;

/**
 * §22: a day timeline, not a session list.
 *
 * Days with no plan are dropped, and so are days still ahead: history is what
 * happened, and a Thursday you have not reached yet is neither.
 */
function timelineOf(days: readonly ResolvedDay[]): ResolvedDay[] {
  return days
    .filter(day => day.status !== 'no_plan' && day.status !== 'upcoming')
    .slice()
    .reverse();
}

export function HistoryTimelineScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<HistoryStackParamList>>();
  const [window, setWindow] = useState(WINDOW);

  const today = startOfLocalDay(Date.now());
  const from = addLocalDays(today, -(window - 1));
  const {data, isPending} = useDayRangeQuery({from, to: today});

  const days = data ?? [];
  const weekStart = startOfLocalWeek(today);
  const adherence = summarizeAdherence(days.filter(d => d.date >= weekStart));
  const timeline = timelineOf(days);

  return (
    <Screen
      eyebrow="This week"
      title="History"
      action={
        <IconButton
          glyph="calendar"
          label="Open the calendar"
          onPress={() => navigation.navigate('HistoryCalendar')}
        />
      }>
      <Card>
        <View style={styles.row}>
          <AppText variant="printed" color="muted">
            Adherence
          </AppText>
          <AppText variant="inkNum">
            {adherence.percent === null ? '—' : `${adherence.percent}%`}
          </AppText>
        </View>
        <ProgressBar
          value={adherence.completedWorkouts}
          total={adherence.plannedWorkouts}
          variant="gain"
          label="Workouts completed this week"
        />
        <View style={styles.row}>
          <AppText variant="printed" color="muted">
            {`${adherence.completedWorkouts} of ${adherence.plannedWorkouts} workouts`}
          </AppText>
          <AppText variant="printed" color="muted">
            {`${adherence.completedSets} of ${adherence.plannedSets} sets`}
          </AppText>
        </View>
      </Card>

      {isPending ? null : timeline.length === 0 ? (
        <AppText color="muted">
          Nothing here yet — past workouts appear once you finish one.
        </AppText>
      ) : (
        <View>
          {timeline.map(day => (
            <DayCard
              key={day.date}
              day={day}
              onPress={
                day.sessionId
                  ? () => navigation.navigate('DayDetail', {date: day.date})
                  : undefined
              }
            />
          ))}
        </View>
      )}

      {timeline.length > 0 ? (
        <Button
          variant="ghost"
          label="Show earlier"
          onPress={() => setWindow(current => current + WINDOW)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
});

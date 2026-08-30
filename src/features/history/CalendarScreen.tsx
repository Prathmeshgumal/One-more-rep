import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '@/ui/Screen';
import {Card} from '@/ui/Card';
import {IconButton} from '@/ui/IconButton';
import {ProgressBar} from '@/ui/ProgressBar';
import {StatGrid} from '@/ui/StatGrid';
import {AppText} from '@/ui/Text';
import {space} from '@/theme';
import {buildCalendarCells} from '@/domain/calendarGrid';
import {summarizeAdherence} from '@/domain/adherence';
import {formatMonthTitle, formatYear} from '@/domain/dateLabels';
import type {ResolvedDay} from '@/domain/dayResolver';
import {
  addLocalDays,
  endOfLocalMonth,
  startOfLocalDay,
  startOfLocalMonth,
} from '@/domain/weekday';
import type {HistoryStackParamList} from '@/navigation/types';
import {CalendarGrid} from './CalendarGrid';
import {DayCard} from './DayCard';
import {useDayRangeQuery} from './useHistory';

/**
 * §22: a day list, not a session list.
 *
 * Days with no plan are dropped, and so are days still ahead: history is what
 * happened, and a Thursday you have not reached yet is neither. Newest first,
 * because the thing you just did is the thing you want to see.
 */
function daysToList(days: readonly ResolvedDay[]): ResolvedDay[] {
  return days
    .filter(day => day.status !== 'no_plan' && day.status !== 'upcoming')
    .slice()
    .reverse();
}

/**
 * History: a month at a glance, then that month day by day (§23).
 *
 * This was two screens — a rolling-fortnight timeline and a calendar — showing
 * the same days twice over. They are one now, and the month is the unit
 * throughout: the grid, the totals and the list below it all describe the
 * month in the heading, and the chevrons that page it replace the timeline's
 * "Show earlier". A list that disagreed with the grid above it would be the
 * worst of both.
 */
export function CalendarScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<HistoryStackParamList>>();
  const today = startOfLocalDay(Date.now());
  const [month, setMonth] = useState(() => startOfLocalMonth(today));

  const {data, isPending} = useDayRangeQuery({
    from: month,
    to: endOfLocalMonth(month),
  });
  const days = data ?? [];
  const cells = buildCalendarCells(days, today);
  const adherence = summarizeAdherence(days);
  const listed = daysToList(days);

  const step = (direction: -1 | 1) =>
    setMonth(current =>
      direction === -1
        ? startOfLocalMonth(addLocalDays(current, -1))
        : startOfLocalMonth(addLocalDays(endOfLocalMonth(current), 1)),
    );

  return (
    <Screen
      back
      eyebrow={formatYear(month)}
      title={formatMonthTitle(month)}
      action={
        <View style={styles.nav}>
          <IconButton
            glyph="chevronLeft"
            label="Previous month"
            onPress={() => step(-1)}
          />
          <IconButton
            glyph="chevronRight"
            label="Next month"
            onPress={() => step(1)}
          />
        </View>
      }>
      <CalendarGrid
        cells={cells}
        onSelect={date => navigation.navigate('DayDetail', {date})}
      />

      <StatGrid
        stats={[
          {
            label: 'Workouts',
            value: `${adherence.completedWorkouts} / ${adherence.plannedWorkouts}`,
          },
          {
            // Against what was planned, not a bare count: two sets out of two
            // and two out of twelve are not the same month.
            label: 'Sets',
            value: `${adherence.completedSets} / ${adherence.plannedSets}`,
          },
        ]}
      />

      {/* The percentage and the bar the timeline carried. Its "1 of 1
          workouts / 2 of 12 sets" row is not repeated here — the grid above
          says exactly that, and saying it twice in adjacent cards is how a
          screen stops being read. */}
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
          label="Workouts completed this month"
        />
      </Card>

      {isPending ? null : listed.length === 0 ? (
        <AppText color="muted">
          Your completed workouts will appear here.
        </AppText>
      ) : (
        <View>
          {listed.map(day => (
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: {flexDirection: 'row', gap: space.sm},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
});

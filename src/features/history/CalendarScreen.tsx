import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '@/ui/Screen';
import {IconButton} from '@/ui/IconButton';
import {StatGrid} from '@/ui/StatGrid';
import {space} from '@/theme';
import {buildCalendarCells} from '@/domain/calendarGrid';
import {summarizeAdherence} from '@/domain/adherence';
import {formatMonthTitle, formatYear} from '@/domain/dateLabels';
import {
  addLocalDays,
  endOfLocalMonth,
  startOfLocalDay,
  startOfLocalMonth,
} from '@/domain/weekday';
import type {HistoryStackParamList} from '@/navigation/types';
import {CalendarGrid} from './CalendarGrid';
import {useDayRangeQuery} from './useHistory';

/** Design 13: a month of adherence at a glance (§23). */
export function CalendarScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<HistoryStackParamList>>();
  const today = startOfLocalDay(Date.now());
  const [month, setMonth] = useState(() => startOfLocalMonth(today));

  const {data} = useDayRangeQuery({from: month, to: endOfLocalMonth(month)});
  const days = data ?? [];
  const cells = buildCalendarCells(days, today);
  const adherence = summarizeAdherence(days);

  const step = (direction: -1 | 1) =>
    setMonth(current =>
      direction === -1
        ? startOfLocalMonth(addLocalDays(current, -1))
        : startOfLocalMonth(addLocalDays(endOfLocalMonth(current), 1)),
    );

  return (
    <Screen
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
          {label: 'Sets', value: String(adherence.completedSets)},
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: {flexDirection: 'row', gap: space.sm},
});

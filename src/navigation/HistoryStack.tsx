import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {HistoryTimelineScreen} from '@/features/history/HistoryTimelineScreen';
import {CalendarScreen} from '@/features/history/CalendarScreen';
import {DayDetailScreen} from '@/features/history/DayDetailScreen';
import {ExerciseHistoryScreen} from '@/features/history/ExerciseHistoryScreen';
import type {HistoryStackParamList} from './types';

const Stack = createNativeStackNavigator<HistoryStackParamList>();

/** The History tab: the timeline, the calendar, and what each leads into. */
export function HistoryStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="HistoryTimeline" component={HistoryTimelineScreen} />
      <Stack.Screen name="HistoryCalendar" component={CalendarScreen} />
      <Stack.Screen name="DayDetail" component={DayDetailScreen} />
      <Stack.Screen name="ExerciseHistory" component={ExerciseHistoryScreen} />
    </Stack.Navigator>
  );
}

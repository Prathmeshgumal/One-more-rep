import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {TodayScreen} from '@/features/workout/TodayScreen';
import {WorkoutScreen} from '@/features/workout/WorkoutScreen';
import {ExerciseSummaryScreen} from '@/features/workout/ExerciseSummaryScreen';
import {WorkoutCompleteScreen} from '@/features/workout/WorkoutCompleteScreen';
import {WorkoutExercisePickerScreen} from '@/features/workout/WorkoutExercisePickerScreen';
import {ExerciseEditorScreen} from '@/features/exercises/ExerciseEditorScreen';
import {PlanWeekScreen} from '@/features/plan/PlanWeekScreen';
import {PlanDayScreen} from '@/features/plan/PlanDayScreen';
import {ExercisePickerScreen} from '@/features/plan/ExercisePickerScreen';
import {TargetEditorScreen} from '@/features/plan/TargetEditorScreen';
import {CopyDayScreen} from '@/features/plan/CopyDayScreen';
import {PlanHistoryScreen} from '@/features/plan/PlanHistoryScreen';
import {HistoryTimelineScreen} from '@/features/history/HistoryTimelineScreen';
import {CalendarScreen} from '@/features/history/CalendarScreen';
import {DayDetailScreen} from '@/features/history/DayDetailScreen';
import {ExerciseHistoryScreen} from '@/features/history/ExerciseHistoryScreen';
import type {TodayStackParamList} from './types';

const Stack = createNativeStackNavigator<TodayStackParamList>();

/**
 * The Today tab, which is now most of the app.
 *
 * The plan and history screens were tabs of their own until they became
 * buttons on Today's header. Folding them in rather than nesting two more
 * navigators is what makes back mean "return to Today" from anywhere in
 * either, and lets a day of history open from the plan without crossing a
 * navigator boundary.
 */
export function TodayStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="TodayHome" component={TodayScreen} />
      <Stack.Screen name="Workout" component={WorkoutScreen} />
      <Stack.Screen name="ExerciseSummary" component={ExerciseSummaryScreen} />
      <Stack.Screen name="WorkoutComplete" component={WorkoutCompleteScreen} />
      <Stack.Screen
        name="WorkoutExercisePicker"
        component={WorkoutExercisePickerScreen}
      />
      <Stack.Screen name="ExerciseEditor" component={ExerciseEditorScreen} />

      <Stack.Screen name="PlanWeek" component={PlanWeekScreen} />
      <Stack.Screen name="PlanDay" component={PlanDayScreen} />
      <Stack.Screen
        name="PlanExercisePicker"
        component={ExercisePickerScreen}
      />
      <Stack.Screen name="PlanTargetEditor" component={TargetEditorScreen} />
      <Stack.Screen name="PlanCopyDay" component={CopyDayScreen} />
      <Stack.Screen name="PlanHistory" component={PlanHistoryScreen} />

      <Stack.Screen name="HistoryTimeline" component={HistoryTimelineScreen} />
      <Stack.Screen name="HistoryCalendar" component={CalendarScreen} />
      <Stack.Screen name="DayDetail" component={DayDetailScreen} />
      <Stack.Screen name="ExerciseHistory" component={ExerciseHistoryScreen} />
    </Stack.Navigator>
  );
}

import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {WorkoutHomeScreen} from '@/features/workout/WorkoutHomeScreen';
import {SessionScreen} from '@/features/workout/SessionScreen';
import {NameWorkoutScreen} from '@/features/workout/NameWorkoutScreen';
import {WorkoutExercisePickerScreen} from '@/features/workout/WorkoutExercisePickerScreen';
import {ExerciseEditorScreen} from '@/features/exercises/ExerciseEditorScreen';
import {PlanWeekScreen} from '@/features/plan/PlanWeekScreen';
import {PlanDayScreen} from '@/features/plan/PlanDayScreen';
import {ExercisePickerScreen} from '@/features/plan/ExercisePickerScreen';
import {TargetEditorScreen} from '@/features/plan/TargetEditorScreen';
import {CopyDayScreen} from '@/features/plan/CopyDayScreen';
import {PlanHistoryScreen} from '@/features/plan/PlanHistoryScreen';
import {CalendarScreen} from '@/features/history/CalendarScreen';
import {DayDetailScreen} from '@/features/history/DayDetailScreen';
import {ExerciseHistoryScreen} from '@/features/history/ExerciseHistoryScreen';
import type {WorkoutStackParamList} from './types';

const Stack = createNativeStackNavigator<WorkoutStackParamList>();

/**
 * The Today tab, which is now most of the app.
 *
 * The plan and history screens were tabs of their own until they became
 * buttons on Today's header. Folding them in rather than nesting two more
 * navigators is what makes back mean "return to Today" from anywhere in
 * either, and lets a day of history open from the plan without crossing a
 * navigator boundary.
 */
export function WorkoutStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="WorkoutHome" component={WorkoutHomeScreen} />
      <Stack.Screen name="Session" component={SessionScreen} />
      <Stack.Screen name="NameWorkout" component={NameWorkoutScreen} />
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

      <Stack.Screen name="HistoryCalendar" component={CalendarScreen} />
      <Stack.Screen name="DayDetail" component={DayDetailScreen} />
      <Stack.Screen name="ExerciseHistory" component={ExerciseHistoryScreen} />
    </Stack.Navigator>
  );
}

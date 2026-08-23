import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {PlanWeekScreen} from '@/features/plan/PlanWeekScreen';
import {PlanDayScreen} from '@/features/plan/PlanDayScreen';
import {ExercisePickerScreen} from '@/features/plan/ExercisePickerScreen';
import {TargetEditorScreen} from '@/features/plan/TargetEditorScreen';
import {CopyDayScreen} from '@/features/plan/CopyDayScreen';
import {PlanHistoryScreen} from '@/features/plan/PlanHistoryScreen';
import type {PlanStackParamList} from './types';

const Stack = createNativeStackNavigator<PlanStackParamList>();

/** The Plan tab: the week overview and everything reachable from it. */
export function PlanStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="PlanWeek" component={PlanWeekScreen} />
      <Stack.Screen name="PlanDay" component={PlanDayScreen} />
      <Stack.Screen
        name="PlanExercisePicker"
        component={ExercisePickerScreen}
      />
      <Stack.Screen name="PlanTargetEditor" component={TargetEditorScreen} />
      <Stack.Screen name="PlanCopyDay" component={CopyDayScreen} />
      <Stack.Screen name="PlanHistory" component={PlanHistoryScreen} />
    </Stack.Navigator>
  );
}

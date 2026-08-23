import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {PlanWeekScreen} from '@/features/plan/PlanWeekScreen';
import type {PlanStackParamList} from './types';

const Stack = createNativeStackNavigator<PlanStackParamList>();

/** The Plan tab. Remaining routes are registered by Tasks 10–13. */
export function PlanStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="PlanWeek" component={PlanWeekScreen} />
    </Stack.Navigator>
  );
}

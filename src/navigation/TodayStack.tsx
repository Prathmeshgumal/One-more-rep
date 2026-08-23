import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {TodayScreen} from '@/features/workout/TodayScreen';
import type {TodayStackParamList} from './types';

const Stack = createNativeStackNavigator<TodayStackParamList>();

/** The Today tab: today's workout and everything it leads into. */
export function TodayStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="Today" component={TodayScreen} />
    </Stack.Navigator>
  );
}

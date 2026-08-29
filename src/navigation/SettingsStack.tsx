import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SettingsScreen} from '@/features/settings/SettingsScreen';
import {ExerciseListScreen} from '@/features/exercises/ExerciseListScreen';
import {ExerciseDetailScreen} from '@/features/exercises/ExerciseDetailScreen';
import {ExerciseEditorScreen} from '@/features/exercises/ExerciseEditorScreen';
import {ExerciseHistoryScreen} from '@/features/history/ExerciseHistoryScreen';
import type {SettingsStackParamList} from './types';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

/**
 * Settings, and the exercise library that used to be a tab of its own.
 *
 * The library belongs here because it is something you set up rather than
 * something you do: you visit it to add a movement or read how one works, not
 * while a barbell is waiting. Reaching for it mid-workout is served by the
 * pickers instead, which can create one without leaving the workout at all.
 */
export function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="SettingsHome" component={SettingsScreen} />
      <Stack.Screen name="ExerciseList" component={ExerciseListScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      <Stack.Screen name="ExerciseEditor" component={ExerciseEditorScreen} />
      <Stack.Screen name="ExerciseHistory" component={ExerciseHistoryScreen} />
    </Stack.Navigator>
  );
}

import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {ExerciseListScreen} from '@/features/exercises/ExerciseListScreen';
import {ExerciseDetailScreen} from '@/features/exercises/ExerciseDetailScreen';
import {ExerciseEditorScreen} from '@/features/exercises/ExerciseEditorScreen';
import {ExerciseHistoryScreen} from '@/features/history/ExerciseHistoryScreen';
import type {ExercisesStackParamList} from './types';

const Stack = createNativeStackNavigator<ExercisesStackParamList>();

/** The Exercises tab: the library, one exercise, and the custom editor. */
export function ExercisesStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="ExerciseList" component={ExerciseListScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      <Stack.Screen name="ExerciseEditor" component={ExerciseEditorScreen} />
      <Stack.Screen name="ExerciseHistory" component={ExerciseHistoryScreen} />
    </Stack.Navigator>
  );
}

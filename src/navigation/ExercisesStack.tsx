import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {ExerciseListScreen} from '@/features/exercises/ExerciseListScreen';
import type {ExercisesStackParamList} from './types';

const Stack = createNativeStackNavigator<ExercisesStackParamList>();

/**
 * The Exercises tab. Detail and editor screens are registered in Task 7; the
 * param list already names them because it is the contract the list screen
 * navigates against.
 */
export function ExercisesStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="ExerciseList" component={ExerciseListScreen} />
    </Stack.Navigator>
  );
}

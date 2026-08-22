import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {TodayScreen} from '@/features/today/TodayScreen';
import {PlanScreen} from '@/features/plan/PlanScreen';
import {HistoryScreen} from '@/features/history/HistoryScreen';
import {ExercisesStack} from './ExercisesStack';
import {SettingsScreen} from '@/features/settings/SettingsScreen';
import {useTheme, font} from '@/theme';
import type {RootTabParamList} from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

/**
 * The five tabs of section 3. Icons are deliberately absent: the design's line
 * icons arrive with the Phase 5 polish, and labels alone keep this phase
 * honest about what it delivers.
 */
export function RootNavigator() {
  const {colors} = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.plate,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.rule,
        },
        tabBarLabelStyle: {fontFamily: font.sansMedium, fontSize: 11},
        // No icon at all, rather than React Navigation's default glyph, which
        // needs an icon font we have not bundled and renders as tofu.
        tabBarIcon: () => null,
        tabBarIconStyle: {display: 'none'},
      }}>
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Plan" component={PlanScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Exercises" component={ExercisesStack} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

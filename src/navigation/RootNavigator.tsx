import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {TodayScreen} from '@/features/today/TodayScreen';
import {PlanScreen} from '@/features/plan/PlanScreen';
import {HistoryScreen} from '@/features/history/HistoryScreen';
import {ExercisesStack} from './ExercisesStack';
import {SettingsScreen} from '@/features/settings/SettingsScreen';
import {TAB_ICON} from '@/ui/TabIcon';
import {useTheme, font} from '@/theme';
import type {RootTabParamList} from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

/**
 * The five tabs of section 3, matching the design's `.tabbar` rule: a 21px
 * line icon over a 10px semibold label, inactive in `faint` and active in
 * `plate`, on a `surface` bar with a `rule` hairline above it.
 *
 * The design's 76px height is 62px of content plus 14px of breathing room at
 * the bottom; on a gesture-navigation device the system inset replaces that
 * padding, so the larger of the two is used rather than both.
 */
export function RootNavigator() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 14);

  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.plate,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.rule,
          height: 62 + bottom,
          paddingTop: 10,
          paddingBottom: bottom,
        },
        tabBarLabelStyle: {
          fontFamily: font.sansSemi,
          fontSize: 10,
          letterSpacing: 0.1,
        },
        tabBarIconStyle: {marginBottom: 1},
        tabBarIcon: TAB_ICON[route.name],
      })}>
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Plan" component={PlanScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Exercises" component={ExercisesStack} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

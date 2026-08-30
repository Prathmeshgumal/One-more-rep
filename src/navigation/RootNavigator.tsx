import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {WorkoutStack} from './WorkoutStack';
import {SettingsStack} from './SettingsStack';
import {TAB_ICON} from '@/ui/TabIcon';
import {useTheme, font} from '@/theme';
import type {RootTabParamList} from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

/**
 * Two tabs, where the design drew five.
 *
 * Plan and History became buttons on Today's header and the exercise library
 * moved into Settings, on the grounds that a whole section is a heavy way to
 * reach something you open, use and leave. What is left is the split that
 * actually earns a tab: the thing you do, and the thing you configure.
 *
 * The bar keeps the design's `.tabbar` rule otherwise — a 21px line icon over
 * a 10px semibold label, inactive in `faint` and active in `plate`, on a
 * `surface` bar with a `rule` hairline above it. Its 76px is 62px of content
 * plus 14px of breathing room; on a gesture-navigation device the system inset
 * replaces that padding, so the larger of the two is used rather than both.
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
      <Tab.Screen name="Workout" component={WorkoutStack} />
      <Tab.Screen name="Settings" component={SettingsStack} />
    </Tab.Navigator>
  );
}

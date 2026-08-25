import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {useTheme, space} from '@/theme';
import {SessionSummary} from './SessionSummary';
import {useSettingsQuery} from '@/features/settings/useSettings';
import type {TodayStackParamList} from '@/navigation/types';
import {useTodaySessionQuery, useFinishWorkout} from './useSession';

const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

/** Design 11: §19's summary, and the only place a workout is saved. */
export function WorkoutCompleteScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  // Typed, because popToTop only exists on a stack navigator's prop.
  const navigation =
    useNavigation<NativeStackNavigationProp<TodayStackParamList>>();

  const {data: session} = useTodaySessionQuery();
  const {data: settings} = useSettingsQuery();
  const finish = useFinishWorkout();

  if (!session) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  const unit = settings?.unit ?? 'kg';
  const pendingSets = session.exercises
    .flatMap(e => e.sets)
    .filter(s => s.status === 'pending');

  const isOpen = session.status === 'in_progress';

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.xl},
      ]}>
      <View style={styles.headerBlock}>
        <AppText variant="eyebrow" color="muted">
          {longDate(session.date)}
        </AppText>
        <AppText variant="h1">{`${session.dayName} done`}</AppText>
      </View>

      <SessionSummary session={session} unit={unit} />

      {isOpen && pendingSets.length > 0 ? (
        <AppText variant="small" color="short">
          {`${pendingSets.length} ${
            pendingSets.length === 1 ? 'set' : 'sets'
          } not recorded. Saving marks them skipped.`}
        </AppText>
      ) : null}

      <Button
        label={isOpen ? 'Save workout' : 'Done'}
        disabled={finish.isPending}
        onPress={() => {
          if (!isOpen) {
            navigation.popToTop();
            return;
          }
          finish.mutate(session.id, {onSuccess: () => navigation.popToTop()});
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.md,
  },
  headerBlock: {gap: 2},
});

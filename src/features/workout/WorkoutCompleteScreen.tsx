import React, {useCallback, useRef, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {useTheme, space} from '@/theme';
import {SessionSummary} from './SessionSummary';
import {DayImageCard, CARD_WIDTH} from '@/features/history/DayImageCard';
import {useSaveDayImage} from '@/features/history/useSaveDayImage';
import {useSettingsQuery} from '@/features/settings/useSettings';
import type {WorkoutStackParamList} from '@/navigation/types';
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
    useNavigation<NativeStackNavigationProp<WorkoutStackParamList>>();

  const {data: session} = useTodaySessionQuery();
  const {data: settings} = useSettingsQuery();
  const finish = useFinishWorkout();

  // Same one-shot capture as the day-detail screen: mounted only while a save
  // is running, rasterised once its layout lands.
  //
  // Above the early return, not below it: this screen renders a placeholder
  // while the session loads, and hooks declared after that guard run on some
  // renders and not others. React caught it immediately -- "rendered more
  // hooks than during the previous render" -- and so did every test here.
  const shot = useRef<React.ComponentRef<typeof View>>(null);
  const image = useSaveDayImage();
  const [capturing, setCapturing] = useState(false);
  const captured = useRef(false);

  const onCardLaidOut = useCallback(async () => {
    if (captured.current) {
      return;
    }
    captured.current = true;
    await image.save(shot);
    setCapturing(false);
  }, [image]);

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

      {/* Offered only once the workout is saved: an image of a session still
          being recorded would be out of date the moment it was taken. */}
      {!isOpen ? (
        <>
          <Button
            label={capturing ? 'Saving…' : 'Save image'}
            variant="secondary"
            disabled={capturing}
            onPress={() => {
              captured.current = false;
              setCapturing(true);
            }}
          />
          {image.message ? (
            <AppText
              variant="small"
              color={image.status === 'failed' ? 'short' : 'muted'}>
              {image.message}
            </AppText>
          ) : null}
        </>
      ) : null}

      {capturing ? (
        <View style={styles.offscreen} pointerEvents="none">
          <View
            testID="day-image"
            ref={shot}
            collapsable={false}
            onLayout={onCardLaidOut}>
            <DayImageCard session={session} unit={unit} />
          </View>
        </View>
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
  offscreen: {position: 'absolute', left: -CARD_WIDTH * 2, top: 0},
});

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {useTheme, space, radius} from '@/theme';
import {useSettingsQuery} from '@/features/settings/useSettings';
import type {WorkoutStackParamList} from '@/navigation/types';
import {FocusSet, type FocusMode} from './FocusSet';
import {SetRail} from './SetRail';
import {useActiveSet} from './useActiveSet';
import {
  flattenSets,
  firstPendingIndex,
  recordedCount,
  type SetCursor,
} from './sessionCursor';
import {useTodaySessionQuery, usePreviousPerformanceQuery} from './useSession';

/**
 * The workout, one set at a time.
 *
 * This replaces a screen where a single exercise with five sets was 591dp of a
 * 720dp viewport, and where every ✓ pushed the live row 94dp further down
 * without the list following it. Here nothing scrolls at all: the set you are
 * on has the screen, the rail above carries the rest of the session, and the
 * controls never move.
 *
 * The screen holds one number — an index into the session flattened to a run
 * of sets. "Next" then means the same thing whether the next set is in this
 * exercise or the one after it.
 */
export function SessionScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<WorkoutStackParamList>>();

  const {data: session, isFetching} = useTodaySessionQuery();
  const {data: settings} = useSettingsQuery();
  const active = useActiveSet();

  const [focusIndex, setFocusIndex] = useState(0);

  const cursors = session ? flattenSets(session) : [];
  const cursor: SetCursor | undefined = cursors[focusIndex];

  const {data: previous} = usePreviousPerformanceQuery(
    cursor?.exercise.exerciseId ?? '',
  );

  /**
   * Spec 6.4: an in-progress session resumes at the first pending set.
   *
   * Gaining focus only *asks* for the alignment; the effect below performs it
   * once the query has settled. Aligning inside the focus callback itself
   * looked simpler and was wrong: on a cold open the session has not arrived
   * yet, and on a return the refetch is still in flight, so it aligned against
   * stale data and then never corrected — you came back to a workout sitting
   * on a set you had already recorded.
   */
  const wantsAlign = useRef(true);

  useFocusEffect(
    useCallback(() => {
      wantsAlign.current = true;
    }, []),
  );

  useEffect(() => {
    if (!wantsAlign.current || !session || isFetching) {
      return;
    }
    wantsAlign.current = false;
    setFocusIndex(firstPendingIndex(flattenSets(session)));
  }, [session, isFetching]);

  /**
   * §35: the controls arrive holding the target. A set being corrected opens
   * on what was recorded instead — you are fixing a number, so the number that
   * was typed is the better starting point than the one it aimed at. A bonus
   * set has no target at all, so the last thing actually lifted on this
   * exercise beats an empty field in a gym.
   */
  useEffect(() => {
    if (!cursor || active.setId === cursor.set.id) {
      return;
    }
    const {set, exercise} = cursor;
    const lastRecorded = [...exercise.sets]
      .reverse()
      .find(s => s.status === 'completed');
    active.load({
      setId: set.id,
      weight:
        set.actualWeight ??
        set.targetWeight ??
        lastRecorded?.actualWeight ??
        (exercise.weightApplicable ? 0 : null),
      reps: set.actualReps ?? set.targetReps ?? lastRecorded?.actualReps ?? 10,
    });
  }, [cursor, active]);

  if (!session || !cursor) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  const unit = settings?.unit ?? 'kg';
  const increment = settings?.defaultIncrement ?? 0.5;

  const mode: FocusMode =
    cursor.set.status === 'skipped'
      ? 'skipped'
      : cursor.set.status === 'completed'
      ? 'amending'
      : 'live';

  // The same set number from last time, not the first one: on set four, what
  // you did on set four is the useful comparison, and it is usually not what
  // you did on set one. Falls back to the last set recorded, because last week
  // may have been a shorter session.
  const lastTime =
    previous?.sets[cursor.setNumber - 1] ??
    previous?.sets[previous.sets.length - 1] ??
    null;
  const previousLabel = lastTime
    ? `last time ${lastTime.reps}${
        lastTime.weight ? ` × ${lastTime.weight} ${unit}` : ''
      }`
    : null;

  const done = recordedCount(cursors);

  return (
    <View
      style={[
        styles.root,
        {backgroundColor: colors.paper, paddingTop: insets.top},
      ]}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close workout"
          hitSlop={space.md}
          onPress={() => navigation.goBack()}
          style={styles.icon}>
          <AppText variant="h2" color="muted">
            ✕
          </AppText>
        </Pressable>
        <View style={styles.title}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {session.dayName}
          </AppText>
          <AppText variant="monoSmall" color="muted">
            {`${done} of ${cursors.length} recorded`}
          </AppText>
        </View>
        {/* Finish and the exercise menu arrive in the next tasks; the header
            keeps their place so the layout does not shift under testing. */}
        <View style={styles.icon} />
      </View>

      <SetRail
        cursors={cursors}
        focusIndex={focusIndex}
        amending={mode === 'amending'}
        onJump={setFocusIndex}
      />

      <FocusSet
        cursor={cursor}
        mode={mode}
        reps={active.reps}
        weight={active.weight}
        unit={unit}
        increment={increment}
        previousLabel={previousLabel}
        onStepReps={active.stepReps}
        onStepWeight={active.stepWeight}
        onUndoSkip={() => undefined}
      />

      <View style={[styles.hints, {paddingBottom: insets.bottom + space.sm}]}>
        <AppText variant="monoSmall" color="faint">
          {focusIndex > 0 ? `← set ${cursors[focusIndex - 1]!.setNumber}` : ' '}
        </AppText>
        <AppText variant="monoSmall" color="faint">
          {focusIndex < cursors.length - 1
            ? `set ${cursors[focusIndex + 1]!.setNumber} →`
            : ' '}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  bar: {
    height: 45,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {flex: 1},
  hints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
  },
});

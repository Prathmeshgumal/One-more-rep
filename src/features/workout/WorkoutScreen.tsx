import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {ProgressBar} from '@/ui/ProgressBar';
import {useTheme, space} from '@/theme';
import {useSettingsQuery} from '@/features/settings/useSettings';
import type {TodayStackParamList} from '@/navigation/types';
import {WorkoutExerciseCard} from './WorkoutExerciseCard';
import {useActiveSet} from './useActiveSet';
import {
  useTodaySessionQuery,
  usePreviousPerformanceQuery,
  useCompleteSet,
  useSkipSet,
  useSkipExercise,
  useAddSet,
} from './useSession';

export function WorkoutScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<TodayStackParamList>>();

  const {data: session} = useTodaySessionQuery();
  const {data: settings} = useSettingsQuery();
  const complete = useCompleteSet();
  const skip = useSkipSet();
  const skipExercise = useSkipExercise();
  const addSet = useAddSet();

  // U1/U2: every exercise is on screen; exactly one is open. Keyed by
  // `performed_exercises.id` rather than by position, because reordering an
  // exercise mid-workout (R3) makes a position meaningless.
  const [openId, setOpenId] = useState<string | null>(null);
  const active = useActiveSet();

  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const cardY = useRef(new Map<string, number>());

  // Spec 6.4: an in-progress session resumes "at the first pending set". The
  // open card is local state, so on its own it would always open the first
  // exercise — which on the device meant resuming a half-finished workout on
  // an exercise already done.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const aligned = useRef(false);

  const alignToPending = useCallback((): boolean => {
    const current = sessionRef.current;
    if (!current) {
      return false;
    }
    const pending = current.exercises.find(e =>
      e.sets.some(s => s.status === 'pending'),
    );
    if (pending) {
      setOpenId(pending.id);
    }
    return true;
  }, []);

  // Gaining focus realigns: on a cold open, and on returning from a pushed
  // screen such as the exercise summary.
  useFocusEffect(
    useCallback(() => {
      aligned.current = alignToPending();
    }, [alignToPending]),
  );

  // On a cold open the query has usually not resolved by the time focus fires,
  // so the alignment is retried once the session arrives — and only once, so
  // that recording a set never moves the screen out from under someone who is
  // still working on that exercise.
  useEffect(() => {
    if (!aligned.current) {
      aligned.current = alignToPending();
    }
  }, [session, alignToPending]);

  const openExercise = session?.exercises.find(e => e.id === openId);
  const {data: previous} = usePreviousPerformanceQuery(
    openExercise?.exerciseId ?? '',
  );

  // The first set still pending on the open exercise is the one being worked.
  const activeSet = openExercise?.sets.find(s => s.status === 'pending');

  // §35: the inputs arrive holding the target. For a bonus set there is no
  // target, so the last thing actually lifted on this exercise is the better
  // guess than an empty field in a gym.
  useEffect(() => {
    if (!activeSet || active.setId === activeSet.id) {
      return;
    }
    const lastRecorded = [...(openExercise?.sets ?? [])]
      .reverse()
      .find(s => s.status === 'completed');
    active.load({
      setId: activeSet.id,
      weight:
        activeSet.targetWeight ??
        lastRecorded?.actualWeight ??
        (openExercise?.weightApplicable ? 0 : null),
      reps: activeSet.targetReps ?? lastRecorded?.actualReps ?? 10,
    });
  }, [activeSet, active, openExercise]);

  /** Opens a card and brings it to the top of the scroll. */
  const reveal = useCallback((id: string) => {
    setOpenId(id);
    const y = cardY.current.get(id);
    if (y !== undefined) {
      scroller.current?.scrollTo({y: Math.max(0, y - space.md), animated: true});
    }
  }, []);

  if (!session) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  const unit = settings?.unit ?? 'kg';
  const increment = settings?.defaultIncrement ?? 0.5;

  const allSets = session.exercises.flatMap(e => e.sets);
  const doneSets = allSets.filter(s => s.status === 'completed').length;
  const doneExercises = session.exercises.filter(
    e => e.status !== 'pending',
  ).length;

  /** The next exercise with work left on it, after the one given. */
  const nextPendingAfter = (id: string) => {
    const from = session.exercises.findIndex(e => e.id === id);
    return session.exercises
      .slice(from + 1)
      .find(e => e.sets.some(s => s.status === 'pending'));
  };

  const onCompleteSet = () => {
    if (!activeSet || !openExercise) {
      return;
    }
    const wasLast =
      openExercise.sets.filter(s => s.status === 'pending').length === 1;
    const finishing = openExercise.id;

    complete.mutate(
      {
        setId: activeSet.id,
        actualReps: active.reps,
        actualWeight: openExercise.weightApplicable ? active.weight : null,
      },
      {
        onSuccess: () => {
          active.reset();
          // Spec 6.3 still auto-advances, but no longer by pushing a screen.
          // The next exercise opens under the finished one and the list scrolls
          // to it — see the design departure recorded in docs/deferred.md.
          if (wasLast) {
            const next = nextPendingAfter(finishing);
            if (next) {
              reveal(next.id);
            }
          }
        },
      },
    );
  };

  const allDone = allSets.every(s => s.status !== 'pending');

  return (
    <ScrollView
      ref={scroller}
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.md},
      ]}
      keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.grow}>
          <AppText variant="eyebrow" color="muted">
            {session.dayName}
          </AppText>
          <AppText variant="mono" color="ink2">
            {`${doneSets} / ${allSets.length} sets · ${doneExercises} of ${session.exercises.length} exercises`}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close workout"
          hitSlop={space.md}
          onPress={() => navigation.goBack()}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path
              d="M6 6l12 12M18 6L6 18"
              stroke={colors.ink2}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </Svg>
        </Pressable>
      </View>

      <ProgressBar
        value={doneSets}
        total={allSets.length}
        label="Workout progress"
      />

      <View style={styles.list}>
        {session.exercises.map(exercise => {
          const isOpen = exercise.id === openId;
          return (
            <WorkoutExerciseCard
              key={exercise.id}
              exercise={exercise}
              expanded={isOpen}
              onToggle={() => (isOpen ? setOpenId(null) : reveal(exercise.id))}
              onLayoutY={y => cardY.current.set(exercise.id, y)}
              unit={unit}
              increment={increment}
              previous={isOpen ? previous : null}
              activeSetId={isOpen ? (activeSet?.id ?? null) : null}
              activeWeight={active.weight}
              activeReps={active.reps}
              onSetWeight={active.setWeight}
              onSetReps={active.setReps}
              onCompleteSet={onCompleteSet}>
              {/* The controls belong to one exercise, so they live inside its
                  card rather than floating under whatever is on screen. */}
              <View style={styles.pair}>
                <View style={styles.grow}>
                  <Button
                    label="Add set"
                    variant="ghost"
                    size="sm"
                    onPress={() => addSet.mutate(exercise.id)}
                  />
                </View>
                <View style={styles.grow}>
                  <Button
                    label="Skip set"
                    variant="ghost"
                    size="sm"
                    disabled={!activeSet}
                    onPress={() => activeSet && skip.mutate(activeSet.id)}
                  />
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  skipExercise.mutate(exercise.id, {
                    onSuccess: () => {
                      active.reset();
                      const next = nextPendingAfter(exercise.id);
                      if (next) {
                        reveal(next.id);
                      }
                    },
                  });
                }}
                style={styles.quiet}>
                {/* Ochre, never red: skipping is a decision, not an error. */}
                <AppText variant="small" color="short">
                  Skip this exercise
                </AppText>
              </Pressable>
            </WorkoutExerciseCard>
          );
        })}
      </View>

      <Button
        label="Add an exercise"
        variant="ghost"
        size="sm"
        onPress={() => navigation.navigate('WorkoutExercisePicker')}
      />

      <Button
        label="Finish workout"
        variant={allDone ? 'primary' : 'secondary'}
        onPress={() => navigation.navigate('WorkoutComplete')}
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
  header: {flexDirection: 'row', alignItems: 'flex-start', gap: space.md},
  grow: {flex: 1},
  list: {marginTop: space.xs},
  pair: {flexDirection: 'row', gap: space.sm},
  quiet: {alignItems: 'center', paddingVertical: space.sm},
});

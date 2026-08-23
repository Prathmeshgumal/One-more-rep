import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {ProgressBar} from '@/ui/ProgressBar';
import {useTheme, space} from '@/theme';
import {useSettingsQuery} from '@/features/settings/useSettings';
import type {TodayStackParamList} from '@/navigation/types';
import {SetRow} from './SetRow';
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

  const [index, setIndex] = useState(0);
  const active = useActiveSet();

  const exercise = session?.exercises[index];
  const {data: previous} = usePreviousPerformanceQuery(
    exercise?.exerciseId ?? '',
  );

  // The first set still pending is the one being worked on.
  const activeSet = exercise?.sets.find(s => s.status === 'pending');

  // §35: the inputs arrive holding the target. For a bonus set there is no
  // target, so the last thing actually lifted on this exercise is the better
  // guess than an empty field in a gym.
  useEffect(() => {
    if (!activeSet || active.setId === activeSet.id) {
      return;
    }
    const lastRecorded = [...(exercise?.sets ?? [])]
      .reverse()
      .find(s => s.status === 'completed');
    active.load({
      setId: activeSet.id,
      weight:
        activeSet.targetWeight ??
        lastRecorded?.actualWeight ??
        (exercise?.weightApplicable ? 0 : null),
      reps: activeSet.targetReps ?? lastRecorded?.actualReps ?? 10,
    });
  }, [activeSet, active, exercise]);

  if (!session || !exercise) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  const unit = settings?.unit ?? 'kg';
  const increment = settings?.defaultIncrement ?? 2.5;

  const allSets = session.exercises.flatMap(e => e.sets);
  const doneSets = allSets.filter(s => s.status === 'completed').length;
  const doneExercises = session.exercises.filter(
    e => e.status !== 'pending',
  ).length;
  const next = session.exercises[index + 1];

  const onComplete = () => {
    if (!activeSet) {
      return;
    }
    const wasLast =
      exercise.sets.filter(s => s.status === 'pending').length === 1;
    complete.mutate(
      {
        setId: activeSet.id,
        actualReps: active.reps,
        actualWeight: exercise.weightApplicable ? active.weight : null,
      },
      {
        onSuccess: () => {
          active.reset();
          // Spec 6.3: auto-advance. Finishing the last set of an exercise
          // means the exercise is done, so its summary is what comes next.
          if (wasLast) {
            navigation.navigate('ExerciseSummary', {exerciseIndex: index});
          }
        },
      },
    );
  };

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.md},
      ]}>
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

      <AppText variant="h1">{exercise.name}</AppText>

      {previous ? (
        <AppText variant="printed" color="muted">
          {`last time ${previous.sets
            .map(
              s =>
                `${s.weight === null ? '' : `${s.weight.toFixed(1)}×`}${s.reps}`,
            )
            .join(' · ')}`}
        </AppText>
      ) : null}

      <View style={styles.sets}>
        {exercise.sets.map(set => (
          <SetRow
            key={set.id}
            setNumber={set.setNumber}
            targetReps={set.targetReps}
            targetWeight={set.targetWeight}
            actualReps={
              activeSet?.id === set.id ? active.reps : set.actualReps
            }
            actualWeight={
              activeSet?.id === set.id ? active.weight : set.actualWeight
            }
            status={set.status}
            isUnplanned={set.isUnplanned}
            isActive={activeSet?.id === set.id}
            unit={unit}
            increment={increment}
            onAdjustWeight={active.adjustWeight}
            onAdjustReps={active.adjustReps}
            onComplete={onComplete}
          />
        ))}
      </View>

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

      {next ? (
        <Button
          label={`Next — ${next.name}`}
          variant="secondary"
          size="sm"
          onPress={() => {
            active.reset();
            setIndex(index + 1);
          }}
        />
      ) : (
        <Button
          label="Finish workout"
          onPress={() => navigation.navigate('WorkoutComplete')}
        />
      )}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          skipExercise.mutate(exercise.id, {
            onSuccess: () => {
              active.reset();
              if (next) {
                setIndex(index + 1);
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
  sets: {marginTop: space.xs},
  pair: {flexDirection: 'row', gap: space.sm},
  quiet: {alignItems: 'center', paddingVertical: space.sm},
});

import React, {useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, TextInput, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {Card} from '@/ui/Card';
import {ReorderableRows} from '@/ui/ReorderableRows';
import {useTheme, type as typeScale, space, radius} from '@/theme';
import {WEEKDAY_NAMES} from '@/domain/weekday';
import {
  renameDay,
  setRestDay,
  removeExercise,
  moveExercise,
} from '@/domain/planDraft';
import type {PlanExercise} from '@/repositories/planRepo';
import type {PlanStackParamList} from '@/navigation/types';
import {usePlanQuery, useEditPlan} from './usePlan';

/** "3 × 10 · 30.0 kg", or "3 × 10" when the sets are not uniform or unweighted. */
function targetLine(exercise: PlanExercise): string {
  const [first, ...rest] = exercise.sets;
  if (!first) {
    return 'No sets';
  }
  const uniform = rest.every(
    s => s.targetReps === first.targetReps && s.targetWeight === first.targetWeight,
  );
  if (!uniform) {
    return `${exercise.sets.length} sets · varied`;
  }
  const base = `${exercise.sets.length} × ${first.targetReps}`;
  return first.targetWeight === null
    ? base
    : `${base} · ${first.targetWeight.toFixed(1)} kg`;
}

export function PlanDayScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<PlanStackParamList>>();
  const {weekday} = useRoute().params as {weekday: number};

  const {data: plan} = usePlanQuery();
  const edit = useEditPlan();
  const day = plan?.days[weekday];

  const weekdayName = WEEKDAY_NAMES[weekday]!;
  const [name, setName] = useState('');

  // Filled once from the database. `day` is a fresh object on every refetch, so
  // an unguarded effect would overwrite what is being typed.
  const [populated, setPopulated] = useState(false);
  useEffect(() => {
    if (day && !populated) {
      setName(day.customName ?? '');
      setPopulated(true);
    }
  }, [day, populated]);

  // Read through a ref so the listener below sees what has been typed rather
  // than what was on screen when it was registered. `committed` remembers the
  // last value written, because the plan query has not necessarily refetched
  // by the time the screen is removed — without it, submitting and then going
  // back would write the same rename twice and fork a second plan version.
  const latest = useRef({typed: '', saved: '', mutate: edit.mutate});
  latest.current = {
    typed: name,
    saved: day?.customName ?? '',
    mutate: edit.mutate,
  };
  const committed = useRef<string | null>(null);

  const commitName = () => {
    const {typed, saved, mutate} = latest.current;
    const value = typed.trim();
    if (saved === value || committed.current === value) {
      return;
    }
    committed.current = value;
    mutate(draft => renameDay(draft, weekday, typed));
  };

  // Android's hardware back dismisses the keyboard without blurring the input,
  // so `onBlur` never fires and the rename is silently lost — which is exactly
  // what happened on the device. Committing as the screen is removed is the
  // only hook that catches every way out of this screen.
  useEffect(
    () => navigation.addListener('beforeRemove', commitName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigation, weekday],
  );

  if (!plan || !day) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  const isNew = !day.isRestDay && day.exercises.length === 0;
  const heading = day.isRestDay
    ? 'Rest day'
    : isNew
      ? `Set up ${weekdayName}`
      : (day.customName ?? weekdayName);

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.xl},
      ]}
      keyboardShouldPersistTaps="handled">
      <View style={styles.headerBlock}>
        <AppText variant="eyebrow" color="muted">
          {weekdayName}
        </AppText>
        <AppText variant="h1">{heading}</AppText>
        <AppText variant="small" color="muted">
          {day.isRestDay
            ? 'Recovery day. No workout planned.'
            : isNew
              ? 'Give it a name, then add exercises'
              : 'Tap the name to rename this day'}
        </AppText>
      </View>

      {day.isRestDay ? (
        <Button
          label={`Make ${weekdayName} a workout day`}
          variant="secondary"
          onPress={() => edit.mutate(draft => setRestDay(draft, weekday, false))}
        />
      ) : (
        <>
          <View style={styles.field}>
            <AppText variant="eyebrow" color="muted">
              Day name · optional
            </AppText>
            <TextInput
              accessibilityLabel="Day name"
              value={name}
              onChangeText={setName}
              onBlur={commitName}
              onSubmitEditing={commitName}
              placeholder="Push Day, Chest + Triceps…"
              placeholderTextColor={colors.faint}
              style={[
                typeScale.body,
                styles.input,
                {
                  color: colors.ink,
                  backgroundColor: colors.surface,
                  borderColor: colors.rule,
                },
              ]}
            />
          </View>

          <AppText variant="eyebrow" color="muted">
            {isNew ? 'Exercises' : 'Exercises · hold to reorder'}
          </AppText>

          {isNew ? (
            <View style={[styles.blank, {borderColor: colors.rule}]}>
              <AppText variant="bodyStrong" color="muted">
                Nothing here yet
              </AppText>
              <AppText variant="small" color="muted" style={styles.centred}>
                Add the exercises you plan to do on {weekdayName}s, with the
                sets, reps and weight you're aiming for.
              </AppText>
            </View>
          ) : (
            <ReorderableRows
              data={day.exercises}
              keyOf={e => e.plannedExerciseId}
              onReorder={(from, to) =>
                edit.mutate(draft => moveExercise(draft, weekday, from, to))
              }
              renderRow={(exercise, drag) => {
                const index = day.exercises.indexOf(exercise);
                return (
                  <Card
                    accessibilityHint="Press and hold to drag this exercise into a new position"
                    onLongPress={drag}
                    onPress={() =>
                      navigation.navigate('PlanTargetEditor', {
                        weekday,
                        exerciseIndex: index,
                      })
                    }>
                    <View style={styles.row}>
                      <View style={styles.grow}>
                        <AppText variant="bodyStrong">{exercise.name}</AppText>
                        <AppText variant="small" color="muted">
                          {targetLine(exercise)}
                        </AppText>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${exercise.name}`}
                        hitSlop={space.md}
                        onPress={() =>
                          edit.mutate(draft =>
                            removeExercise(draft, weekday, index),
                          )
                        }>
                        <AppText variant="body" color="faint">
                          ✕
                        </AppText>
                      </Pressable>
                    </View>
                  </Card>
                );
              }}
            />
          )}

          <Button
            label="Add exercise"
            variant={isNew ? 'primary' : 'ghost'}
            size={isNew ? 'md' : 'sm'}
            onPress={() =>
              navigation.navigate('PlanExercisePicker', {weekday})
            }
          />

          {!isNew ? (
            <Button
              label="Copy this day"
              variant="ghost"
              size="sm"
              onPress={() => navigation.navigate('PlanCopyDay', {weekday})}
            />
          ) : null}

          <View style={[styles.divider, {backgroundColor: colors.ruleSoft}]} />

          {isNew ? (
            <>
              <AppText variant="small" color="muted" style={styles.centred}>
                Not training on {weekdayName}s?
              </AppText>
              <Button
                label={`Make ${weekdayName} a rest day`}
                variant="secondary"
                onPress={() =>
                  edit.mutate(draft => setRestDay(draft, weekday, true))
                }
              />
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                edit.mutate(draft => setRestDay(draft, weekday, true))
              }
              style={styles.quiet}>
              <AppText variant="small" color="muted" style={styles.underline}>
                Make {weekdayName} a rest day instead
              </AppText>
            </Pressable>
          )}
        </>
      )}
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
  headerBlock: {gap: 2, marginBottom: space.sm},
  field: {gap: space.sm},
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  blank: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: space.xxxl,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    gap: space.xs,
  },
  centred: {textAlign: 'center'},
  row: {flexDirection: 'row', alignItems: 'center', gap: space.md},
  grow: {flex: 1, gap: 2},
  divider: {height: 1, marginVertical: space.lg},
  quiet: {alignItems: 'center'},
  underline: {textDecorationLine: 'underline'},
});

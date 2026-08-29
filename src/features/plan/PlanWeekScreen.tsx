import React from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Circle, Path} from 'react-native-svg';
import {AppText} from '@/ui/Text';
import {BackButton} from '@/ui/BackButton';
import {Button} from '@/ui/Button';
import {Hatch} from '@/ui/Hatch';
import {useTheme, space, radius} from '@/theme';
import {WEEKDAY_ABBR, WEEKDAY_NAMES, weekdayIndex} from '@/domain/weekday';
import type {PlanDayView} from '@/repositories/planRepo';
import type {PlanStackParamList} from '@/navigation/types';
import {usePlanQuery, useCreatePlan} from './usePlan';

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

function daySummary(day: PlanDayView): string | null {
  if (day.isRestDay) {
    return null;
  }
  if (day.exercises.length === 0) {
    return null;
  }
  const sets = day.exercises.reduce((total, e) => total + e.sets.length, 0);
  return `${plural(day.exercises.length, 'exercise', 'exercises')} · ${plural(
    sets,
    'set',
    'sets',
  )}`;
}

export function PlanWeekScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<PlanStackParamList>>();
  const {data: plan, isPending} = usePlanQuery();
  const create = useCreatePlan();

  const today = weekdayIndex(new Date());

  if (isPending) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  // Design 01 — the seven ghost rows preview the shape of what is about to
  // exist, rather than only naming it.
  if (!plan) {
    return (
      <View
        style={[
          styles.root,
          styles.empty,
          {backgroundColor: colors.paper, paddingTop: insets.top + space.xxxl},
        ]}>
        <View style={styles.ghostWeek}>
          {WEEKDAY_ABBR.map(abbr => (
            <View
              key={abbr}
              style={[styles.ghostRow, {borderColor: colors.ruleSoft}]}
            />
          ))}
        </View>
        <AppText variant="h2">Your week is empty</AppText>
        <AppText variant="body" color="muted" style={styles.centred}>
          Set up a weekly routine, then track what you actually lift against it.
        </AppText>
        <View style={styles.fullWidth}>
          <Button
            label="Create plan"
            onPress={() => create.mutate()}
            disabled={create.isPending}
          />
        </View>
      </View>
    );
  }

  const workoutDays = plan.days.filter(d => !d.isRestDay && d.exercises.length);
  const totalExercises = plan.days.reduce(
    (total, d) => total + d.exercises.length,
    0,
  );

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.xl},
      ]}>
      {/* The plan was a tab, where the tab itself was the way back. It is
          pushed from Today now, so it needs one of its own. */}
      <BackButton />
      <View style={styles.header}>
        <View style={styles.grow}>
          <AppText variant="eyebrow" color="muted">
            Active plan
          </AppText>
          <AppText variant="h1">Your week</AppText>
          <AppText variant="small" color="muted">
            {`${plural(workoutDays.length, 'workout day', 'workout days')} · ${plural(
              totalExercises,
              'exercise',
              'exercises',
            )}`}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Plan history"
          onPress={() => navigation.navigate('PlanHistory')}
          hitSlop={space.md}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={12} r={8} stroke={colors.ink2} strokeWidth={1.8} />
            <Path
              d="M12 8v4l3 2"
              stroke={colors.ink2}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </Svg>
        </Pressable>
      </View>

      <View style={styles.stack}>
        {plan.days.map(day => {
          const name = day.customName ?? WEEKDAY_NAMES[day.weekday]!;
          const unset = !day.isRestDay && day.exercises.length === 0;
          const summary = daySummary(day);

          return (
            <Pressable
              key={day.weekday}
              accessibilityRole="button"
              accessibilityLabel={
                day.isRestDay
                  ? `${WEEKDAY_NAMES[day.weekday]}, rest day`
                  : unset
                    ? `${WEEKDAY_NAMES[day.weekday]}, not set up`
                    : `${WEEKDAY_NAMES[day.weekday]}, ${name}`
              }
              onPress={() =>
                navigation.navigate('PlanDay', {weekday: day.weekday})
              }
              style={[
                styles.tile,
                {backgroundColor: colors.surface, borderColor: colors.ruleSoft},
                unset && [styles.unset, {borderColor: colors.rule}],
              ]}>
              {day.isRestDay ? <Hatch color={colors.surface2} /> : null}
              <AppText variant="monoSmall" color="muted" style={styles.abbr}>
                {WEEKDAY_ABBR[day.weekday]}
              </AppText>
              <View style={styles.grow}>
                {day.isRestDay ? (
                  <AppText variant="bodyStrong" color="muted">
                    Rest day
                  </AppText>
                ) : unset ? (
                  <AppText variant="bodyStrong" color="faint">
                    Not set up
                  </AppText>
                ) : (
                  <>
                    <AppText variant="bodyStrong">{name}</AppText>
                    {summary ? (
                      <AppText variant="small" color="muted">
                        {summary}
                      </AppText>
                    ) : null}
                  </>
                )}
              </View>
              {day.weekday === today ? (
                <AppText variant="monoSmall" color="plate">
                  Today
                </AppText>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  empty: {
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  centred: {textAlign: 'center'},
  fullWidth: {width: '100%', marginTop: space.sm},
  ghostWeek: {width: '100%', gap: space.sm, marginBottom: space.lg},
  ghostRow: {height: 34, borderWidth: 1, borderRadius: radius.sm, borderStyle: 'dashed'},
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  header: {flexDirection: 'row', alignItems: 'flex-start', gap: space.md},
  grow: {flex: 1, gap: 2},
  stack: {gap: space.sm},
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    overflow: 'hidden',
  },
  unset: {borderStyle: 'dashed', backgroundColor: 'transparent'},
  abbr: {width: 34},
});

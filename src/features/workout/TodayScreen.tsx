import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {Card} from '@/ui/Card';
import {ProgressBar} from '@/ui/ProgressBar';
import {useTheme, space, radius} from '@/theme';
import {WEEKDAY_NAMES, weekdayIndex} from '@/domain/weekday';
import {targetLine} from '@/domain/format';
import {compareSet, describeComparison} from '@/domain/setComparison';
import {LedgerTable, type LedgerRow} from '@/ui/LedgerTable';
import {SessionSummary} from './SessionSummary';
import type {SessionExercise} from '@/repositories/sessionRepo';
import {useSettingsQuery} from '@/features/settings/useSettings';
import type {
  TodayStackParamList,
  RootTabParamList,
} from '@/navigation/types';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import {
  useTodaySessionQuery,
  useTodayPlanQuery,
  useStartWorkout,
  useFinishWorkout,
} from './useSession';

/** "10 × 30.0", or an em dash where nothing was recorded — as design 14. */
const pair = (reps: number | null, weight: number | null): string => {
  if (reps === null) {
    return '—';
  }
  return weight === null ? `${reps}` : `${reps} × ${weight.toFixed(1)}`;
};

/** The same rows the day-detail ledger draws, from a live session. */
function ledgerRows(exercise: SessionExercise, unit: string): LedgerRow[] {
  return exercise.sets.map(set => {
    const comparison = compareSet(set);
    return {
      setNumber: set.setNumber,
      target: set.isUnplanned ? '—' : pair(set.targetReps, set.targetWeight),
      actual: pair(set.actualReps, set.actualWeight),
      result:
        comparison.status === 'skipped'
          ? 'Skipped'
          : describeComparison(comparison, unit),
      status: comparison.status,
    };
  });
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

export function TodayScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<TodayStackParamList>>();

  const {data: session, isPending: sessionPending} = useTodaySessionQuery();
  const {data: plan, isPending: planPending} = useTodayPlanQuery();
  const {data: settings} = useSettingsQuery();
  const unit = settings?.unit ?? 'kg';
  const start = useStartWorkout();
  const finish = useFinishWorkout();

  const now = Date.now();
  const weekday = weekdayIndex(new Date(now));
  const day = plan?.days[weekday];

  if (sessionPending || planPending) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  const frame = (children: React.ReactNode) => (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.xl},
      ]}>
      {children}
    </ScrollView>
  );

  // ---- The workout is already in progress (§20, design 08) ----------------
  if (session && session.status === 'in_progress') {
    const sets = session.exercises.flatMap(e => e.sets);
    const done = sets.filter(s => s.status === 'completed').length;
    const next = session.exercises.find(e => e.status === 'pending');

    return frame(
      <>
        <View style={styles.headerBlock}>
          <AppText variant="eyebrow" color="muted">
            {longDate(now)}
          </AppText>
          <AppText variant="h1">{session.dayName}</AppText>
        </View>

        <View style={[styles.banner, {backgroundColor: colors.plateSoft}]}>
          <AppText variant="eyebrow" color="plate">
            In progress
          </AppText>
          <View style={styles.bannerRow}>
            <AppText variant="display" color="plate">
              {String(done)}
            </AppText>
            <AppText variant="printed" color="muted">
              {`of ${sets.length} sets recorded`}
            </AppText>
          </View>
          <ProgressBar value={done} total={sets.length} label="Workout progress" />
        </View>

        <Button
          label="Continue workout"
          onPress={() => navigation.navigate('Workout')}
        />
        <Button
          label="Finish here"
          variant="secondary"
          disabled={finish.isPending}
          onPress={() => finish.mutate(session.id)}
        />

        {next ? (
          <>
            <AppText variant="eyebrow" color="muted">
              Where you stopped
            </AppText>
            <Card>
              <AppText variant="bodyStrong">{next.name}</AppText>
              <AppText variant="printed" color="muted">
                {`set ${
                  next.sets.findIndex(s => s.status === 'pending') + 1
                } of ${next.sets.length}`}
              </AppText>
            </Card>
          </>
        ) : null}

        {/* The shape of the day, before deciding whether to go back into it. */}
        <AppText variant="eyebrow" color="muted">
          The rest of it
        </AppText>
        <View style={styles.stack}>
          {session.exercises.map(exercise => {
            const recorded = exercise.sets.filter(
              s => s.status === 'completed',
            ).length;
            return (
              <Card key={exercise.id}>
                <View style={styles.line}>
                  <AppText
                    variant="bodyStrong"
                    color={exercise.status === 'pending' ? 'ink' : 'muted'}
                    style={styles.grow}>
                    {exercise.name}
                  </AppText>
                  <AppText variant="mono" color="ink2">
                    {`${recorded} / ${exercise.sets.length}`}
                  </AppText>
                </View>
              </Card>
            );
          })}
        </View>
      </>,
    );
  }

  // ---- Today is already done ---------------------------------------------
  //
  // Complaint 10: this used to be two numbers and a "See the summary" button.
  // The summary was one tap away on a screen with nothing else on it, which is
  // a layer for its own sake — so it is simply here, with the set-by-set
  // ledger under it and the full day a button away rather than the summary.
  if (session) {
    const sets = session.exercises.flatMap(e => e.sets);
    const done = sets.filter(s => s.status === 'completed').length;
    return frame(
      <>
        <View style={styles.headerBlock}>
          <AppText variant="eyebrow" color="muted">
            {longDate(now)}
          </AppText>
          <AppText variant="h1">{`${session.dayName} done`}</AppText>
          <AppText variant="small" color="muted">
            {`${done} of ${sets.length} sets recorded`}
          </AppText>
        </View>

        <SessionSummary session={session} unit={unit} />

        <AppText variant="eyebrow" color="muted">
          Every set
        </AppText>
        {session.exercises.map(exercise => (
          <View key={exercise.id} style={styles.block}>
            <AppText variant="printed" color="muted">
              {exercise.name}
            </AppText>
            <LedgerTable rows={ledgerRows(exercise, unit)} />
          </View>
        ))}

        <Button
          label="All exercises"
          variant="secondary"
          onPress={() =>
            // The full day lives on the History tab, so this crosses out of
            // the Today stack rather than duplicating that screen here.
            navigation
              .getParent<BottomTabNavigationProp<RootTabParamList>>()
              ?.navigate('History', {
                screen: 'DayDetail',
                params: {date: session.date},
              })
          }
        />
      </>,
    );
  }

  // ---- No plan at all (§40) ----------------------------------------------
  if (!plan || !day) {
    return frame(
      <View style={styles.blank}>
        <AppText variant="h2">No plan yet</AppText>
        <AppText variant="body" color="muted" style={styles.centred}>
          Build a weekly routine on the Plan tab, and today's workout will
          appear here.
        </AppText>
      </View>,
    );
  }

  // ---- Rest day (§33, design 07) -----------------------------------------
  if (day.isRestDay) {
    const tomorrow = plan.days[(weekday + 1) % 7]!;
    const tomorrowSets = tomorrow.exercises.reduce(
      (total, e) => total + e.sets.length,
      0,
    );
    return frame(
      <View style={styles.blank}>
        <AppText variant="eyebrow" color="muted">
          {longDate(now)}
        </AppText>
        <AppText variant="display">Rest day</AppText>
        <AppText variant="body" color="muted" style={styles.centred}>
          Nothing planned. Recovery counts as training.
        </AppText>
        <View style={styles.fullWidth}>
          <Card>
            <AppText variant="eyebrow" color="muted">
              Tomorrow
            </AppText>
            <AppText variant="bodyStrong">
              {tomorrow.isRestDay
                ? 'Rest day'
                : (tomorrow.customName ?? WEEKDAY_NAMES[tomorrow.weekday]!)}
            </AppText>
            {!tomorrow.isRestDay && tomorrow.exercises.length > 0 ? (
              <AppText variant="printed" color="muted">
                {`${plural(
                  tomorrow.exercises.length,
                  'exercise',
                  'exercises',
                )} · ${tomorrowSets} sets`}
              </AppText>
            ) : null}
          </Card>
        </View>
      </View>,
    );
  }

  // ---- Nothing planned for today -----------------------------------------
  if (day.exercises.length === 0) {
    return frame(
      <View style={styles.blank}>
        <AppText variant="eyebrow" color="muted">
          {longDate(now)}
        </AppText>
        <AppText variant="h2">
          {`${WEEKDAY_NAMES[weekday]} is not set up`}
        </AppText>
        <AppText variant="body" color="muted" style={styles.centred}>
          Add exercises to this day on the Plan tab, or mark it a rest day.
        </AppText>
      </View>,
    );
  }

  // ---- A workout waiting to be started (§12, design 06) ------------------
  const totalSets = day.exercises.reduce(
    (total, e) => total + e.sets.length,
    0,
  );

  return frame(
    <>
      <View style={styles.headerBlock}>
        <AppText variant="eyebrow" color="muted">
          {longDate(now)}
        </AppText>
        <AppText variant="h1">
          {day.customName ?? WEEKDAY_NAMES[weekday]!}
        </AppText>
        <AppText variant="small" color="muted">
          {`${plural(day.exercises.length, 'exercise', 'exercises')} · ${plural(
            totalSets,
            'set',
            'sets',
          )}`}
        </AppText>
      </View>

      <View style={styles.stack}>
        {day.exercises.map(exercise => (
          <Card key={exercise.plannedExerciseId}>
            <AppText variant="bodyStrong">{exercise.name}</AppText>
            {/* Printed type, because nothing has happened yet. */}
            <AppText variant="printed" color="muted">
              {`target ${targetLine(exercise.sets, unit)}`}
            </AppText>
          </Card>
        ))}
      </View>

      <Button
        label="Start workout"
        disabled={start.isPending}
        onPress={() =>
          start.mutate(undefined, {
            onSuccess: () => navigation.navigate('Workout'),
          })
        }
      />
    </>,
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
  block: {gap: space.sm},
  line: {flexDirection: 'row', alignItems: 'center', gap: space.md},
  grow: {flex: 1},
  stack: {gap: space.sm, marginBottom: space.sm},
  banner: {borderRadius: radius.md, padding: space.lg, gap: space.sm},
  bannerRow: {flexDirection: 'row', alignItems: 'baseline', gap: space.sm},
  blank: {alignItems: 'center', gap: space.sm, paddingTop: space.xxxl},
  centred: {textAlign: 'center'},
  fullWidth: {width: '100%', marginTop: space.md},
});

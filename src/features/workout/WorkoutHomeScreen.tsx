import React, {useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {Card} from '@/ui/Card';
import {IconButton} from '@/ui/IconButton';
import {ProgressBar} from '@/ui/ProgressBar';
import {ScrollFade, useScrollFade} from '@/ui/ScrollFade';
import {useTheme, space, radius} from '@/theme';
import {WEEKDAY_NAMES, weekdayIndex} from '@/domain/weekday';
import {targetLine} from '@/domain/format';
import {SessionCounts} from './SessionSummary';
import {SessionLedger} from './SessionLedger';
import {AmendSetSheet} from './AmendSetSheet';
import type {SessionSet} from '@/repositories/sessionRepo';
import {useSettingsQuery} from '@/features/settings/useSettings';
import {useCreatePlan} from '@/features/plan/usePlan';
import type {WorkoutStackParamList} from '@/navigation/types';
import {
  useTodaySessionQuery,
  useTodayPlanQuery,
  useStartWorkout,
  useFinishWorkout,
  useCompleteSet,
  useSkipSet,
} from './useSession';

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

export function WorkoutHomeScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const fade = useScrollFade();
  const navigation =
    useNavigation<NativeStackNavigationProp<WorkoutStackParamList>>();

  const {data: session, isPending: sessionPending} = useTodaySessionQuery();
  const {data: plan, isPending: planPending} = useTodayPlanQuery();
  const {data: settings} = useSettingsQuery();
  const unit = settings?.unit ?? 'kg';
  const createPlan = useCreatePlan();
  const start = useStartWorkout();
  const finish = useFinishWorkout();
  const correct = useCompleteSet();
  const skipSet = useSkipSet();

  /**
   * The set being corrected on a day that is already saved.
   *
   * completeSet has always overwritten regardless of the session status --
   * nothing in the data model was stopping this. Only the screens declined to
   * offer it, so a number typed wrong on Tuesday was wrong forever.
   */
  const [amending, setAmending] = useState<{
    set: SessionSet;
    performedExerciseId: string;
  } | null>(null);
  const amendingExercise = session?.exercises.find(
    e => e.id === amending?.performedExerciseId,
  );
  const amendingNumber = amendingExercise
    ? amendingExercise.sets.findIndex(s => s.id === amending?.set.id) + 1
    : 0;

  const now = Date.now();
  const weekday = weekdayIndex(new Date(now));
  const day = plan?.days[weekday];

  if (sessionPending || planPending) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  /**
   * Every state of this screen is wrapped in this, which is the point: the two
   * controls are drawn once here rather than six times below, so a state added
   * later cannot quietly ship without a way to reach the plan.
   *
   * History on the left and the plan on the right, either side of whatever the
   * day has to say — the past behind you, the routine ahead.
   */
  const frame = (children: React.ReactNode) => (
    <View style={[styles.root, {backgroundColor: colors.paper}]}>
      {/* Outside the ScrollView. These are the only two ways off this screen,
          and scrolling a long finished day used to carry them away — you had
          to scroll back up to reach the plan. */}
      <View style={[styles.bar, {paddingTop: insets.top + space.md}]}>
        <IconButton
          glyph="calendar"
          label="History"
          onPress={() => navigation.navigate('HistoryCalendar')}
        />
        {/* Nothing to open before a plan exists. The empty state below offers
            the whole action instead of a button that leads to another button. */}
        {plan ? (
          <IconButton
            glyph="plan"
            label="Weekly plan"
            onPress={() => navigation.navigate('PlanWeek')}
          />
        ) : null}
      </View>
      <View style={styles.scroller}>
        <ScrollView
          {...fade.scrollProps}
          contentContainerStyle={styles.content}>
          {children}
        </ScrollView>
        {/* Content ran out under the pinned bar on a hard line straight
            through a row of type, which reads as a rendering fault. Only
            while there is something under it: at rest it sat directly on the
            date line and half-erased it. */}
        <ScrollFade visible={fade.faded} />
      </View>
    </View>
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
          <ProgressBar
            value={done}
            total={sets.length}
            label="Workout progress"
          />
        </View>

        <Button
          label="Continue workout"
          onPress={() => navigation.navigate('Session')}
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

  // ---- the day is already done ---------------------------------------------
  //
  // Complaint 10 put the summary here rather than behind a button. It then
  // turned out to be too much of one: a percentage, four verdict chips and a
  // volume total are a report, and a report is something you go and look at
  // rather than something that should meet you on the way past. Two counts
  // answer the question you actually have standing here — did I do the work —
  // and the full report is still on the finish screen.
  //
  // The header used to carry "N of M sets recorded" as well. It counted bonus
  // sets where the card below does not, so the two disagreed three lines
  // apart; the card wins, because it names exercises in the same breath.
  if (session) {
    return frame(
      <>
        <View style={styles.headerBlock}>
          <AppText variant="eyebrow" color="muted">
            {longDate(now)}
          </AppText>
          <AppText variant="h1">{`${session.dayName} done`}</AppText>
        </View>

        <SessionCounts session={session} />

        <AppText variant="eyebrow" color="muted">
          Every set · tap one to correct it
        </AppText>
        {/* The same ledger the workout and the calendar draw, and the rows are
            live: a wrong number recorded on Tuesday used to be wrong forever,
            because no screen offered a way back in. */}
        <SessionLedger
          session={session}
          unit={unit}
          onSelectSet={(set, performedExerciseId) =>
            setAmending({set, performedExerciseId})
          }
        />

        <Button
          label="Edit workout"
          variant="secondary"
          // For the jobs a single correction cannot do — undoing a skip,
          // adding an exercise. The session stays completed; the focus screen
          // opens every set in amend mode, which is exactly right for a day
          // that is already saved.
          onPress={() => navigation.navigate('Session')}
        />
        <Button
          label="All exercises"
          variant="ghost"
          size="sm"
          // History is in this stack now, so the full day is a plain push
          // rather than a jump across tabs.
          onPress={() => navigation.navigate('DayDetail', {date: session.date})}
        />

        <AmendSetSheet
          visible={amending !== null}
          set={amending?.set ?? null}
          setNumber={amendingNumber}
          exerciseName={amendingExercise?.name ?? ''}
          weightApplicable={amendingExercise?.weightApplicable ?? false}
          unit={unit}
          increment={settings?.defaultIncrement ?? 0.5}
          busy={correct.isPending || skipSet.isPending}
          onSave={actuals => {
            if (amending) {
              correct.mutate(
                {setId: amending.set.id, ...actuals},
                {onSuccess: () => setAmending(null)},
              );
            }
          }}
          onSkip={() => {
            if (amending) {
              skipSet.mutate(amending.set.id, {
                onSuccess: () => setAmending(null),
              });
            }
          }}
          onClose={() => setAmending(null)}
        />
      </>,
    );
  }

  // ---- No plan at all (§40) ----------------------------------------------
  //
  // A first launch used to land here and describe what to press somewhere
  // else. It offers the thing itself now: one tap makes the week and opens it,
  // because "you have no plan" and "make a plan" are the same moment.
  if (!plan || !day) {
    return frame(
      <View style={styles.blank}>
        <AppText variant="h2">No plan yet</AppText>
        <AppText variant="body" color="muted" style={styles.centred}>
          Set up a weekly routine, then track what you actually lift against it.
        </AppText>
        <View style={styles.fullWidth}>
          <Button
            label="Create plan"
            disabled={createPlan.isPending}
            onPress={() =>
              createPlan.mutate(undefined, {
                // Straight into the week, because an empty plan is not the
                // destination — it is the first half of one action.
                onSuccess: () => navigation.navigate('PlanWeek'),
              })
            }
          />
        </View>
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
                : tomorrow.customName ?? WEEKDAY_NAMES[tomorrow.weekday]!}
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
          Add exercises to this day with the plan button above, or mark it a
          rest day.
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
            onSuccess: () => navigation.navigate('Session'),
          })
        }
      />
    </>,
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  scroller: {flex: 1},
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.xxxl,
    gap: space.md,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingBottom: space.sm,
  },
  headerBlock: {gap: 2, marginBottom: space.sm},
  line: {flexDirection: 'row', alignItems: 'center', gap: space.md},
  grow: {flex: 1},
  stack: {gap: space.sm, marginBottom: space.sm},
  banner: {borderRadius: radius.md, padding: space.lg, gap: space.sm},
  bannerRow: {flexDirection: 'row', alignItems: 'baseline', gap: space.sm},
  blank: {alignItems: 'center', gap: space.sm, paddingTop: space.xxxl},
  centred: {textAlign: 'center'},
  fullWidth: {width: '100%', marginTop: space.md},
});

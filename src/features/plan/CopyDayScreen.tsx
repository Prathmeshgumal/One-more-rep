import React, {useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Card} from '@/ui/Card';
import {Button} from '@/ui/Button';
import {BackButton} from '@/ui/BackButton';
import {useTheme, space} from '@/theme';
import {WEEKDAY_NAMES} from '@/domain/weekday';
import {copyDay} from '@/domain/planDraft';
import type {PlanDayView} from '@/repositories/planRepo';
import {usePlanQuery, useEditPlan} from './usePlan';

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

function describeDay(day: PlanDayView): string {
  if (day.isRestDay) {
    return 'Rest day';
  }
  if (day.exercises.length === 0) {
    return 'Not set up';
  }
  const name = day.customName ?? WEEKDAY_NAMES[day.weekday]!;
  return `${name} · ${plural(day.exercises.length, 'exercise', 'exercises')}`;
}

export function CopyDayScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {weekday} = useRoute().params as {weekday: number};

  const {data: plan} = usePlanQuery();
  const edit = useEditPlan();
  const [targets, setTargetDays] = useState<number[]>([]);

  const source = plan?.days[weekday];
  if (!plan || !source) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  const sourceName = source.customName ?? WEEKDAY_NAMES[weekday]!;
  const sourceSets = source.exercises.reduce(
    (total, e) => total + e.sets.length,
    0,
  );

  const toggle = (day: number) =>
    setTargetDays(current =>
      current.includes(day)
        ? current.filter(d => d !== day)
        : [...current, day],
    );

  const copy = () => {
    if (targets.length === 0) {
      return;
    }
    edit.mutate(draft => copyDay(draft, weekday, targets), {
      onSuccess: () => navigation.goBack(),
    });
  };

  return (
    <View style={[styles.root, {backgroundColor: colors.paper}]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {paddingTop: insets.top + space.xl},
        ]}>
        <BackButton />
        <View style={styles.headerBlock}>
          <AppText variant="eyebrow" color="muted">
            Copy from {WEEKDAY_NAMES[weekday]}
          </AppText>
          <AppText variant="h1">{sourceName}</AppText>
          <AppText variant="small" color="muted">
            {`${plural(source.exercises.length, 'exercise', 'exercises')} · ${plural(
              sourceSets,
              'set',
              'sets',
            )} · targets included`}
          </AppText>
        </View>

        <AppText variant="eyebrow" color="muted">
          Copy to
        </AppText>

        {plan.days
          .filter(day => day.weekday !== weekday)
          .map(day => {
            const picked = targets.includes(day.weekday);
            // Ochre, never red — a warning, not an error (design tokens).
            const willReplace = !day.isRestDay && day.exercises.length > 0;
            return (
              <Card key={day.weekday} onPress={() => toggle(day.weekday)}>
                <View style={styles.row}>
                  <View style={styles.grow}>
                    <AppText
                      variant="bodyStrong"
                      // The accessible name carries the action, so the test and
                      // a screen reader both address the row by what it does.
                      accessibilityLabel={`Copy to ${WEEKDAY_NAMES[day.weekday]}`}>
                      {WEEKDAY_NAMES[day.weekday]}
                    </AppText>
                    <AppText variant="small" color="muted">
                      {describeDay(day)}
                    </AppText>
                    {willReplace ? (
                      <AppText variant="monoSmall" color="short">
                        Replaces what's there now
                      </AppText>
                    ) : null}
                  </View>
                  <AppText variant="bodyStrong" color={picked ? 'plate' : 'faint'}>
                    {picked ? '✓' : '+'}
                  </AppText>
                </View>
              </Card>
            );
          })}
      </ScrollView>

      <View
        style={[
          styles.bar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.rule,
            paddingBottom: Math.max(insets.bottom, space.lg),
          },
        ]}>
        <Button
          label={`Copy to ${plural(targets.length, 'day', 'days')}`}
          onPress={copy}
          disabled={targets.length === 0 || edit.isPending}
        />
        <AppText variant="small" color="muted" style={styles.centred}>
          Only changes your plan from here on. Past workouts keep the targets
          they were done at.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.sm,
  },
  headerBlock: {gap: 2, marginBottom: space.sm},
  row: {flexDirection: 'row', alignItems: 'center', gap: space.md},
  grow: {flex: 1, gap: 2},
  bar: {
    borderTopWidth: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    gap: space.sm,
  },
  centred: {textAlign: 'center'},
});

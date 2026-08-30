import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {Card} from '@/ui/Card';
import {Toggle} from '@/ui/Toggle';
import {Stepper} from '@/ui/Stepper';
import {BackButton} from '@/ui/BackButton';
import {useTheme, space} from '@/theme';
import {setTargets, type DraftSet} from '@/domain/planDraft';
import {useSettingsQuery} from '@/features/settings/useSettings';
import {usePlanQuery, useEditPlan} from './usePlan';

/** 0 is a real weight nobody lifts; the field's empty state is NULL (section 9). */
const weightOrNull = (value: number): number | null =>
  value > 0 ? value : null;

export function TargetEditorScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {weekday, exerciseIndex} = useRoute().params as {
    weekday: number;
    exerciseIndex: number;
  };

  const {data: plan} = usePlanQuery();
  const {data: settings} = useSettingsQuery();
  const edit = useEditPlan();

  // Both were hard-coded here. The unit one was a real bug for anyone training
  // in pounds: the field said kg while the ledger row beside it said kg too,
  // and neither was what the rest of the app was using.
  const step = settings?.defaultIncrement ?? 0.5;
  const unit = settings?.unit ?? 'kg';
  const exercise = plan?.days[weekday]?.exercises[exerciseIndex];

  const [uniform, setUniform] = useState(true);
  const [sets, setSets] = useState<DraftSet[]>([]);
  const [editing, setEditing] = useState(0);
  const [populated, setPopulated] = useState(false);

  // Filled once. `exercise` is a fresh object on every refetch, so an
  // unguarded effect would discard edits in progress.
  useEffect(() => {
    if (!exercise || populated) {
      return;
    }
    const loaded = exercise.sets.map(s => ({
      targetReps: s.targetReps,
      targetWeight: s.targetWeight,
    }));
    setSets(loaded);
    const [first, ...rest] = loaded;
    setUniform(
      !first ||
        rest.every(
          s =>
            s.targetReps === first.targetReps &&
            s.targetWeight === first.targetWeight,
        ),
    );
    setPopulated(true);
  }, [exercise, populated]);

  if (!exercise || sets.length === 0) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  const current = sets[uniform ? 0 : editing] ?? sets[0]!;

  /** In uniform mode one edit lands on every set; otherwise on the chosen one. */
  const change = (patch: Partial<DraftSet>) =>
    setSets(list =>
      list.map((set, index) =>
        uniform || index === editing ? {...set, ...patch} : set,
      ),
    );

  const changeCount = (count: number) =>
    setSets(list => {
      if (count < 1) {
        return list;
      }
      if (count <= list.length) {
        return list.slice(0, count);
      }
      const template = list[list.length - 1]!;
      return [
        ...list,
        ...Array.from({length: count - list.length}, () => ({...template})),
      ];
    });

  const save = () =>
    edit.mutate(draft => setTargets(draft, weekday, exerciseIndex, sets), {
      onSuccess: () => navigation.goBack(),
    });

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.xl},
      ]}
      keyboardShouldPersistTaps="handled">
      <BackButton />
      <View style={styles.headerBlock}>
        <AppText variant="eyebrow" color="muted">
          Target
        </AppText>
        <AppText variant="h1">{exercise.name}</AppText>
      </View>

      <Card>
        <Toggle
          label="Same target every set"
          hint="Turn off to set each set apart"
          value={uniform}
          onValueChange={next => {
            setUniform(next);
            if (next) {
              // Collapsing back: the first set becomes the shared target.
              const first = sets[0]!;
              setSets(list => list.map(() => ({...first})));
            }
            setEditing(0);
          }}
        />
      </Card>

      <View style={styles.field}>
        <AppText variant="eyebrow" color="muted">
          Sets
        </AppText>
        <Stepper
          label="Sets"
          unit="sets"
          value={sets.length}
          step={1}
          min={1}
          onChange={changeCount}
        />
      </View>

      {!uniform ? (
        <View style={styles.field}>
          <AppText variant="eyebrow" color="muted">
            Per-set targets
          </AppText>
          {sets.map((set, index) => (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`Edit set ${index + 1}`}
              onPress={() => setEditing(index)}
              style={[
                styles.ledgerRow,
                {borderBottomColor: colors.ruleSoft},
                index === editing && {backgroundColor: colors.surface2},
              ]}>
              <AppText variant="mono" color="muted" style={styles.setCol}>
                {index + 1}
              </AppText>
              <AppText variant="mono" style={styles.grow}>
                {set.targetReps}
              </AppText>
              <AppText variant="mono" style={styles.grow}>
                {set.targetWeight === null
                  ? '—'
                  : `${set.targetWeight.toFixed(1)} ${unit}`}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.field}>
        <AppText variant="eyebrow" color="muted">
          {uniform ? 'Every set' : `Set ${editing + 1}`}
        </AppText>
        {/* Half each. The Stepper no longer claims this for itself — in a
            column that claim collapsed it to nothing. */}
        <View style={styles.pair}>
          <View style={styles.half}>
            <Stepper
              label="Weight"
              unit={unit}
              value={current.targetWeight ?? 0}
              step={step}
              decimals={1}
              min={0}
              onChange={value => change({targetWeight: weightOrNull(value)})}
            />
          </View>
          <View style={styles.half}>
            <Stepper
              label="Reps"
              unit="reps"
              value={current.targetReps}
              step={1}
              min={1}
              onChange={value => change({targetReps: value})}
            />
          </View>
        </View>
      </View>

      <AppText variant="small" color="muted">
        Leave weight at zero for bodyweight movements — volume is skipped
        instead of logged as zero.
      </AppText>

      <Button label="Save target" onPress={save} disabled={edit.isPending} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  headerBlock: {gap: 2},
  field: {gap: space.sm},
  pair: {flexDirection: 'row', gap: space.md},
  half: {flex: 1},
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  setCol: {width: 28},
  grow: {flex: 1},
});

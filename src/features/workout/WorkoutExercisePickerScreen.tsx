import React, {useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Toggle} from '@/ui/Toggle';
import {Card} from '@/ui/Card';
import {Chip} from '@/ui/Chip';
import {SearchField} from '@/ui/SearchField';
import {BackButton} from '@/ui/BackButton';
import {useTheme, space} from '@/theme';
import {MUSCLE_FILTERS} from '@/features/exercises/muscles';
import {useDebounced} from '@/features/exercises/useDebounced';
import {useExerciseListQuery} from '@/features/exercises/useExercises';
import {weekdayIndex} from '@/domain/weekday';
import {addExercises} from '@/domain/planDraft';
import {useEditPlan} from '@/features/plan/usePlan';
import {useLastCreatedExercise} from '@/features/exercises/useLastCreatedExercise';
import type {WorkoutStackParamList} from '@/navigation/types';
import {useTodaySessionQuery, useAddExercise} from './useSession';
import {useSwapExercise} from './useSessionEditing';

/**
 * Adding one exercise mid-workout (§21, D3).
 *
 * Single-select and immediate, unlike the plan's picker: here you are adding
 * the one thing you just decided to do, and a selection step would be pure
 * friction with a barbell waiting.
 */
export function WorkoutExercisePickerScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<WorkoutStackParamList>>();

  const params = useRoute().params as
    | {mode?: 'add' | 'swap'; performedExerciseId?: string}
    | undefined;
  const isSwap = params?.mode === 'swap';

  const {data: session} = useTodaySessionQuery();
  const add = useAddExercise();
  const swap = useSwapExercise();
  const editPlan = useEditPlan();

  /**
   * U3. Adding an exercise mid-workout can also put it on the weekly plan, so
   * you never have to leave the workout to change next week — which is what
   * complaint 4 was actually reaching for.
   *
   * Off by default: today's decision is usually about today.
   */
  const [alsoPlan, setAlsoPlan] = useState(false);

  const swapping = isSwap
    ? session?.exercises.find(e => e.id === params?.performedExerciseId)
    : undefined;

  const openEditor = () =>
    navigation.navigate('ExerciseEditor', {
      initialName: search.trim() || undefined,
    });

  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('All');
  const settledSearch = useDebounced(search, 250);
  const filter =
    MUSCLE_FILTERS.find(f => f.label === group) ?? MUSCLE_FILTERS[0]!;

  const {data: exercises} = useExerciseListQuery({
    search: settledSearch || undefined,
    muscles: filter.values.length ? filter.values : undefined,
  });

  /**
   * Unlike the plan's picker this one is single-select and immediate, so a
   * newly created exercise is used straight away rather than ticked — which
   * is the behaviour this screen already has for every other tap.
   */
  useFocusEffect(
    React.useCallback(() => {
      const created = useLastCreatedExercise.getState().claim();
      if (!created || !session) {
        return;
      }
      if (isSwap && params?.performedExerciseId) {
        swap.mutate(
          {
            performedExerciseId: params.performedExerciseId,
            newExerciseId: created,
          },
          {onSuccess: () => navigation.goBack()},
        );
        return;
      }
      add.mutate(
        {sessionId: session.id, exerciseId: created},
        {onSuccess: () => navigation.goBack()},
      );
      // Intentionally not reactive: this runs on the focus that follows the
      // editor closing, and re-running it when the session refetches would
      // add the same exercise twice.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.id]),
  );

  const header = (
    <View style={styles.header}>
      <BackButton />
      <AppText variant="eyebrow" color="muted">
        {isSwap ? 'Substitute' : 'Add to this workout'}
      </AppText>
      <AppText variant="h1">
        {swapping ? `Swap ${swapping.name} for…` : 'Pick an exercise'}
      </AppText>
      <AppText variant="small" color="muted">
        {isSwap
          ? 'Keeps this slot and its target, so it still counts against your plan.'
          : 'Added as bonus work — it never counts against your plan.'}
      </AppText>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search exercises"
      />
      {!isSwap ? (
        <Toggle
          label="Also add to the plan"
          hint="Puts it on this weekday for future weeks too"
          value={alsoPlan}
          onValueChange={setAlsoPlan}
        />
      ) : null}
      <View style={styles.chips}>
        {MUSCLE_FILTERS.map(f => (
          <Chip
            key={f.label}
            label={f.label}
            selected={group === f.label}
            onPress={() => setGroup(f.label)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.root, {backgroundColor: colors.paper}]}>
      <FlatList
        data={exercises ?? []}
        keyExtractor={item => item.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {paddingTop: insets.top + space.xl},
        ]}
        ListFooterComponent={
          <CreateExerciseCard search={search} onPress={openEditor} />
        }
        renderItem={({item}) => (
          <Card
            onPress={() => {
              if (!session || add.isPending || swap.isPending) {
                return;
              }
              if (isSwap && params?.performedExerciseId) {
                swap.mutate(
                  {
                    performedExerciseId: params.performedExerciseId,
                    newExerciseId: item.id,
                  },
                  {onSuccess: () => navigation.goBack()},
                );
                return;
              }
              add.mutate(
                {sessionId: session.id, exerciseId: item.id},
                {
                  onSuccess: () => {
                    if (!alsoPlan) {
                      navigation.goBack();
                      return;
                    }
                    // This forks a new plan version, because canEditInPlace
                    // refuses an in-place edit once a workout exists against
                    // one. That is correct: the running session keeps pointing
                    // at the old, now-closed version, which is exactly what
                    // stops today's workout from changing under §39. Anyone
                    // reading two rows in plan_versions later — that is why.
                    editPlan.mutate(
                      draft =>
                        addExercises(draft, weekdayIndex(new Date()), [
                          item.id,
                        ]),
                      {onSuccess: () => navigation.goBack()},
                    );
                  },
                },
              );
            }}>
            <AppText variant="bodyStrong">{item.name}</AppText>
            <AppText variant="small" color="muted">
              {item.equipment ?? 'No equipment'}
            </AppText>
            {!item.weightApplicable ? (
              <AppText variant="monoSmall" color="short">
                No weight
              </AppText>
            ) : null}
          </Card>
        )}
      />
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
  header: {gap: space.md, marginBottom: space.xs},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: space.sm},
});

/** The same escape hatch the plan's picker offers (complaint 5). */
function CreateExerciseCard({
  search,
  onPress,
}: {
  search: string;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress}>
      <AppText variant="bodyStrong" color="plate">
        {search.trim() === ''
          ? 'Create a new exercise'
          : `Create "${search.trim()}"`}
      </AppText>
      <AppText variant="small" color="muted">
        Adds it to your library, and to this workout
      </AppText>
    </Card>
  );
}

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
import {Card} from '@/ui/Card';
import {Chip} from '@/ui/Chip';
import {Button} from '@/ui/Button';
import {SearchField} from '@/ui/SearchField';
import {BackButton} from '@/ui/BackButton';
import {useTheme, space} from '@/theme';
import {WEEKDAY_NAMES} from '@/domain/weekday';
import {addExercises} from '@/domain/planDraft';
import {MUSCLE_FILTERS} from '@/features/exercises/muscles';
import {useDebounced} from '@/features/exercises/useDebounced';
import {useExerciseListQuery} from '@/features/exercises/useExercises';
import {useLastCreatedExercise} from '@/features/exercises/useLastCreatedExercise';
import type {PlanStackParamList} from '@/navigation/types';
import {usePlanQuery, useEditPlan} from './usePlan';

export function ExercisePickerScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<PlanStackParamList>>();
  const {weekday} = useRoute().params as {weekday: number};

  const {data: plan} = usePlanQuery();
  const edit = useEditPlan();

  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('All');
  // Selection is a list, not a set on the visible rows: it has to survive the
  // filter changing, or building a day across two searches loses half of it.
  const [selected, setSelected] = useState<string[]>([]);

  const settledSearch = useDebounced(search, 250);
  const filter =
    MUSCLE_FILTERS.find(f => f.label === group) ?? MUSCLE_FILTERS[0]!;
  const {data: exercises} = useExerciseListQuery({
    search: settledSearch || undefined,
    muscles: filter.values.length ? filter.values : undefined,
  });

  const dayName =
    plan?.days[weekday]?.customName ?? WEEKDAY_NAMES[weekday] ?? '';

  // An exercise created from here arrives already chosen, so making one is not
  // followed by having to find it.
  useFocusEffect(
    React.useCallback(() => {
      const created = useLastCreatedExercise.getState().claim();
      if (created) {
        setSelected(current =>
          current.includes(created) ? current : [...current, created],
        );
      }
    }, []),
  );

  const toggle = (id: string) =>
    setSelected(current =>
      current.includes(id) ? current.filter(x => x !== id) : [...current, id],
    );

  const openEditor = () =>
    navigation.navigate('ExerciseEditor', {
      initialName: search.trim() || undefined,
    });

  const add = () => {
    if (selected.length === 0) {
      return;
    }
    edit.mutate(draft => addExercises(draft, weekday, selected), {
      onSuccess: () => navigation.goBack(),
    });
  };

  const header = (
    <View style={styles.header}>
      <BackButton />
      <AppText variant="eyebrow" color="muted">
        Add to {dayName}
      </AppText>
      <AppText variant="h1">Pick exercises</AppText>
      <AppText variant="small" color="muted">
        {selected.length} selected
      </AppText>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search exercises"
      />
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
        ListHeaderComponent={
          <>
            {header}
            {(exercises?.length ?? 0) === 0 ? (
              <CreateExerciseCard search={search} onPress={openEditor} />
            ) : null}
          </>
        }
        ListFooterComponent={
          (exercises?.length ?? 0) === 0 ? (
            <View />
          ) : (
            <CreateExerciseCard search={search} onPress={openEditor} />
          )
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {paddingTop: insets.top + space.xl},
        ]}
        renderItem={({item}) => {
          const isPicked = selected.includes(item.id);
          return (
            <Card onPress={() => toggle(item.id)}>
              <View style={styles.row}>
                <View style={styles.grow}>
                  <AppText variant="bodyStrong">{item.name}</AppText>
                  <AppText variant="small" color="muted">
                    {item.equipment ?? 'No equipment'}
                  </AppText>
                  {!item.weightApplicable ? (
                    <AppText variant="monoSmall" color="short">
                      No weight
                    </AppText>
                  ) : null}
                </View>
                <AppText
                  variant="bodyStrong"
                  color={isPicked ? 'plate' : 'faint'}>
                  {isPicked ? '✓' : '+'}
                </AppText>
              </View>
            </Card>
          );
        }}
      />
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
          label={`Add ${selected.length} ${
            selected.length === 1 ? 'exercise' : 'exercises'
          }`}
          onPress={add}
          disabled={selected.length === 0 || edit.isPending}
        />
        <AppText variant="small" color="muted" style={styles.centred}>
          Added at 3 × 10 — set the real targets next
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
  header: {gap: space.md, marginBottom: space.xs},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: space.sm},
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

/**
 * The way out of "it is not in the library" (complaint 5).
 *
 * Sits at the top when the search found nothing — that is the moment you know
 * you need it — and at the foot otherwise, where it is available without
 * competing with the results.
 */
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
        Adds it to your library, and to this list
      </AppText>
    </Card>
  );
}

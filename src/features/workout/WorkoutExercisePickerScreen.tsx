import React, {useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Card} from '@/ui/Card';
import {Chip} from '@/ui/Chip';
import {SearchField} from '@/ui/SearchField';
import {BackButton} from '@/ui/BackButton';
import {useTheme, space} from '@/theme';
import {MUSCLE_FILTERS} from '@/features/exercises/muscles';
import {useDebounced} from '@/features/exercises/useDebounced';
import {useExerciseListQuery} from '@/features/exercises/useExercises';
import {useTodaySessionQuery, useAddExercise} from './useSession';

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
  const navigation = useNavigation();

  const {data: session} = useTodaySessionQuery();
  const add = useAddExercise();

  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('All');
  const settledSearch = useDebounced(search, 250);
  const filter =
    MUSCLE_FILTERS.find(f => f.label === group) ?? MUSCLE_FILTERS[0]!;

  const {data: exercises} = useExerciseListQuery({
    search: settledSearch || undefined,
    muscles: filter.values.length ? filter.values : undefined,
  });

  const header = (
    <View style={styles.header}>
      <AppText variant="eyebrow" color="muted">
        Add to this workout
      </AppText>
      <AppText variant="h1">Pick an exercise</AppText>
      <AppText variant="small" color="muted">
        Added as bonus work — it never counts against your plan.
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
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {paddingTop: insets.top + space.xl},
        ]}
        renderItem={({item}) => (
          <Card
            onPress={() => {
              if (!session || add.isPending) {
                return;
              }
              add.mutate(
                {sessionId: session.id, exerciseId: item.id},
                {onSuccess: () => navigation.goBack()},
              );
            }}>
        <BackButton />
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

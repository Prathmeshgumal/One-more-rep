import React, {useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Card} from '@/ui/Card';
import {Chip} from '@/ui/Chip';
import {SearchField} from '@/ui/SearchField';
import {useTheme, space} from '@/theme';
import type {Exercise} from '@/repositories/exerciseRepo';
import type {ExercisesStackParamList} from '@/navigation/types';
import {MUSCLE_FILTERS} from './muscles';
import {useExerciseListQuery} from './useExercises';

/** "Chest · Shoulders — Cable", matching the design's exmeta line. */
function summarise(exercise: Exercise): string {
  const muscles = [exercise.primaryMuscle, ...exercise.secondaryMuscles]
    .map(m => m.charAt(0).toUpperCase() + m.slice(1))
    .join(' · ');
  return exercise.equipment ? `${muscles} — ${exercise.equipment}` : muscles;
}

export function ExerciseListScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<ExercisesStackParamList>>();

  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('All');

  const selected =
    MUSCLE_FILTERS.find(f => f.label === group) ?? MUSCLE_FILTERS[0]!;

  const {data, isPending} = useExerciseListQuery({
    search: search || undefined,
    muscles: selected.values.length ? selected.values : undefined,
  });

  const header = (
    <View style={styles.header}>
      <AppText variant="eyebrow" color="muted">
        {isPending || !data
          ? 'Loading'
          : `${data.length} exercise${data.length === 1 ? '' : 's'}`}
      </AppText>
      <AppText variant="h1">Exercises</AppText>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search exercises"
      />

      <View style={styles.chips}>
        {MUSCLE_FILTERS.map(filter => (
          <Chip
            key={filter.label}
            label={filter.label}
            selected={group === filter.label}
            onPress={() => setGroup(filter.label)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.root, {backgroundColor: colors.paper}]}>
      <FlatList
        data={data ?? []}
        keyExtractor={item => item.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {paddingTop: insets.top + space.xl},
        ]}
        ListEmptyComponent={
          isPending ? undefined : (
            <AppText color="muted">
              No exercises match that. Try a different search, or create your
              own.
            </AppText>
          )
        }
        renderItem={({item}) => (
          <Card
            onPress={() => navigation.navigate('ExerciseDetail', {id: item.id})}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <AppText variant="bodyStrong">{item.name}</AppText>
                <AppText variant="small" color="muted">
                  {summarise(item)}
                </AppText>
              </View>
              {item.isCustom ? (
                <AppText variant="monoSmall" color="muted">
                  Custom
                </AppText>
              ) : null}
            </View>
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
    gap: space.md,
  },
  header: {gap: space.md, marginBottom: space.xs},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: space.sm},
  row: {flexDirection: 'row', alignItems: 'center', gap: space.md},
  grow: {flex: 1, gap: 2},
});

import React from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Card} from '@/ui/Card';
import {useTheme, space, radius} from '@/theme';
import type {ExercisesStackParamList} from '@/navigation/types';
import {useExerciseQuery} from './useExercises';

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Screen 19's field layout, read-only.
 *
 * The approved designs cover the library list and the create form but not a
 * detail view, and screen 18's cards are drawn as tappable — so one is needed.
 * This is that layout rendered read-only rather than a new invention; giving it
 * a design of its own is a Phase 5 item.
 */
export function ExerciseDetailScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<ExercisesStackParamList>>();
  const {id} = useRoute().params as {id: string};
  const {data: exercise, isPending} = useExerciseQuery(id);

  if (isPending || !exercise) {
    return (
      <View style={[styles.root, {backgroundColor: colors.paper}]}>
        <AppText color="muted" style={styles.placeholder}>
          {isPending ? 'Loading…' : 'That exercise no longer exists.'}
        </AppText>
      </View>
    );
  }

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.xl},
      ]}>
      <AppText variant="eyebrow" color="muted">
        {exercise.isCustom ? 'Custom' : titleCase(exercise.exerciseType)}
      </AppText>
      <AppText variant="h1">{exercise.name}</AppText>

      <Card>
        <View style={styles.row}>
          <AppText variant="small" color="muted">
            Primary muscle
          </AppText>
          <AppText variant="bodyStrong">
            {titleCase(exercise.primaryMuscle)}
          </AppText>
        </View>
        {exercise.secondaryMuscles.length > 0 ? (
          <View style={styles.row}>
            <AppText variant="small" color="muted">
              Also works
            </AppText>
            <AppText variant="body">
              {exercise.secondaryMuscles.map(titleCase).join(' · ')}
            </AppText>
          </View>
        ) : null}
        <View style={styles.row}>
          <AppText variant="small" color="muted">
            Equipment
          </AppText>
          <AppText variant="body">
            {exercise.equipment ? titleCase(exercise.equipment) : 'None'}
          </AppText>
        </View>
        <View style={styles.row}>
          <AppText variant="small" color="muted">
            Weight
          </AppText>
          <AppText variant="body">
            {exercise.weightApplicable ? 'Tracked' : 'Not tracked'}
          </AppText>
        </View>
      </Card>

      {exercise.instructions ? (
        <View style={styles.field}>
          <AppText variant="eyebrow" color="muted">
            How to do it
          </AppText>
          <AppText color="ink2">{exercise.instructions}</AppText>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() =>
          navigation.navigate('ExerciseHistory', {exerciseId: exercise.id})
        }
        style={[styles.edit, {borderColor: colors.rule}]}>
        <AppText variant="bodyStrong" color="plate">
          View history
        </AppText>
      </Pressable>

      {exercise.isCustom ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            navigation.navigate('ExerciseEditor', {id: exercise.id})
          }
          style={[styles.edit, {borderColor: colors.rule}]}>
          <AppText variant="bodyStrong" color="plate">
            Edit exercise
          </AppText>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  placeholder: {padding: space.xl},
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  field: {gap: space.sm},
  row: {gap: 2, paddingVertical: space.xs},
  edit: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: 'center',
  },
});

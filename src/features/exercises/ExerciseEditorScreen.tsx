import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, TextInput, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Chip} from '@/ui/Chip';
import {Card} from '@/ui/Card';
import {useTheme, type as typeScale, space, radius} from '@/theme';
import {useExerciseQuery} from './useExercises';
import {useCreateExercise, useUpdateExercise} from './useExerciseMutations';

/**
 * A short list, not the seventeen upstream muscle names: this is someone
 * typing in a gym, not cataloguing. Each label maps to the upstream value the
 * library filter already groups it under, so a custom exercise lands in the
 * same chip a built-in would.
 */
const MUSCLES = [
  {label: 'Chest', value: 'chest'},
  {label: 'Back', value: 'lats'},
  {label: 'Shoulders', value: 'shoulders'},
  {label: 'Biceps', value: 'biceps'},
  {label: 'Triceps', value: 'triceps'},
  {label: 'Legs', value: 'quadriceps'},
  {label: 'Glutes', value: 'glutes'},
  {label: 'Core', value: 'abdominals'},
] as const;

const EQUIPMENT = [
  {label: 'Machine', value: 'machine'},
  {label: 'Barbell', value: 'barbell'},
  {label: 'Dumbbell', value: 'dumbbell'},
  {label: 'Cable', value: 'cable'},
  {label: 'Bodyweight', value: 'body only'},
] as const;

export function ExerciseEditorScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const editingId = (route.params as {id?: string} | undefined)?.id;

  const {data: existing} = useExerciseQuery(editingId ?? '');
  const create = useCreateExercise();
  const update = useUpdateExercise();

  const [name, setName] = useState('');
  const [primaryMuscle, setPrimaryMuscle] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [weightApplicable, setWeightApplicable] = useState(true);
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editingId || !existing) {
      return;
    }
    setName(existing.name);
    setPrimaryMuscle(existing.primaryMuscle);
    setEquipment(existing.equipment);
    setWeightApplicable(existing.weightApplicable);
    setInstructions(existing.instructions ?? '');
  }, [editingId, existing]);

  const save = () => {
    if (!name.trim()) {
      setError('Give the exercise a name so you can find it later.');
      return;
    }
    if (!primaryMuscle) {
      setError('Pick the muscle this mainly works.');
      return;
    }
    setError(null);

    const input = {
      name,
      primaryMuscle,
      secondaryMuscles: [],
      equipment,
      weightApplicable,
      instructions: instructions.trim() || null,
    };

    const done = {onSuccess: () => navigation.goBack()};
    if (editingId) {
      update.mutate({id: editingId, patch: input}, done);
    } else {
      create.mutate(input, done);
    }
  };

  const inputStyle = [
    typeScale.body,
    styles.input,
    {
      color: colors.ink,
      backgroundColor: colors.surface,
      borderColor: colors.rule,
    },
  ];

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.xl},
      ]}
      keyboardShouldPersistTaps="handled">
      <AppText variant="eyebrow" color="muted">
        Custom
      </AppText>
      <AppText variant="h1">
        {editingId ? 'Edit exercise' : 'New exercise'}
      </AppText>

      <View style={styles.field}>
        <AppText variant="eyebrow" color="muted">
          Name
        </AppText>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Exercise name"
          placeholderTextColor={colors.faint}
          style={inputStyle}
        />
      </View>

      <View style={styles.field}>
        <AppText variant="eyebrow" color="muted">
          Primary muscle
        </AppText>
        <View style={styles.chips}>
          {MUSCLES.map(m => (
            <Chip
              key={m.value}
              label={m.label}
              selected={primaryMuscle === m.value}
              onPress={() => setPrimaryMuscle(m.value)}
            />
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <AppText variant="eyebrow" color="muted">
          Equipment
        </AppText>
        <View style={styles.chips}>
          {EQUIPMENT.map(e => (
            <Chip
              key={e.value}
              label={e.label}
              selected={equipment === e.value}
              onPress={() => setEquipment(e.value)}
            />
          ))}
        </View>
      </View>

      <Card>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Track weight"
          accessibilityState={{checked: weightApplicable}}
          onPress={() => setWeightApplicable(v => !v)}
          style={styles.toggleRow}>
          <View style={styles.grow}>
            <AppText variant="bodyStrong">Track weight</AppText>
            <AppText variant="small" color="muted">
              Turn this off for bodyweight movements. It decides whether this
              exercise ever counts towards volume.
            </AppText>
          </View>
          <View
            style={[
              styles.switch,
              {backgroundColor: weightApplicable ? colors.plate : colors.rule},
            ]}>
            <View
              style={[
                styles.knob,
                weightApplicable ? styles.knobOn : styles.knobOff,
                {backgroundColor: colors.surface},
              ]}
            />
          </View>
        </Pressable>
      </Card>

      <View style={styles.field}>
        <AppText variant="eyebrow" color="muted">
          Notes
        </AppText>
        <TextInput
          value={instructions}
          onChangeText={setInstructions}
          placeholder="Optional"
          placeholderTextColor={colors.faint}
          multiline
          style={[inputStyle, styles.multiline]}
        />
      </View>

      {error ? (
        <AppText variant="small" color="short">
          {error}
        </AppText>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={save}
        style={[styles.save, {backgroundColor: colors.plate}]}>
        <AppText variant="bodyStrong" color="plateInk">
          Save exercise
        </AppText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  field: {gap: space.sm},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: space.sm},
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  multiline: {minHeight: 88, textAlignVertical: 'top'},
  toggleRow: {flexDirection: 'row', alignItems: 'center', gap: space.md},
  grow: {flex: 1, gap: 2},
  switch: {
    width: 48,
    height: 28,
    borderRadius: radius.pill,
    padding: 3,
    justifyContent: 'center',
  },
  knob: {width: 22, height: 22, borderRadius: radius.pill},
  knobOn: {alignSelf: 'flex-end'},
  knobOff: {alignSelf: 'flex-start'},
  save: {
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: 'center',
    marginTop: space.sm,
  },
});

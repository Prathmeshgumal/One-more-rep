import React, {useEffect, useRef, useState} from 'react';
import {ScrollView, StyleSheet, TextInput, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Chip} from '@/ui/Chip';
import {Card} from '@/ui/Card';
import {Toggle} from '@/ui/Toggle';
import {Button} from '@/ui/Button';
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

  // Filled from the database exactly once. `existing` is a fresh object on
  // every refetch, so without this guard any refetch — an invalidation
  // elsewhere, a remount — would run the effect again and overwrite whatever
  // the user had typed since. Losing someone's edits mid-sentence is the kind
  // of bug that never reproduces on demand.
  const populated = useRef(false);

  useEffect(() => {
    if (!editingId || !existing || populated.current) {
      return;
    }
    populated.current = true;
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
        <Toggle
          label="Track weight"
          hint="Turn this off for bodyweight movements. It decides whether this exercise ever counts towards volume."
          value={weightApplicable}
          onValueChange={setWeightApplicable}
        />
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

      <Button label="Save exercise" onPress={save} />
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
});

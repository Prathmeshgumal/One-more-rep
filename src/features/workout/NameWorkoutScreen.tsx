import React, {useState} from 'react';
import {ScrollView, StyleSheet, TextInput, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {Chip} from '@/ui/Chip';
import {BackButton} from '@/ui/BackButton';
import {useTheme, space, radius, type as typeScale} from '@/theme';
import {WORKOUT_NAME_MAX_LENGTH} from '@/constants';
import type {WorkoutStackParamList} from '@/navigation/types';
import {useStartOpenWorkout} from './useSession';

/**
 * The names people actually give a session they did not plan.
 *
 * Offered as chips rather than left to the keyboard because the answer is
 * usually one of these, and typing "Push" standing in a gym with a phone in
 * one hand is four taps more than pressing it.
 */
const SUGGESTIONS = ['Push', 'Pull', 'Legs', 'Upper', 'Full body'] as const;

/**
 * Naming a workout that no plan describes.
 *
 * A screen of its own, and the only thing between the button and the first
 * set. The name goes into `day_name_snapshot`, which is what every history
 * screen calls the day forever afterwards — "Open workout" three Mondays
 * running is not a history worth keeping.
 *
 * Nothing is written until Start is pressed, so backing out of here leaves no
 * session behind and today is still an empty day.
 */
export function NameWorkoutScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<WorkoutStackParamList>>();
  const start = useStartOpenWorkout();

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const ready = trimmed.length > 0 && !start.isPending;

  const onStart = () => {
    if (!ready) {
      return;
    }
    setError(null);
    start.mutate(
      {name: trimmed},
      {
        // Replace, not navigate: the name screen has done its job, and leaving
        // it on the stack would put "what shall we call it" behind the back
        // gesture of a workout already being recorded.
        onSuccess: () => navigation.replace('Session'),
        onError: e =>
          setError(e instanceof Error ? e.message : 'Could not start.'),
      },
    );
  };

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.xl},
      ]}
      keyboardShouldPersistTaps="handled">
      <BackButton />
      <AppText variant="eyebrow" color="muted">
        No plan
      </AppText>
      <AppText variant="h1">Name this workout</AppText>
      <AppText variant="body" color="muted">
        So it reads as something in history, not just a date.
      </AppText>

      <View style={styles.field}>
        <AppText variant="eyebrow" color="muted">
          Workout name
        </AppText>
        <TextInput
          value={name}
          onChangeText={text => {
            setName(text);
            if (error) {
              setError(null);
            }
          }}
          placeholder="Arms & shoulders"
          placeholderTextColor={colors.faint}
          // The repository refuses past this; stopping the input here means it
          // never has to, which is the difference between a limit and an error.
          maxLength={WORKOUT_NAME_MAX_LENGTH}
          autoFocus
          returnKeyType="go"
          onSubmitEditing={onStart}
          style={[
            typeScale.body,
            styles.input,
            {
              color: colors.ink,
              backgroundColor: colors.surface,
              borderColor: trimmed ? colors.plate : colors.rule,
            },
          ]}
        />
      </View>

      <View style={styles.chips}>
        {SUGGESTIONS.map(suggestion => (
          <Chip
            key={suggestion}
            label={suggestion}
            selected={trimmed === suggestion}
            onPress={() => {
              setName(suggestion);
              setError(null);
            }}
          />
        ))}
      </View>

      <AppText variant="small" color="muted">
        Tap one, or type your own.
      </AppText>

      {error ? (
        <AppText variant="small" color="short">
          {error}
        </AppText>
      ) : null}

      <Button
        label="Start recording"
        disabled={!ready}
        onPress={onStart}
      />
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
});

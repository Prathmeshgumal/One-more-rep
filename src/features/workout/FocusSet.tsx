import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {AppText} from '@/ui/Text';
import {useTheme, space, radius, type ColorToken} from '@/theme';
import type {SetCursor} from './sessionCursor';

/** What the screen is doing, which is not what the set says about itself. */
export type FocusMode = 'live' | 'amending' | 'skipped';

/**
 * What this set was aiming at, in the words the screen uses.
 *
 * Exported because the number pad shows it too: opening the pad must not
 * change what you are being told about the set you are filling in.
 */
export function targetLabel(
  set: {targetReps: number | null; targetWeight: number | null},
  unit: string,
): string {
  return set.targetReps === null
    ? 'bonus set · no target'
    : `target ${set.targetReps}${
        set.targetWeight !== null ? ` × ${set.targetWeight} ${unit}` : ''
      }`;
}

/**
 * A stepper shoulder. 64dp for reps, 44dp for weight — reps change between
 * every set, weight changes between exercises, and the sizes say so.
 *
 * 44 rather than the 40 this started at: everything else in the app sits on
 * that floor, and a shoulder you miss with a chalked thumb costs more than the
 * four pixels saved.
 */
function Step({
  label,
  glyph,
  size,
  onPress,
}: {
  label: string;
  glyph: string;
  size: 44 | 64;
  onPress: () => void;
}) {
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.step,
        {
          width: size,
          height: size,
          borderRadius: size === 64 ? size / 2 : radius.md,
          backgroundColor: colors.surface,
          borderColor: colors.rule,
        },
      ]}>
      <AppText variant={size === 64 ? 'h1' : 'h2'} color="ink2">
        {glyph}
      </AppText>
    </Pressable>
  );
}

/**
 * One set, filling the screen.
 *
 * The 112px numeral is the whole argument for this flow: it is readable at
 * arm's length, lying on a bench, without your glasses. Nothing else in the
 * app can offer that, because nothing else gives one number the whole screen.
 *
 * Weight sits above it at a quarter of the size when the exercise takes one.
 * That hierarchy is deliberate — reps are what changes between sets, weight
 * is what changes when you move the pin.
 */
export function FocusSet({
  cursor,
  mode,
  reps,
  weight,
  unit,
  increment,
  previousLabel,
  onStepReps,
  onStepWeight,
  weightShown,
  onEditReps,
  onEditWeight,
  onAddWeight,
  onUndoSkip,
}: {
  cursor: SetCursor;
  mode: FocusMode;
  reps: number;
  weight: number | null;
  unit: string;
  increment: number;
  /** "last time 11", when there is a last time. */
  previousLabel: string | null;
  onStepReps: (delta: number) => void;
  onStepWeight: (delta: number) => void;
  /** Whether this set has a weight at all — see `weightInPlay`, plus one
      added during the session. */
  weightShown: boolean;
  /** Both numbers are pressable; these open the pad on one of them. */
  onEditReps: () => void;
  onEditWeight: () => void;
  /** Puts a weight on a set that had none. */
  onAddWeight: () => void;
  onUndoSkip: () => void;
}) {
  const {colors} = useTheme();
  const {set, exercise} = cursor;

  const numeralColor: ColorToken =
    mode === 'amending' ? 'short' : mode === 'skipped' ? 'skip' : 'ink';

  const target = targetLabel(set, unit);

  // Amending shows what is on record beside what you are changing it to, so
  // you can always see what you are moving away from.
  const caption =
    mode === 'amending' && set.actualReps !== null
      ? `${target} · recorded as ${set.actualReps}`
      : previousLabel
      ? `${target} · ${previousLabel}`
      : target;

  return (
    <View style={styles.body}>
      <AppText variant="printed" color="muted">
        {`Exercise ${cursor.exerciseNumber} of ${cursor.exerciseCount} · set ${cursor.setNumber} of ${cursor.setsInExercise}`}
      </AppText>
      <AppText variant="h1" style={styles.name} numberOfLines={2}>
        {exercise.name}
      </AppText>
      {/* The note itself, not just the fact that there is one. A pill that
          turns ochre tells you a note exists and then makes you open a sheet
          to find out what it says — which is the opposite of the point of
          writing "left shoulder tight" down in the first place. */}
      {exercise.notes ? (
        <View style={[styles.note, {borderLeftColor: colors.short}]}>
          <AppText variant="small" color="ink2" numberOfLines={3}>
            {exercise.notes}
          </AppText>
        </View>
      ) : null}

      {mode === 'skipped' ? (
        <>
          <AppText variant="display" color="skip" style={styles.skipped}>
            Skipped
          </AppText>
          <AppText variant="printed" color="faint" style={styles.target}>
            {set.targetReps === null
              ? 'a bonus set, left undone'
              : `target was ${set.targetReps} reps`}
          </AppText>
          <View
            style={[styles.flag, {backgroundColor: colors.skipSoft}]}
            accessible
            accessibilityLabel="A skipped set is not counted against you">
            <AppText variant="monoSmall" color="skip">
              not counted against you
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo skip"
            onPress={onUndoSkip}
            style={[styles.undo, {borderColor: colors.plate}]}>
            <AppText variant="bodyStrong" color="plate">
              Undo skip
            </AppText>
          </Pressable>
        </>
      ) : (
        <>
          {/* A bodyweight movement gets no weight control at all, rather than
              a zero in one — §26's rule, kept. The set has the casting vote:
              a plate planned onto a body-only movement is still a plate, and
              so is one picked up halfway through the session. */}
          {weightShown ? (
            <>
              <AppText variant="printed" color="faint" style={styles.loadLabel}>
                weight
              </AppText>
              <View style={styles.load}>
                <Step
                  label={`Decrease weight by ${increment} ${unit}`}
                  glyph="−"
                  size={44}
                  onPress={() => onStepWeight(-increment)}
                />
                {/* The value is the way in to typing it: 20 kg to 60 is
                    sixteen presses of a shoulder, done without looking. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Weight ${weight ?? 0} ${unit}`}
                  accessibilityHint="Type a weight"
                  onPress={onEditWeight}
                  style={[
                    styles.weight,
                    {
                      backgroundColor: colors.surface2,
                      borderColor: colors.rule,
                    },
                  ]}>
                  <AppText variant="h2">{String(weight ?? 0)}</AppText>
                  <AppText variant="monoSmall" color="muted">
                    {unit}
                  </AppText>
                </Pressable>
                <Step
                  label={`Increase weight by ${increment} ${unit}`}
                  glyph="＋"
                  size={44}
                  onPress={() => onStepWeight(increment)}
                />
              </View>
            </>
          ) : (
            /* The escape hatch. The catalogue's flag is about the movement in
               general and the plan's target was fixed when the workout
               started; neither knows you have just picked up a plate. This
               does, and it needs no trip to the plan and no edit to the
               catalogue. */
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add weight to this set"
              onPress={onAddWeight}
              style={[styles.addWeight, {borderColor: colors.rule}]}>
              <AppText variant="monoSmall" color="muted">
                ＋ add weight
              </AppText>
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${reps} reps`}
            accessibilityHint="Type a rep count"
            onPress={onEditReps}
            style={styles.numeral}>
            <AppText variant="focus" color={numeralColor}>
              {String(reps)}
            </AppText>
          </Pressable>
          <AppText variant="printed" color="muted">
            reps
          </AppText>
          <AppText variant="printed" color="faint" style={styles.target}>
            {caption}
          </AppText>

          {mode === 'amending' ? (
            <View style={[styles.flag, {backgroundColor: colors.shortSoft}]}>
              <AppText variant="monoSmall" color="short">
                amending a recorded set
              </AppText>
            </View>
          ) : null}

          <View style={styles.steps}>
            <Step
              label="One rep fewer"
              glyph="−"
              size={64}
              onPress={() => onStepReps(-1)}
            />
            <Step
              label="One rep more"
              glyph="＋"
              size={64}
              onPress={() => onStepReps(1)}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },
  step: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {marginTop: space.sm, textAlign: 'center'},
  note: {
    marginTop: space.md,
    borderLeftWidth: 2,
    paddingLeft: space.md,
    alignSelf: 'stretch',
  },
  addWeight: {
    marginTop: space.xl,
    height: 44,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadLabel: {marginTop: space.xl},
  load: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.sm,
  },
  weight: {
    minWidth: 118,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
  },
  /** 112px. The whole argument for this flow. */
  numeral: {marginTop: space.xl},
  skipped: {marginTop: space.xl},
  target: {marginTop: space.md, textAlign: 'center'},
  flag: {
    marginTop: space.md,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  steps: {flexDirection: 'row', gap: space.lg, marginTop: space.xxl},
  undo: {
    marginTop: space.xl,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.xxl,
  },
});

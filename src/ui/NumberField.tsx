import React, {useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, TextInput, View} from 'react-native';
import {useTheme, type as typeScale, space, radius} from '@/theme';
import {AppText} from './Text';

/**
 * Rounded to two decimals on every change. 2.5 + 2.5 + 2.5 is 7.5 in decimal
 * and 7.500000000000001 in binary floating point; without this, a few taps put
 * that into the database as somebody's target weight.
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

const EM_DASH = '—';

/**
 * One number you can either step or type (U5).
 *
 * The single implementation behind every weight and rep input in the app —
 * the plan's target editor and the set being recorded in a gym. Before this
 * there were two, and only one of them could be typed into.
 *
 * The field holds a **draft string**, not the number. Typing "37.5" passes
 * through "3", "37" and "37." on the way; parsing and writing back on each
 * keystroke would renormalise the text under the user's thumb and make the
 * decimal point impossible to type.
 */
export function NumberField({
  label,
  value,
  step,
  onChange,
  min,
  max,
  unit,
  decimals,
  size = 'field',
}: {
  /** Accessibility name, and the stem of both shoulder labels. */
  label: string;
  /** NULL prints an em dash — a bodyweight movement has no weight, not zero. */
  value: number | null;
  step: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  /**
   * Fixed decimal places. Omit for a count, which should read "3" and not
   * "3.0"; pass 1 for a weight, where the trailing digit is the difference
   * between 2.5 and 25 at a glance in a gym.
   */
  decimals?: number;
  size?: 'display' | 'field';
}) {
  const {colors} = useTheme();

  const printed =
    value === null
      ? EM_DASH
      : decimals === undefined
      ? String(value)
      : value.toFixed(decimals);

  // The draft is what is on screen while editing; `printed` is the truth. They
  // diverge only between the first keystroke and the blur.
  const [draft, setDraft] = useState<string | null>(null);
  const committed = useRef(printed);

  /**
   * The last number this field handed upwards.
   *
   * A controlled parent feeds every keystroke straight back, so `value` changes
   * *because of* the typing as well as independently of it, and the two cases
   * need opposite handling. Without this ref they are indistinguishable, and
   * the field renormalises its own draft mid-word: typing 57.5 over 62.5 gave
   * 5.1.5 in a test and 7.5 on the phone, because "5" came back as 5, printed
   * as "5.0", and the next character appended to that.
   */
  const emitted = useRef<number | null>(null);

  const emit = (next: number) => {
    emitted.current = next;
    onChange(next);
  };

  // A new active set hands this field a different number, and it has to follow
  // — otherwise the next set opens still showing the previous set's weight.
  // A draft in flight belongs to the old value and is dropped with it, unless
  // the "change" is only this field's own keystroke coming back around.
  useEffect(() => {
    if (committed.current === printed) {
      return;
    }
    committed.current = printed;
    if (value !== emitted.current) {
      setDraft(null);
    }
  }, [printed, value]);

  const clamp = (n: number): number => {
    if (min !== undefined && n < min) {
      return min;
    }
    if (max !== undefined && n > max) {
      return max;
    }
    return n;
  };

  const nudge = (delta: number) => {
    const next = round((value ?? 0) + delta);
    // Out of range is a no-op rather than a clamp: the shoulder has visibly
    // reached the end, and silently repeating the boundary value would fire a
    // write that changes nothing.
    if (min !== undefined && next < min) {
      return;
    }
    if (max !== undefined && next > max) {
      return;
    }
    setDraft(null);
    emit(next);
  };

  const type = (text: string) => {
    setDraft(text);
    if (text.trim() === '') {
      return;
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      return;
    }
    // A typed number is clamped rather than dropped. Someone who types 0 into
    // a field with a floor of 1 meant "as low as it goes", and rejecting the
    // keystroke outright leaves them staring at a field that will not take it.
    emit(clamp(round(parsed)));
  };

  /**
   * Whatever was half-typed is discarded and the real value redrawn — which is
   * also where the number is finally normalised, so 57.50 becomes 57.5 on the
   * way out rather than under the thumb.
   */
  const settle = () => {
    emitted.current = null;
    setDraft(null);
  };

  return (
    <View style={styles.field}>
      <TextInput
        accessibilityLabel={label}
        // Without this a screen reader announces the field's name but not what
        // is in it, which on a weight field is the only part that matters.
        accessibilityValue={{now: value ?? 0, text: printed}}
        value={draft ?? printed}
        keyboardType="decimal-pad"
        // Tapping a number to change it means replacing it, not appending to
        // it. Without this, tapping 20.0 and typing 60 gives 20.060.
        selectTextOnFocus
        onChangeText={type}
        onBlur={settle}
        onSubmitEditing={settle}
        style={[
          size === 'display' ? typeScale.display : typeScale.inkNum,
          styles.input,
          {color: colors.ink},
        ]}
      />
      {unit ? (
        <AppText variant="printed" color="muted">
          {unit}
        </AppText>
      ) : null}
      <View style={styles.shoulders}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          // The shoulder is drawn ~38px tall; the slop buys back the rest of a
          // 44px target without changing the design.
          hitSlop={space.sm}
          onPress={() => nudge(-step)}
          style={[styles.shoulder, {borderColor: colors.rule}]}>
          <AppText variant="bodyStrong" color="ink2">
            −
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          hitSlop={space.sm}
          onPress={() => nudge(step)}
          style={[styles.shoulder, {borderColor: colors.rule}]}>
          <AppText variant="bodyStrong" color="ink2">
            +
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {alignItems: 'center', gap: 2},
  input: {padding: 0, minWidth: 60, textAlign: 'center'},
  shoulders: {flexDirection: 'row', gap: space.sm, marginTop: space.sm},
  shoulder: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    alignItems: 'center',
  },
});

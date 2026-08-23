import React from 'react';
import {Pressable, StyleSheet, TextInput, View} from 'react-native';
import {useTheme, type as typeScale, space, radius} from '@/theme';
import {AppText} from './Text';

/**
 * A number with −/+ shoulders, from the design's target editor.
 *
 * Rounded to two decimals on every change. 2.5 + 2.5 + 2.5 is 7.5 in decimal
 * and 7.500000000000001 in binary floating point; without this, a few taps put
 * that into the database as somebody's target weight.
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function Stepper({
  label,
  value,
  step,
  onChange,
  min,
  max,
  unit,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const {colors} = useTheme();

  const nudge = (delta: number) => {
    const next = round(value + delta);
    if (min !== undefined && next < min) {
      return;
    }
    if (max !== undefined && next > max) {
      return;
    }
    onChange(next);
  };

  return (
    <View
      style={[
        styles.field,
        {backgroundColor: colors.surface, borderColor: colors.rule},
      ]}>
      <TextInput
        accessibilityLabel={label}
        value={String(value)}
        keyboardType="decimal-pad"
        onChangeText={text => {
          const parsed = Number(text);
          if (text.trim() !== '' && Number.isFinite(parsed)) {
            onChange(round(parsed));
          }
        }}
        style={[typeScale.inkNum, styles.input, {color: colors.ink}]}
      />
      <AppText variant="printed" color="muted">
        {unit ?? label}
      </AppText>
      <View style={styles.shoulders}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          onPress={() => nudge(-step)}
          style={[styles.shoulder, {borderColor: colors.rule}]}>
          <AppText variant="bodyStrong" color="ink2">
            −
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
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
  field: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
  },
  input: {padding: 0, minWidth: 60},
  shoulders: {flexDirection: 'row', gap: space.sm, marginTop: space.sm},
  shoulder: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    alignItems: 'center',
  },
});

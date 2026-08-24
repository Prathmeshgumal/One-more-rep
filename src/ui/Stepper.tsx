import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme, space, radius} from '@/theme';
import {NumberField} from './NumberField';

/**
 * A boxed number with −/+ shoulders, from the design's target editor.
 *
 * The number itself, its rounding and its keyboard all live in `NumberField`
 * now (U5) — this is the surround the plan screens draw around it, and the
 * name the rest of the app already calls it by.
 */
export function Stepper({
  label,
  value,
  step,
  onChange,
  min,
  max,
  unit,
  decimals,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  decimals?: number;
}) {
  const {colors} = useTheme();
  return (
    <View
      style={[
        styles.field,
        {backgroundColor: colors.surface, borderColor: colors.rule},
      ]}>
      <NumberField
        label={label}
        value={value}
        step={step}
        min={min}
        max={max}
        unit={unit ?? label}
        decimals={decimals}
        onChange={onChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
});

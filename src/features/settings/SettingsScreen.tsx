import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Screen} from '@/ui/Screen';
import {AppText} from '@/ui/Text';
import {useTheme, space, radius} from '@/theme';
import type {WeightUnit} from '@/db/schema';
import {useSettingsQuery, useUpdateSettings} from './useSettings';

const UNITS: ReadonlyArray<{value: WeightUnit; label: string}> = [
  {value: 'kg', label: 'Kilograms'},
  {value: 'lb', label: 'Pounds'},
];

export function SettingsScreen() {
  const {colors} = useTheme();
  const {data, isPending} = useSettingsQuery();
  const update = useUpdateSettings();

  return (
    <Screen title="Settings">
      <AppText variant="eyebrow" color="muted">
        Weight unit
      </AppText>
      <View style={styles.row}>
        {UNITS.map(({value, label}) => {
          const selected = data?.unit === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{selected, disabled: isPending}}
              disabled={isPending}
              onPress={() => update.mutate({unit: value})}
              style={[
                styles.option,
                {
                  borderColor: selected ? colors.plate : colors.rule,
                  backgroundColor: selected ? colors.plateSoft : colors.surface,
                },
              ]}>
              <AppText variant="bodyStrong" color={selected ? 'plate' : 'ink2'}>
                {label}
              </AppText>
              <AppText variant="monoSmall" color="muted">
                {value.toUpperCase()}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {data ? (
        <AppText variant="small" color="muted">
          Weights increase in steps of {data.defaultIncrement} {data.unit}.
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', gap: space.md},
  option: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.xs,
  },
});

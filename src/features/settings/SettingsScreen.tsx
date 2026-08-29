import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Screen} from '@/ui/Screen';
import {AppText} from '@/ui/Text';
import {useTheme, useThemeMode, space, radius} from '@/theme';
import type {ThemeMode, WeightUnit} from '@/db/schema';
import {APP_VERSION} from '@/constants';
import {useSettingsQuery, useUpdateSettings} from './useSettings';

const THEMES: ReadonlyArray<{value: ThemeMode; label: string; hint: string}> = [
  {value: 'system', label: 'System', hint: 'Follows your phone'},
  {value: 'light', label: 'Light', hint: 'Always light'},
  {value: 'dark', label: 'Dark', hint: 'Always dark'},
];

const UNITS: ReadonlyArray<{value: WeightUnit; label: string}> = [
  {value: 'kg', label: 'Kilograms'},
  {value: 'lb', label: 'Pounds'},
];

/**
 * U4. 0.5 is the smallest plate most gyms have; 5 is a plate a side on a
 * barbell. Anything outside this range is faster to type than to step to.
 */
const STEPS = [0.5, 1, 2.5, 5] as const;

/**
 * One choice in a row of them — the design's segmented control.
 *
 * `selected` is on `accessibilityState` rather than only in the colour,
 * because a border that changes hue is invisible to a screen reader and to
 * anyone who cannot separate those two blues.
 */
function Option({
  label,
  caption,
  selected,
  disabled,
  compact = false,
  onPress,
}: {
  label: string;
  caption: string;
  selected: boolean;
  disabled: boolean;
  compact?: boolean;
  onPress: () => void;
}) {
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{selected, disabled}}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.option,
        compact && styles.optionCompact,
        {
          borderColor: selected ? colors.plate : colors.rule,
          backgroundColor: selected ? colors.plateSoft : colors.surface,
        },
      ]}>
      <AppText
        variant={compact ? 'inkNum' : 'bodyStrong'}
        color={selected ? 'plate' : 'ink2'}>
        {compact ? label.replace('Step by ', '') : label}
      </AppText>
      <AppText variant="monoSmall" color="muted">
        {caption}
      </AppText>
    </Pressable>
  );
}

export function SettingsScreen() {
  const {data, isPending} = useSettingsQuery();
  const update = useUpdateSettings();
  const setMode = useThemeMode(state => state.setMode);

  return (
    <Screen title="Settings">
      <AppText variant="eyebrow" color="muted">
        Theme
      </AppText>
      <View style={styles.row}>
        {THEMES.map(({value, label, hint}) => (
          <Option
            key={value}
            label={label}
            caption={hint}
            selected={data?.themeMode === value}
            disabled={isPending}
            onPress={() => {
              // The store first, so the screen repaints under the finger. The
              // write is what makes it survive a relaunch; waiting on the
              // round trip to repaint would make the tap feel dropped.
              setMode(value);
              update.mutate({themeMode: value});
            }}
          />
        ))}
      </View>

      <AppText variant="eyebrow" color="muted">
        Weight unit
      </AppText>
      <View style={styles.row}>
        {UNITS.map(({value, label}) => (
          <Option
            key={value}
            label={label}
            caption={value.toUpperCase()}
            selected={data?.unit === value}
            disabled={isPending}
            onPress={() => update.mutate({unit: value})}
          />
        ))}
      </View>

      <AppText variant="eyebrow" color="muted">
        Weight step
      </AppText>
      <View style={styles.row}>
        {STEPS.map(step => (
          <Option
            key={step}
            compact
            label={`Step by ${step}`}
            caption={data?.unit ?? 'kg'}
            selected={data?.defaultIncrement === step}
            disabled={isPending}
            onPress={() => update.mutate({defaultIncrement: step})}
          />
        ))}
      </View>

      <AppText variant="small" color="muted">
        The − and + buttons move weight by this much. You can always tap a
        number and type it instead.
      </AppText>

      {/* So a bug report can name the build it came from. */}
      <AppText variant="monoSmall" color="faint" style={styles.version}>
        {`Version ${APP_VERSION}`}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', gap: space.md},
  version: {marginTop: space.xl},
  option: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.xs,
  },
  // Four across a phone leaves ~48px of content per option, so the generous
  // padding of a two-up row has to go or the numbers wrap.
  optionCompact: {paddingHorizontal: space.sm, paddingVertical: space.md},
});

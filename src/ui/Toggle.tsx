import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useTheme, space, radius} from '@/theme';
import {AppText} from './Text';

/**
 * A labelled switch. Extracted from ExerciseEditorScreen, where it was inlined.
 *
 * Selection is carried by `accessibilityState.checked` as well as by colour,
 * because a plate/rule contrast is not a state a screen reader can report.
 */
export function Toggle({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{checked: value}}
      onPress={() => onValueChange(!value)}
      style={styles.row}>
      <View style={styles.grow}>
        <AppText variant="bodyStrong">{label}</AppText>
        {hint ? (
          <AppText variant="small" color="muted">
            {hint}
          </AppText>
        ) : null}
      </View>
      <View
        style={[
          styles.track,
          {backgroundColor: value ? colors.plate : colors.rule},
        ]}>
        <View
          style={[
            styles.knob,
            value ? styles.knobOn : styles.knobOff,
            {backgroundColor: colors.surface},
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: space.md},
  grow: {flex: 1, gap: 2},
  track: {
    width: 48,
    height: 28,
    borderRadius: radius.pill,
    padding: 3,
    justifyContent: 'center',
  },
  knob: {width: 22, height: 22, borderRadius: radius.pill},
  knobOn: {alignSelf: 'flex-end'},
  knobOff: {alignSelf: 'flex-start'},
});

import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {AppText} from '@/ui/Text';
import {useTheme, space, radius} from '@/theme';

/**
 * The rows Settings is built from.
 *
 * What they replace was nine bordered option cards in a loose column, where
 * the exercise library — the one place on the page you actually go — was
 * drawn identically to a radio button for "kg". Grouping them into bounded
 * lists is what separates a destination from a choice: a chevron means
 * somewhere else, a control on the right means here.
 */
export function Group({children}: {children: React.ReactNode}) {
  const {colors} = useTheme();
  const rows = React.Children.toArray(children);
  return (
    <View
      style={[
        styles.group,
        {backgroundColor: colors.surface, borderColor: colors.rule},
      ]}>
      {rows.map((row, i) => (
        <View
          key={i}
          style={
            i === 0
              ? undefined
              : [styles.divided, {borderTopColor: colors.ruleSoft}]
          }>
          {row}
        </View>
      ))}
    </View>
  );
}

/** A row that goes somewhere. */
export function LinkRow({
  label,
  hint,
  onPress,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({pressed}) => [
        styles.row,
        pressed && {backgroundColor: colors.surface2},
      ]}>
      <View style={styles.grow}>
        <AppText variant="body">{label}</AppText>
        {hint ? (
          <AppText variant="small" color="muted">
            {hint}
          </AppText>
        ) : null}
      </View>
      <AppText variant="body" color="faint">
        ›
      </AppText>
    </Pressable>
  );
}

/** A row that only states something — the version, and nothing else so far. */
export function ValueRow({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.row}>
      <AppText variant="body" style={styles.grow}>
        {label}
      </AppText>
      <AppText variant="mono" color="muted">
        {value}
      </AppText>
    </View>
  );
}

/**
 * A row whose control is on it. Nothing here hides behind a sheet: these are
 * four settings, and a chooser you have to open to see is a worse trade than
 * 36dp of pill.
 */
export function ControlRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.control}>
      <AppText variant="body" style={styles.name}>
        {label}
      </AppText>
      <View style={styles.grow}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {borderWidth: 1, borderRadius: radius.md, overflow: 'hidden'},
  divided: {borderTopWidth: 1},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    minHeight: 48,
  },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    minHeight: 52,
  },
  // Fixed, so the controls in a group line up down the left edge instead of
  // stepping in and out with the length of each label.
  name: {width: 64},
  grow: {flex: 1},
});

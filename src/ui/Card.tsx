import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useTheme, space, radius} from '@/theme';

/**
 * The list row of the Ledger design: a bordered plate on the paper ground.
 *
 * A card without `onPress` renders as a plain View rather than a disabled
 * button, so a screen reader never announces a control that does nothing.
 */
export function Card({
  onPress,
  children,
}: {
  onPress?: () => void;
  children: React.ReactNode;
}) {
  const {colors} = useTheme();
  const style = [
    styles.card,
    {backgroundColor: colors.surface, borderColor: colors.ruleSoft},
  ];

  if (!onPress) {
    return <View style={style}>{children}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        style,
        pressed && {backgroundColor: colors.surface2},
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.xs,
  },
});

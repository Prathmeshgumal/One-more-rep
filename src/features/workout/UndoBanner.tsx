import React, {useEffect} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {AppText} from '@/ui/Text';
import {useTheme, space, radius} from '@/theme';

/** Long enough to notice a wrong number, short enough not to sit there. */
export const UNDO_WINDOW_MS = 4000;

/**
 * What just happened, and a way to take it back.
 *
 * On a list the row you touched stays in front of you, so a mistake is visible
 * and correctable at leisure. Here the screen is replaced by the next set the
 * instant you record one — the evidence leaves with it. This banner is the
 * only thing standing between a mis-tap and a wrong number you will not notice
 * until Thursday.
 */
export function UndoBanner({
  message,
  onUndo,
  onExpire,
}: {
  message: string;
  onUndo: () => void;
  /** Called once the window closes, so the caller can drop the snapshot. */
  onExpire: () => void;
}) {
  const {colors} = useTheme();

  // Keyed on the message by the caller, so a second record inside the window
  // restarts the timer against the new set rather than inheriting the old
  // one's remaining time.
  useEffect(() => {
    const timer = setTimeout(onExpire, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [onExpire]);

  return (
    <View
      style={[
        styles.banner,
        {backgroundColor: colors.gainSoft, borderColor: colors.gain},
      ]}>
      <AppText variant="monoSmall" color="gain" style={styles.message}>
        {message}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Undo"
        hitSlop={space.md}
        onPress={onUndo}>
        <AppText variant="eyebrow" color="gain">
          Undo
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    zIndex: 4,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  message: {flex: 1},
});

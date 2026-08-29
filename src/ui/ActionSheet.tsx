import React from 'react';
import {Modal, Pressable, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme, space, radius} from '@/theme';
import {AppText} from './Text';

export type SheetAction = {
  label: string;
  onPress: () => void;
  /**
   * A disabled action stays on the sheet and says why. Hiding it leaves
   * somebody hunting for a control that was there last time, and "not yet"
   * is more useful than "gone".
   */
  disabled?: boolean;
  reason?: string;
  /** Ochre. For the ones that end something, never for danger. */
  quiet?: boolean;
};

/**
 * A sheet of labelled actions, over RN's `Modal`.
 *
 * Built rather than imported: the app has one menu, and a dependency for it
 * would outweigh forty lines. Nothing here declares a colour of its own — it
 * all comes from the tokens, like the rest of the design.
 */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  actions: readonly SheetAction[];
  onClose: () => void;
}) {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Android's hardware back has to dismiss this, or the sheet becomes a
      // trap on the one gesture everybody reaches for first.
      onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={[styles.scrim, {backgroundColor: colors.board}]}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.rule,
            paddingBottom: Math.max(insets.bottom, space.lg),
          },
        ]}>
        <AppText variant="eyebrow" color="muted">
          {title}
        </AppText>

        {actions.map(action => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityState={{disabled: action.disabled === true}}
            disabled={action.disabled}
            onPress={() => {
              action.onPress();
              onClose();
            }}
            style={[styles.row, {borderTopColor: colors.ruleSoft}]}>
            <AppText
              variant="body"
              color={
                action.disabled ? 'faint' : action.quiet ? 'short' : 'ink'
              }>
              {action.label}
            </AppText>
            {action.disabled && action.reason ? (
              <AppText variant="small" color="short">
                {action.reason}
              </AppText>
            ) : null}
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {flex: 1, opacity: 0.6},
  sheet: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },
  row: {
    borderTopWidth: 1,
    paddingVertical: space.lg,
    gap: 2,
    // 44px minimum, for a thumb rather than a cursor.
    minHeight: 44,
    justifyContent: 'center',
  },
});

import React, {useEffect, useState} from 'react';
import {Modal, Pressable, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from './Text';
import {Button} from './Button';
import {useTheme, space, radius} from '@/theme';

/** A key is 64dp tall. Three columns, four rows, and nothing else. */
const KEY_HEIGHT = 64;

const BACKSPACE = '⌫';
const POINT = '.';

/**
 * Typing a number, rather than arriving at it.
 *
 * The steppers are right for a rep either side of the target and wrong for
 * everything else: moving from 20 kg to 60 is sixteen presses, and the last
 * eight are done without looking. So both numbers on the focus screen are
 * pressable, and this is what opens.
 *
 * Deliberately not a `TextInput` with `keyboardType="numeric"`. Android's
 * keyboard takes the bottom third of the screen, which is exactly where the
 * Record button lives, so the field being filled in pushes away the button
 * that commits it. It also brings a suggestion strip, a layout shift and a
 * return key with opinions, onto a screen whose entire argument is that
 * nothing moves. A pad of twelve keys has none of that and can afford 64dp
 * targets, which the system keyboard cannot at this screen width.
 *
 * The incoming value is shown but not typed onto: the first key press
 * replaces it. Typing 6 into a field reading 42.5 has to give 6 — accumulating
 * would give 42.56, which is not a weight anyone meant.
 */
export function NumberPad({
  visible,
  title,
  value,
  unit = null,
  caption = null,
  allowDecimal = false,
  min = 0,
  max = 999,
  confirmLabel,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  /** What is being edited, as an eyebrow: "reps", "weight". */
  title: string;
  /** What the field holds now. Replaced by the first key press. */
  value: number;
  unit?: string | null;
  /** The target, or last time — the same line the focus screen shows. */
  caption?: string | null;
  allowDecimal?: boolean;
  min?: number;
  max?: number;
  /** Names the consequence: "Set 12 reps". */
  confirmLabel: (value: number) => string;
  onSubmit: (value: number) => void;
  onClose: () => void;
}) {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();

  // `null` is "still showing what it arrived with"; a string is what has been
  // typed since, which may be empty after a backspace.
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDraft(null);
    }
  }, [visible]);

  const press = (key: string) => {
    if (key === BACKSPACE) {
      setDraft(current => (current === null ? '' : current.slice(0, -1)));
      return;
    }
    setDraft(current => {
      // The replace-on-first-key rule. A decimal point typed first means the
      // number starts below one, so it needs the zero in front of it.
      if (current === null || current === '') {
        return key === POINT ? '0.' : key;
      }
      if (key === POINT && current.includes(POINT)) {
        return current;
      }
      // Six characters covers 999.75 — heavier than anything with a number on
      // it in a commercial gym, and past that it is a typo.
      return current.length >= 6 ? current : current + key;
    });
  };

  const typed = draft === null ? String(value) : draft;
  const parsed = typed === '' ? NaN : Number(typed);
  const whole = allowDecimal ? parsed : Math.round(parsed);
  const valid =
    Number.isFinite(parsed) &&
    !typed.endsWith(POINT) &&
    whole >= min &&
    whole <= max;

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [allowDecimal ? POINT : '', '0', BACKSPACE],
  ];

  const keyLabel = (key: string): string =>
    key === BACKSPACE ? 'Backspace' : key === POINT ? 'Decimal point' : key;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
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
            borderTopColor: colors.rule,
            paddingBottom: Math.max(insets.bottom, space.lg),
          },
        ]}>
        <View style={[styles.grab, {backgroundColor: colors.rule}]} />

        <AppText variant="eyebrow" color="muted">
          {title}
        </AppText>
        <View style={styles.readout}>
          <AppText
            variant="bignum"
            color={valid ? 'ink' : 'faint'}
            accessibilityLabel={`${title} ${typed === '' ? 'empty' : typed}`}>
            {typed === '' ? '—' : typed}
          </AppText>
          {unit ? (
            <AppText variant="h3" color="muted">
              {unit}
            </AppText>
          ) : null}
        </View>
        {caption ? (
          <AppText variant="printed" color="faint">
            {caption}
          </AppText>
        ) : null}

        <View style={styles.pad}>
          {keys.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {row.map((key, columnIndex) =>
                key === '' ? (
                  // The decimal key's place, held open so 0 stays under 8.
                  <View key={columnIndex} style={styles.spacer} />
                ) : (
                  <Pressable
                    key={columnIndex}
                    accessibilityRole="button"
                    accessibilityLabel={keyLabel(key)}
                    onPress={() => press(key)}
                    style={({pressed}) => [
                      styles.key,
                      {
                        backgroundColor: pressed
                          ? colors.plateSoft
                          : colors.surface2,
                        borderColor: colors.rule,
                      },
                    ]}>
                    <AppText variant="h2">{key}</AppText>
                  </Pressable>
                ),
              )}
            </View>
          ))}
        </View>

        <Button
          label={confirmLabel(whole)}
          disabled={!valid}
          onPress={() => onSubmit(whole)}
        />
        <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} />
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
    paddingTop: space.sm,
    gap: space.sm,
  },
  grab: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: space.xs,
  },
  readout: {flexDirection: 'row', alignItems: 'baseline', gap: space.sm},
  pad: {gap: space.sm, marginTop: space.sm, marginBottom: space.xs},
  row: {flexDirection: 'row', gap: space.sm},
  spacer: {flex: 1, height: KEY_HEIGHT},
  key: {
    flex: 1,
    height: KEY_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

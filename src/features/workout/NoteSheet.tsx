import React, {useEffect, useState} from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {useTheme, space, radius, type as typeScale} from '@/theme';
import {NOTE_MAX_LENGTH} from '@/constants';

/**
 * A note on one exercise, written on purpose.
 *
 * The field this replaces lived under the sets, committed on a debounce, and
 * on a full screen was usually below the fold — so it saved on unmount, on
 * blur and on a timer, because there was no reliable moment when the user had
 * finished with it. A sheet with a Save button has exactly that moment, which
 * removes three ways to lose what you typed.
 */
export function NoteSheet({
  visible,
  exerciseName,
  note,
  onSave,
  onClose,
}: {
  visible: boolean;
  exerciseName: string;
  note: string | null;
  onSave: (note: string | null) => void;
  onClose: () => void;
}) {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(note ?? '');
  const [keyboard, setKeyboard] = useState(0);
  const remaining = NOTE_MAX_LENGTH - draft.length;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e =>
      setKeyboard(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Reopening on a different exercise, or after a save, must not show the
  // previous one's text.
  useEffect(() => {
    if (visible) {
      setDraft(note ?? '');
    }
  }, [visible, note]);

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
            borderColor: colors.rule,
            paddingBottom:
              keyboard > 0
                ? keyboard + space.lg
                : Math.max(insets.bottom, space.lg),
          },
        ]}>
        <AppText variant="eyebrow" color="muted">
          {exerciseName}
        </AppText>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          autoFocus
          scrollEnabled
          placeholder="How did it feel? What did you change?"
          placeholderTextColor={colors.faint}
          accessibilityLabel="Note"
          maxLength={NOTE_MAX_LENGTH}
          style={[
            styles.field,
            typeScale.body,
            {
              color: colors.ink,
              backgroundColor: colors.surface2,
              borderColor: colors.rule,
            },
          ]}
        />
        {/* Silent until it is nearly relevant. A counter over a note that is
            twelve words long is noise about a limit nobody is near; the last
            fifth of the field is where knowing becomes worth the ink. */}
        {remaining <= NOTE_MAX_LENGTH / 5 ? (
          <AppText
            variant="printed"
            color={remaining <= 50 ? 'short' : 'faint'}
            style={styles.counter}>
            {remaining === 0
              ? 'that is the whole note'
              : `${remaining} characters left`}
          </AppText>
        ) : null}

        <View style={styles.actions}>
          <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} />
          <Button
            label="Save note"
            size="sm"
            // An empty field means no note, not a note that is empty: a blank
            // string would render as a stray line under the exercise.
            onPress={() => onSave(draft.trim() === '' ? null : draft.trim())}
          />
        </View>
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
    gap: space.md,
  },
  field: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    textAlignVertical: 'top',
  },
  counter: {textAlign: 'right', marginTop: -space.sm},
  actions: {flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm},
});

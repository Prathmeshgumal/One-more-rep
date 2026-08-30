import React from 'react';
import {Modal, Pressable, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {useTheme, space, radius} from '@/theme';
import {sessionVolume} from '@/domain/sessionProgress';
import type {Session} from '@/repositories/sessionRepo';

/** Whole minutes, because nobody cares that it was 42:37. */
const elapsed = (from: number, to: number): string => {
  const minutes = Math.max(0, Math.round((to - from) / 60000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
};

/**
 * Ending the workout, as a sheet over it rather than a screen after it.
 *
 * What this replaces was a whole pushed screen carrying a 56px percentage, a
 * completion bar, four verdict counts, volume, a warning and a Save button —
 * and then Today showed the same summary again the moment you landed. Two
 * screens and two taps to end a session, for information nobody acts on.
 *
 * Here the ledger stays visible behind the scrim, so the two numbers in the
 * sheet can be checked against the session they came from. The full report is
 * not deleted, only relocated: it belongs on the finished day, where you go to
 * read it.
 */
export function FinishSheet({
  visible,
  session,
  unit,
  busy = false,
  now = Date.now(),
  onSave,
  onClose,
}: {
  visible: boolean;
  session: Session;
  unit: string;
  busy?: boolean;
  now?: number;
  onSave: () => void;
  onClose: () => void;
}) {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();

  const sets = session.exercises.flatMap(e => e.sets);
  const done = sets.filter(s => s.status === 'completed').length;
  const pending = sets.filter(s => s.status === 'pending');
  const volume = sessionVolume(session.exercises);

  // Which exercises the unrecorded sets are actually on. "2 sets were never
  // recorded" leaves you hunting; naming them means the warning can be acted
  // on without dismissing it first.
  const strandedOn = session.exercises
    .filter(e => e.sets.some(s => s.status === 'pending'))
    .map(e => e.name);

  const facts = [
    `${done} of ${sets.length} recorded`,
    volume > 0 ? `${volume} ${unit} lifted` : null,
    elapsed(session.startedAt, now),
  ].filter(Boolean);

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
            paddingBottom: Math.max(insets.bottom, space.lg),
          },
        ]}>
        <View style={[styles.grab, {backgroundColor: colors.rule}]} />

        {/* States what happened rather than asking a question you did not
            initiate: the sheet arrives on its own after the last set. */}
        <AppText variant="h2">
          {pending.length === 0
            ? 'That was the last set.'
            : 'Finish this workout?'}
        </AppText>
        <AppText variant="small" color="muted">
          {facts.join(' · ')}
        </AppText>

        {pending.length > 0 ? (
          <View style={[styles.warn, {backgroundColor: colors.shortSoft}]}>
            <AppText variant="small" color="short">
              {`${pending.length} ${
                pending.length === 1 ? 'set' : 'sets'
              } on ${strandedOn.join(', ')} ${
                pending.length === 1 ? 'was' : 'were'
              } never recorded. Saving marks ${
                pending.length === 1 ? 'it' : 'them'
              } skipped.`}
            </AppText>
          </View>
        ) : null}

        <Button label="Save workout" disabled={busy} onPress={onSave} />
        {/* Not "Cancel". You are not cancelling anything — you are going back
            to a workout that is still running. */}
        <Button
          label="Go back in"
          variant="ghost"
          size="sm"
          onPress={onClose}
        />
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
    gap: space.md,
  },
  grab: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: space.xs,
  },
  warn: {borderRadius: radius.md, padding: space.md},
});

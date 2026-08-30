import React from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {useTheme, space, radius} from '@/theme';
import {SessionLedger} from './SessionLedger';
import type {Session} from '@/repositories/sessionRepo';

/**
 * The whole session, on demand.
 *
 * This is not optional. A focus flow's one real weakness is that you cannot
 * see the shape of your day — the rail carries more than its 4dp suggests, but
 * it cannot tell you that you were three reps short on set two. The peek
 * restores what the vertical ledger never lost, and it is worth being honest
 * that this is a gesture you have to know about standing in for information
 * that could simply have been on screen.
 *
 * It is the same `SessionLedger` the finished day and the calendar render, so
 * whichever flow this app ends up with, this component was never wasted.
 */
export function SessionPeek({
  visible,
  session,
  unit,
  liveSetId,
  onSelectSet,
  onClose,
}: {
  visible: boolean;
  session: Session;
  unit: string;
  liveSetId: string | null;
  onSelectSet: (setId: string) => void;
  onClose: () => void;
}) {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();

  const sets = session.exercises.flatMap(e => e.sets);
  const done = sets.filter(s => s.status === 'completed').length;

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
        <View style={[styles.grab, {backgroundColor: colors.rule}]} />
        <View style={styles.head}>
          <AppText variant="h2">{session.dayName}</AppText>
          <AppText variant="small" color="muted">
            {`${done} of ${sets.length} sets recorded · tap any set to go there`}
          </AppText>
        </View>
        <ScrollView>
          <SessionLedger
            session={session}
            unit={unit}
            liveSetId={liveSetId}
            onSelectSet={set => {
              onSelectSet(set.id);
              onClose();
            }}
          />
        </ScrollView>
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
    paddingTop: space.sm,
    // Never the whole screen: the set you were on stays visible behind it,
    // so the peek reads as a layer over the workout rather than a departure.
    maxHeight: '80%',
  },
  grab: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: space.md,
  },
  head: {paddingHorizontal: space.lg, paddingBottom: space.sm, gap: 2},
});

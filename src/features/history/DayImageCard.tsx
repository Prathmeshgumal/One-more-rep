import React from 'react';
import {StyleSheet, View} from 'react-native';
import {AppText} from '@/ui/Text';
import {palettes, type as typeScale, space} from '@/theme';
import {formatLongDate} from '@/domain/dateLabels';
import {groupDigits} from '@/domain/format';
import {sessionVolume} from '@/domain/sessionProgress';
import type {Session} from '@/repositories/sessionRepo';

/** The width the card is laid out at before it is rasterised. */
export const IMAGE_WIDTH = 1080;

/**
 * The picture of a finished day (complaint 8).
 *
 * Deliberately **always the light palette**, whatever the app's theme. This
 * image leaves the app: a dark PNG dropped onto somebody else's white chat
 * background reads as a bug, not as a style. It is the one place in the app
 * that reaches past `useTheme`, and that is the reason.
 *
 * Skipped sets are left out. "Skipped" is honest inside the app, where it is
 * the difference between a workout done and a workout claimed; in something
 * you send to a friend it is noise, and the sets that did happen are the
 * point.
 */
export function DayImageCard({
  session,
  unit,
}: {
  session: Session;
  unit: string;
}) {
  const ink = palettes.light;

  const performed = session.exercises
    .map(exercise => ({
      name: exercise.name,
      sets: exercise.sets.filter(
        s => s.status === 'completed' && s.actualReps !== null,
      ),
    }))
    .filter(e => e.sets.length > 0);

  const setCount = performed.reduce((n, e) => n + e.sets.length, 0);
  const volume = sessionVolume(session.exercises);

  return (
    <View style={[styles.card, {backgroundColor: ink.paper}]}>
      <AppText variant="eyebrow" color="muted" style={{color: ink.muted}}>
        ONE MORE REP
      </AppText>
      <AppText variant="printed" style={{color: ink.muted}}>
        {formatLongDate(session.date)}
      </AppText>
      <AppText variant="h1" style={[styles.title, {color: ink.ink}]}>
        {session.dayName}
      </AppText>

      <View style={[styles.rule, {backgroundColor: ink.rule}]} />

      {performed.map(exercise => (
        <View key={exercise.name} style={styles.block}>
          <AppText variant="bodyStrong" style={{color: ink.ink}}>
            {exercise.name}
          </AppText>
          {exercise.sets.map(set => (
            <View key={set.id} style={styles.line}>
              <AppText
                variant="mono"
                style={[styles.setNumber, {color: ink.faint}]}>
                {String(set.setNumber)}
              </AppText>
              <AppText variant="mono" style={{color: ink.ink2}}>
                {set.actualWeight === null
                  ? `${set.actualReps}`
                  : `${set.actualReps} × ${set.actualWeight.toFixed(1)}`}
              </AppText>
            </View>
          ))}
        </View>
      ))}

      <View style={[styles.rule, {backgroundColor: ink.rule}]} />

      <AppText variant="printed" style={{color: ink.muted}}>
        {volume > 0
          ? `${setCount} sets · ${groupDigits(volume)} ${unit}`
          : `${setCount} sets`}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: IMAGE_WIDTH,
    padding: space.xxxl * 2,
    gap: space.md,
  },
  title: {marginTop: space.xs},
  rule: {height: 2, marginVertical: space.lg},
  block: {gap: space.xs, marginBottom: space.lg},
  line: {flexDirection: 'row', alignItems: 'baseline', gap: space.lg},
  setNumber: {width: 40, ...typeScale.mono},
});

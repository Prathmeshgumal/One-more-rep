import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useRoute} from '@react-navigation/native';
import {Screen} from '@/ui/Screen';
import {Card} from '@/ui/Card';
import {StatGrid, type Stat} from '@/ui/StatGrid';
import {StatusChip} from '@/ui/StatusChip';
import {AppText} from '@/ui/Text';
import {space} from '@/theme';
import type {BestSet, SessionProgress} from '@/domain/exerciseProgress';
import {formatShortDate} from '@/domain/dateLabels';
import {groupDigits} from '@/domain/format';
import {useSettingsQuery} from '@/features/settings/useSettings';
import {useExerciseHistoryQuery} from './useHistory';

/** "30.0×10 · 30.0×10 · 32.5×8" — a session on one line (design 15). */
const setsLine = (session: SessionProgress): string =>
  session.sets
    .map(set =>
      set.weight === null ? `${set.reps}` : `${set.weight.toFixed(1)}×${set.reps}`,
    )
    .join(' · ');

/** "30.0 × 10" for a weighted lift, "15 reps" for a bodyweight one (§26). */
const bestSetLabel = (best: BestSet): string =>
  best.weight === null
    ? `${best.reps} reps`
    : `${best.weight.toFixed(1)} × ${best.reps}`;

/** Design 15: §24's progression, with §26's volume beside it. */
export function ExerciseHistoryScreen() {
  const {exerciseId} = useRoute().params as {exerciseId: string};
  const {data, isPending} = useExerciseHistoryQuery(exerciseId);
  const {data: settings} = useSettingsQuery();
  const unit = settings?.unit ?? 'kg';

  if (!data) {
    return (
      <Screen eyebrow="Exercise history" title={isPending ? '' : 'Not found'} />
    );
  }

  const {progress} = data;
  const stats: Stat[] = [];
  if (progress.bestSet) {
    stats.push({label: 'Best set', value: bestSetLabel(progress.bestSet)});
  }
  if (progress.bestVolume !== null) {
    stats.push({
      label: 'Best volume',
      value: `${groupDigits(progress.bestVolume)} ${unit}`,
    });
  }

  return (
    <Screen eyebrow="Exercise history" title={data.name}>
      {progress.sessions.length === 0 ? (
        <Card>
          <AppText color="muted">
            Nothing recorded for this exercise yet. It will appear here after
            the first time you train it.
          </AppText>
        </Card>
      ) : null}

      {progress.workingWeights.length > 0 ? (
        <Card>
          <AppText variant="printed" color="muted">
            Working weight
          </AppText>
          <View style={styles.run}>
            {progress.workingWeights.map((weight, index) => {
              const isLatest = index === progress.workingWeights.length - 1;
              return (
                <React.Fragment key={`${weight}-${index}`}>
                  {index > 0 ? (
                    <AppText variant="mono" color="faint">
                      →
                    </AppText>
                  ) : null}
                  <AppText
                    variant={isLatest ? 'inkNum' : 'mono'}
                    color={isLatest ? 'gain' : 'faint'}>
                    {weight.toFixed(1)}
                  </AppText>
                </React.Fragment>
              );
            })}
          </View>
        </Card>
      ) : null}

      {stats.length > 0 ? <StatGrid stats={stats} /> : null}

      {progress.sessions.length > 0 ? (
        <AppText variant="printed" color="muted">
          Sessions
        </AppText>
      ) : null}

      {progress.sessions.map(session => (
        <Card key={session.sessionId}>
          <View style={styles.row}>
            <AppText variant="printed" color="muted">
              {formatShortDate(session.date)}
            </AppText>
            {session.volume === null ? null : (
              <StatusChip
                // The best session so far is worth pointing at; the rest are
                // simply what happened.
                status={
                  session.volume === progress.bestVolume
                    ? 'exceeded'
                    : 'achieved'
                }
                label={`${groupDigits(session.volume)} ${unit}`}
              />
            )}
          </View>
          <AppText variant="monoSmall" color="ink2">
            {setsLine(session)}
          </AppText>
        </Card>
      ))}

      {progress.sessions.length > 0 ? (
        <AppText variant="caption" color="muted">
          Progression charts arrive after validation — the data is already being
          recorded for them.
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  run: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
});

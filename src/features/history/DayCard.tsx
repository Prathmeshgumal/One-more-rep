import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Card} from '@/ui/Card';
import {Hatch} from '@/ui/Hatch';
import {StatusChip} from '@/ui/StatusChip';
import {AppText} from '@/ui/Text';
import {useTheme, radius, space} from '@/theme';
import {formatDayLabel} from '@/domain/dateLabels';
import type {ResolvedDay} from '@/domain/dayResolver';
import type {ComparisonStatus} from '@/domain/setComparison';

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * The chip on the right of a timeline row.
 *
 * A finished workout with a skipped set says so rather than saying "Complete":
 * the design puts an ochre "1 skipped" there, because the honest headline for
 * that day is the thing that did not happen.
 */
function chipFor(
  day: ResolvedDay,
): {status: ComparisonStatus; label: string} | null {
  switch (day.status) {
    case 'completed':
      return day.skippedSets > 0
        ? {status: 'below', label: `${day.skippedSets} skipped`}
        : {status: 'achieved', label: 'Complete'};
    case 'partial':
      return {status: 'below', label: 'Partial'};
    case 'missed':
      return {status: 'below', label: 'Missed'};
    default:
      return null;
  }
}

/** A missed day names itself in ochre; a rest day recedes into muted. */
function nameColorFor(day: ResolvedDay): 'ink' | 'muted' | 'short' {
  if (day.status === 'rest') {
    return 'muted';
  }
  return day.status === 'missed' ? 'short' : 'ink';
}

function metaFor(day: ResolvedDay): string | null {
  switch (day.status) {
    case 'completed':
    case 'partial':
      return `${plural(day.exerciseCount, 'exercise')} · ${day.completedSets} of ${day.plannedSets} sets`;
    case 'missed':
      return 'Nothing recorded';
    case 'upcoming':
      return `${plural(day.exerciseCount, 'exercise')} · ${plural(day.plannedSets, 'set')}`;
    default:
      return null;
  }
}

/** One day of the §22 timeline, in each of the states the resolver produces. */
export function DayCard({
  day,
  onPress,
}: {
  day: ResolvedDay;
  onPress?: () => void;
}) {
  const {colors} = useTheme();
  const chip = chipFor(day);
  const meta = metaFor(day);
  const isRest = day.status === 'rest';
  const isMissed = day.status === 'missed';

  return (
    <View style={styles.wrapper}>
      <Card
        onPress={onPress}
        accessibilityHint={onPress ? 'Opens this day' : undefined}
        style={[
          isRest && styles.rest,
          isMissed && styles.missed,
          isMissed && {borderColor: colors.rule},
        ]}>
        {isRest ? <Hatch color={colors.surface2} /> : null}
        <View style={styles.row}>
          <View style={styles.text}>
            <AppText variant="printed" color="muted">
              {formatDayLabel(day.date)}
            </AppText>
            <AppText variant="bodyStrong" color={nameColorFor(day)}>
              {isRest ? 'Rest day' : (day.name ?? '')}
            </AppText>
            {meta ? (
              <AppText variant="monoSmall" color="muted">
                {meta}
              </AppText>
            ) : null}
          </View>
          {chip ? <StatusChip status={chip.status} label={chip.label} /> : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  // List cells do not inherit a container gap, so the row carries its own.
  wrapper: {marginBottom: space.sm},
  rest: {overflow: 'hidden', borderRadius: radius.md},
  // A day you owed and did not do is drawn as an outline, not a plate.
  missed: {borderStyle: 'dashed'},
  row: {flexDirection: 'row', alignItems: 'center', gap: space.md},
  text: {flex: 1, gap: space.xs},
});

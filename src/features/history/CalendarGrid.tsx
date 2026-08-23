import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {AppText} from '@/ui/Text';
import {useTheme, radius, space, type ColorToken} from '@/theme';
import type {CalendarCell} from '@/domain/calendarGrid';
import type {DayStatus} from '@/domain/dayResolver';
import {WEEKDAY_ABBR, weekdayName} from '@/domain/weekday';
import {formatLongDate} from '@/domain/dateLabels';

/** How each status paints, transcribed from `.cell.done` and its siblings. */
const TONE: Record<
  DayStatus,
  {
    fill: ColorToken | 'transparent';
    border: ColorToken;
    ink: ColorToken;
    dashed?: true;
  }
> = {
  completed: {fill: 'plate', border: 'plate', ink: 'plateInk'},
  partial: {fill: 'surface', border: 'short', ink: 'short'},
  missed: {fill: 'shortSoft', border: 'shortSoft', ink: 'short'},
  rest: {fill: 'surface', border: 'ruleSoft', ink: 'faint'},
  upcoming: {fill: 'transparent', border: 'rule', ink: 'faint', dashed: true},
  no_plan: {fill: 'surface', border: 'ruleSoft', ink: 'ink2'},
};

/** What a screen reader — and a test — reads off a cell. */
const SPOKEN: Record<DayStatus, string> = {
  completed: 'Completed',
  partial: 'Partial',
  missed: 'Missed',
  rest: 'Rest day',
  upcoming: 'To come',
  no_plan: 'No plan',
};

export const LEGEND: ReadonlyArray<{status: DayStatus; label: string}> = [
  {status: 'completed', label: 'Completed'},
  {status: 'partial', label: 'Partial'},
  {status: 'missed', label: 'Missed'},
  {status: 'rest', label: 'Rest'},
  {status: 'upcoming', label: 'To come'},
];

/** §23: one month, seven columns, Monday first. */
export function CalendarGrid({
  cells,
  onSelect,
}: {
  cells: readonly CalendarCell[];
  onSelect: (date: number) => void;
}) {
  const {colors} = useTheme();

  const paint = (status: DayStatus) => {
    const tone = TONE[status];
    return {
      backgroundColor:
        tone.fill === 'transparent' ? 'transparent' : colors[tone.fill],
      borderColor: colors[tone.border],
      borderStyle: tone.dashed ? ('dashed' as const) : ('solid' as const),
    };
  };

  return (
    <View>
      <View style={styles.grid}>
        {WEEKDAY_ABBR.map((abbr, index) => (
          <View key={abbr} style={styles.slot}>
            <AppText
              accessibilityLabel={weekdayName(index)}
              variant="printed"
              color="muted"
              style={styles.dow}>
              {abbr.slice(0, 1)}
            </AppText>
          </View>
        ))}

        {cells.map((cell, index) =>
          cell.kind === 'pad' ? (
            <View key={`pad-${index}`} style={styles.slot}>
              <View style={[styles.cell, styles.pad]}>
                <AppText variant="small" color="faint">
                  {cell.label}
                </AppText>
              </View>
            </View>
          ) : (
            <View key={cell.day.date} style={styles.slot}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${formatLongDate(cell.day.date)} — ${
                  SPOKEN[cell.day.status]
                }`}
                onPress={() => onSelect(cell.day.date)}
                style={[
                  styles.cell,
                  paint(cell.day.status),
                  cell.isToday && styles.today,
                  cell.isToday && {borderColor: colors.plate},
                ]}>
                <AppText variant="small" color={TONE[cell.day.status].ink}>
                  {cell.label}
                </AppText>
              </Pressable>
            </View>
          ),
        )}
      </View>

      <View style={styles.legend}>
        {LEGEND.map(entry => (
          <View key={entry.status} style={styles.legendItem}>
            <View style={[styles.swatch, paint(entry.status)]} />
            <AppText variant="monoSmall" color="muted">
              {entry.label}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  // Seven equal columns. The gutter is padding inside each slot rather than a
  // `gap` on the row, because a percentage width plus a gap overflows the
  // container and wraps six cells to a row instead of seven.
  slot: {width: '14.2857%', padding: 2.5},
  dow: {textAlign: 'center'},
  cell: {
    aspectRatio: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pad: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    opacity: 0.4,
  },
  today: {borderWidth: 2},
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    marginTop: space.md,
  },
  legendItem: {flexDirection: 'row', alignItems: 'center', gap: space.xs},
  swatch: {width: 10, height: 10, borderRadius: 3, borderWidth: 1},
});

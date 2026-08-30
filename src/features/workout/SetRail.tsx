import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useTheme, space, type ColorToken} from '@/theme';
import {toneForSet, type SetTone} from '@/ui/SetLine';
import type {SetCursor} from './sessionCursor';

const ACCENT: Record<SetTone, ColorToken> = {
  exceeded: 'gain',
  achieved: 'gain',
  below: 'short',
  bonus: 'gain',
  skipped: 'skip',
  pending: 'ruleSoft',
  live: 'plate',
  amending: 'short',
};

export const RAIL_HEIGHT = 18;

/**
 * The whole session as one tick per set, grouped by exercise.
 *
 * A focus flow's one real weakness is that you cannot see the shape of your
 * day. This carries more of it than its size suggests: how far through you
 * are, how each set went, and — through the 9dp gaps — where the exercise
 * boundaries fall. It is the only orientation on screen while you are lifting,
 * so every tick is also a tap target that jumps straight there.
 *
 * 4dp of height for eleven facts. The set row it replaces spent 94dp on one.
 */
export function SetRail({
  cursors,
  focusIndex,
  amending = false,
  onJump,
}: {
  cursors: readonly SetCursor[];
  focusIndex: number;
  /** Amending shows where you are *looking*, not where you are lifting. */
  amending?: boolean;
  onJump?: (index: number) => void;
}) {
  const {colors} = useTheme();

  // Grouped by exercise so the gaps mean something. Consecutive runs rather
  // than a map keyed by id: the same exercise never appears twice, and a run
  // keeps the rail in the order the session is actually performed.
  const groups: SetCursor[][] = [];
  for (const cursor of cursors) {
    const last = groups[groups.length - 1];
    if (last && last[0]!.exercise.id === cursor.exercise.id) {
      last.push(cursor);
    } else {
      groups.push([cursor]);
    }
  }

  return (
    <View style={styles.rail}>
      {groups.map(group => (
        <View
          key={group[0]!.exercise.id}
          // Proportional, not equal. A group given flex: 1 would draw five
          // ticks in the width another group spends on three, so the same set
          // would look bigger or smaller depending on which exercise it was
          // in. Every set is one set.
          style={[styles.group, {flex: group.length}]}>
          {group.map(cursor => {
            const focused = cursor.index === focusIndex;
            const tone = toneForSet({
              ...cursor.set,
              isLive: focused && !amending,
              isAmending: focused && amending,
            });
            const tick = (
              <View
                style={[
                  styles.tick,
                  focused && styles.focused,
                  {backgroundColor: colors[ACCENT[tone]]},
                ]}
              />
            );
            if (!onJump) {
              return (
                <View key={cursor.set.id} style={styles.slot}>
                  {tick}
                </View>
              );
            }
            return (
              <Pressable
                key={cursor.set.id}
                style={styles.slot}
                // The tick is 4dp tall; the touch target is the full rail.
                hitSlop={{top: 12, bottom: 12}}
                accessibilityRole="button"
                accessibilityLabel={`Go to set ${cursor.setNumber} of ${cursor.exercise.name}`}
                onPress={() => onJump(cursor.index)}>
                {tick}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    height: RAIL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: space.lg,
  },
  group: {flexDirection: 'row', alignItems: 'center', gap: 3},
  slot: {flex: 1, justifyContent: 'center'},
  tick: {height: 4, borderRadius: 2},
  /** The set you are on stands half again as tall, so it reads at a glance. */
  focused: {height: 6, borderRadius: 3},
});

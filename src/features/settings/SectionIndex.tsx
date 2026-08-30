import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import type {ScrollViewInstance} from 'react-native';
import {AppText} from '@/ui/Text';
import {useTheme, space, radius} from '@/theme';

/**
 * The row of chips pinned under the title, and the bookkeeping behind them.
 *
 * A section's position is not known until it has been laid out, so each one
 * reports its own `y` on mount and the index reads them back. Measuring
 * rather than assuming is what keeps the jumps right when a section grows —
 * and one of them will, the moment there is anything to say about your data.
 */
export function useSectionIndex<K extends string>(keys: readonly K[]) {
  const scroller = React.useRef<ScrollViewInstance>(null);
  const offsets = React.useRef<Partial<Record<K, number>>>({});
  const [active, setActive] = React.useState<K>(keys[0]!);

  const measure = React.useCallback(
    (key: K) => (y: number) => {
      offsets.current[key] = y;
    },
    [],
  );

  const jump = React.useCallback((key: K) => {
    setActive(key);
    scroller.current?.scrollTo({y: offsets.current[key] ?? 0, animated: true});
  }, []);

  /**
   * The chip follows the scroll as well as driving it, or the index would lie
   * the moment you scrolled by hand. A section counts as reached a little
   * before its top edge, so the heading you are reading is the one lit.
   *
   * A section still sitting at zero has not really been measured — every one
   * of them reports `0` on its first pass, before its siblings have taken up
   * any height. Counting those made the *last* section the one reached at a
   * scroll of nothing, which is how a freshly opened Settings opened with
   * `About` lit. Only the first section may honestly be at zero.
   */
  const onScrollY = React.useCallback(
    (y: number) => {
      let reached = keys[0]!;
      for (const key of keys) {
        const offset = offsets.current[key];
        if (offset === undefined || offset <= 0) continue;
        if (y >= offset - 48) reached = key;
      }
      setActive(current => (current === reached ? current : reached));
    },
    [keys],
  );

  return {scroller, active, jump, measure, onScrollY};
}

export function SectionIndex<K extends string>({
  sections,
  active,
  onJump,
}: {
  sections: ReadonlyArray<{key: K; label: string}>;
  active: K;
  onJump: (key: K) => void;
}) {
  const {colors} = useTheme();
  return (
    <>
      {sections.map(section => {
        const on = section.key === active;
        return (
          <Pressable
            key={section.key}
            accessibilityRole="button"
            accessibilityLabel={`Jump to ${section.label}`}
            accessibilityState={{selected: on}}
            // 30dp of pill plus 7 either side clears the 44dp floor without
            // making the bar tall enough to compete with the sections below.
            hitSlop={7}
            onPress={() => onJump(section.key)}
            style={[
              styles.chip,
              {
                borderColor: on ? colors.surface2 : colors.rule,
                backgroundColor: on ? colors.surface2 : colors.paper,
              },
            ]}>
            <AppText variant="small" color={on ? 'ink' : 'muted'}>
              {section.label}
            </AppText>
          </Pressable>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    // 30dp of pill inside a 44dp bar. A chip that met the floor on its own
    // would be a row of buttons, which is what the sections underneath are.
    minHeight: 30,
    justifyContent: 'center',
  },
});

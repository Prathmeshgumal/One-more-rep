import React from 'react';
import ReorderableList, {
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import {Pressable, StyleSheet, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useTheme, space} from '@/theme';

/**
 * The one place the app knows which drag library it uses.
 *
 * The library choice is not settled forever — the maintained option targets
 * Reanimated 4, but if it breaks the fallback is draggable-flatlist behind
 * this same interface. Screens import this, never the library.
 */
export function ReorderableRows<T>({
  data,
  keyOf,
  onReorder,
  renderRow,
}: {
  data: readonly T[];
  keyOf: (item: T) => string;
  onReorder: (from: number, to: number) => void;
  renderRow: (item: T) => React.ReactElement;
}) {
  return (
    <ReorderableList
      data={data as T[]}
      keyExtractor={item => keyOf(item)}
      onReorder={({from, to}: ReorderableListReorderEvent) => onReorder(from, to)}
      scrollEnabled={false}
      renderItem={({item}) => <Row>{renderRow(item)}</Row>}
    />
  );
}

/** A row plus the design's two-line drag handle, which starts the gesture. */
function Row({children}: {children: React.ReactElement}) {
  const {colors} = useTheme();
  const drag = useReorderableDrag();

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Drag to reorder"
        onLongPress={drag}
        hitSlop={space.md}>
        <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
          <Path
            d="M2 5h12M2 11h12"
            stroke={colors.faint}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </Svg>
      </Pressable>
      <View style={styles.grow}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Each row carries its own bottom gap rather than the parent spacing them.
  // These are list cells, so a `gap` on the container never reaches between
  // them — without this the cards sit flush against each other. It is a margin
  // rather than padding so the drag handle stays centred on the card, and it
  // travels with the row while it is being dragged.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.sm,
  },
  grow: {flex: 1},
});

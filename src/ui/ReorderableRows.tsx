import React from 'react';
import ReorderableList, {
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import {StyleSheet, View} from 'react-native';
import {space} from '@/theme';

/**
 * The one place the app knows which drag library it uses.
 *
 * The library choice is not settled forever — the maintained option targets
 * Reanimated 4, but if it breaks the fallback is draggable-flatlist behind
 * this same interface. Screens import this, never the library.
 *
 * `renderRow` is handed the `drag` function so the row itself decides what
 * starts the gesture. Nothing here draws a handle: the whole card is the
 * target, which is a bigger and more obvious one than a 14px grip.
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
  renderRow: (item: T, drag: () => void) => React.ReactElement;
}) {
  return (
    <ReorderableList
      data={data as T[]}
      keyExtractor={item => keyOf(item)}
      onReorder={({from, to}: ReorderableListReorderEvent) =>
        onReorder(from, to)
      }
      scrollEnabled={false}
      renderItem={({item}) => <Row item={item} renderRow={renderRow} />}
    />
  );
}

/**
 * Owns the gap between rows and nothing else.
 *
 * `useReorderableDrag` only works inside a cell, so the hook is called here and
 * the result passed outward rather than the row reaching for it.
 */
function Row<T>({
  item,
  renderRow,
}: {
  item: T;
  renderRow: (item: T, drag: () => void) => React.ReactElement;
}) {
  const drag = useReorderableDrag();
  return <View style={styles.row}>{renderRow(item, drag)}</View>;
}

const styles = StyleSheet.create({
  // Each row carries its own bottom gap rather than the parent spacing them.
  // These are list cells, so a `gap` on the container never reaches between
  // them — without this the cards sit flush against each other. It is a margin
  // rather than padding so it travels with the row while it is being dragged.
  row: {marginBottom: space.sm},
});

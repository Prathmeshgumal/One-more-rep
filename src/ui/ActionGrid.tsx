import React, {useEffect, useState} from 'react';
import {Modal, Pressable, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme, space, radius} from '@/theme';
import {AppText} from './Text';

export type GridAction = {
  /** The whole sentence. Announced, and used when the reason is explained. */
  label: string;
  /** What fits on a 111dp tile. */
  short: string;
  glyph: string;
  onPress: () => void;
  /**
   * An action stays on the grid whether or not it applies. Hiding it leaves
   * somebody hunting for a control that was there last time, and "not yet"
   * is more useful than "gone".
   */
  disabled?: boolean;
  reason?: string;
};

/** Three across, so nine tiles fill a square. */
const PER_ROW = 3;

/**
 * A sheet of actions as a grid of tiles rather than a column of rows.
 *
 * The list this replaces was eight identical rows of text in one
 * undifferentiated column, each one a 44dp-tall sliver of a 393dp screen —
 * fine for a cursor, wrong for a hand that is shaking slightly, three sets
 * into an exercise. These are 111 × 88, which is over five times the area,
 * and each one carries a glyph you can find without reading.
 *
 * The trade is that a tile has nowhere to print why an action is unavailable.
 * So an unavailable tile is still pressable — it explains itself into the line
 * below the grid instead of acting — and the last tile collects every reason
 * at once. A greyed control that does nothing at all when pressed is the one
 * thing worse than a greyed control.
 */
export function ActionGrid({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  actions: readonly GridAction[];
  onClose: () => void;
}) {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();

  /** `null` is the standing hint, `'*'` is every reason, else one label. */
  const [explaining, setExplaining] = useState<string | null>(null);

  // A sheet reopened must not still be showing what you asked last time.
  useEffect(() => {
    if (!visible) setExplaining(null);
  }, [visible]);

  const blocked = actions.filter(a => a.disabled && a.reason);

  const press = (action: GridAction) => {
    if (action.disabled) {
      setExplaining(action.label);
      return;
    }
    action.onPress();
    onClose();
  };

  const explained =
    explaining === '*' ? blocked : blocked.filter(a => a.label === explaining);

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
        <AppText variant="eyebrow" color="muted">
          {title}
        </AppText>

        <View style={styles.grid}>
          {actions.map(action => (
            <Tile
              key={action.label}
              action={action}
              onPress={() => press(action)}
            />
          ))}
          <Tile
            action={{
              label: 'Why are some greyed out?',
              short: 'Why?',
              glyph: '?',
              onPress: () => setExplaining('*'),
              disabled: blocked.length === 0,
              reason: 'Everything here is available right now',
            }}
            onPress={() =>
              setExplaining(
                blocked.length === 0 ? 'Why are some greyed out?' : '*',
              )
            }
          />
        </View>

        {/* The line the tiles cannot carry. Reserved whether or not anything
            is in it, so pressing a greyed tile does not shove the grid up
            the screen under your thumb. */}
        <View style={styles.explain}>
          {explained.length > 0 ? (
            explained.map(a => (
              <AppText key={a.label} variant="small" color="short">
                {`${a.label} — ${a.reason}`}
              </AppText>
            ))
          ) : (
            <AppText variant="printed" color="faint">
              {explaining !== null
                ? 'Everything here is available right now'
                : blocked.length === 0
                ? 'Everything here is available'
                : `${blocked.length} greyed out · tap one to see why`}
            </AppText>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Tile({action, onPress}: {action: GridAction; onPress: () => void}) {
  const {colors} = useTheme();
  const off = action.disabled === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      // Marked unavailable but not `disabled`, because the press is what
      // reveals the reason. Announced as dimmed either way.
      accessibilityState={{disabled: off}}
      onPress={onPress}
      style={({pressed}) => [
        styles.tile,
        {
          borderColor: colors.rule,
          // Dashed and unfilled, so an unavailable tile reads as an outline of
          // a control rather than as one you keep failing to press.
          borderStyle: off ? 'dashed' : 'solid',
          backgroundColor: off
            ? colors.surface
            : pressed
            ? colors.paper
            : colors.surface2,
        },
      ]}>
      <AppText variant="h2" color={off ? 'faint' : 'ink2'}>
        {action.glyph}
      </AppText>
      <AppText variant="small" color={off ? 'faint' : 'ink'}>
        {action.short}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {flex: 1, opacity: 0.6},
  sheet: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },
  grab: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginTop: -space.sm,
    marginBottom: space.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  tile: {
    // 353dp of content width less two 8dp gaps, three up: 112 each. The basis
    // is what puts three on a row; flexGrow spends the remainder evenly.
    flexGrow: 1,
    flexBasis: `${100 / PER_ROW - 3}%`,
    minHeight: 88,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.xs,
  },
  explain: {
    minHeight: 40,
    justifyContent: 'center',
    gap: 2,
    marginTop: space.md,
  },
});

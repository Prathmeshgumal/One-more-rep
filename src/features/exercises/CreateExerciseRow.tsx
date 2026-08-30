import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {AppText} from '@/ui/Text';
import {useTheme, space, radius} from '@/theme';

/**
 * The way out of a catalogue that does not have your movement in it.
 *
 * This existed in both pickers already, as the list's *footer* — under four
 * hundred exercises. It was reported as missing, which is the only honest
 * verdict on a control you have to scroll the entire library to reach. It is
 * pinned under the filters now, above the results, in both pickers.
 *
 * A row rather than the card it was: at the top of a list of cards, another
 * card reads as the first result, and the one thing this must not look like
 * is an exercise called "Create a new exercise". The dashed edge and the
 * plate ink say it is an action instead.
 *
 * It names what you typed, because the moment you need this is the moment a
 * search came back without your movement in it, and re-typing "Zercher Squat"
 * into the editor is a tax on already having said it once.
 */
export function CreateExerciseRow({
  search,
  /** What the new exercise gets added to besides the library. */
  destination,
  onPress,
}: {
  search: string;
  destination: string;
  onPress: () => void;
}) {
  const {colors} = useTheme();
  const typed = search.trim();
  const label = typed === '' ? 'Create a new exercise' : `Create "${typed}"`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({pressed}) => [
        styles.row,
        {
          borderColor: colors.plate,
          backgroundColor: pressed ? colors.plateSoft : colors.paper,
        },
      ]}>
      <AppText variant="h3" color="plate">
        ＋
      </AppText>
      <View style={styles.text}>
        <AppText variant="bodyStrong" color="plate" numberOfLines={1}>
          {label}
        </AppText>
        <AppText variant="small" color="muted">
          {`Adds it to your library, and to ${destination}`}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 56,
  },
  text: {flex: 1, gap: 2},
});

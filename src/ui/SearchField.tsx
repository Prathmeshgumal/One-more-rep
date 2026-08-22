import React from 'react';
import {Pressable, StyleSheet, TextInput, View} from 'react-native';
import {useTheme, type as typeScale, space, radius} from '@/theme';
import {AppText} from './Text';

/**
 * A single-line search input.
 *
 * The clear control is drawn rather than left to `clearButtonMode`, which is
 * iOS-only and would render nothing on the one platform this app ships on.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) {
  const {colors} = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        {backgroundColor: colors.surface, borderColor: colors.rule},
      ]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        autoCorrect={false}
        autoCapitalize="none"
        style={[typeScale.body, styles.input, {color: colors.ink}]}
      />
      {value.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={space.md}
          onPress={() => onChangeText('')}>
          <AppText variant="body" color="faint">
            ✕
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
  },
  input: {flex: 1, paddingVertical: space.md},
});

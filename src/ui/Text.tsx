import React from 'react';
import {Text as RNText, type TextProps} from 'react-native';
import {
  useTheme,
  type as typeScale,
  type TypeToken,
  type ColorToken,
} from '@/theme';

type Props = TextProps & {
  variant?: TypeToken;
  color?: ColorToken;
};

/**
 * Every piece of text in the app goes through this. That is what makes the
 * token rule enforceable: a component cannot set a font size or a colour
 * without reaching past this primitive, which review will catch.
 */
export function AppText({
  variant = 'body',
  color = 'ink',
  style,
  ...rest
}: Props) {
  const {colors} = useTheme();
  return (
    <RNText {...rest} style={[typeScale[variant], {color: colors[color]}, style]} />
  );
}

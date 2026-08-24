import React, {createContext, useContext, useMemo} from 'react';
import {useColorScheme} from 'react-native';
import {palettes, type Palette} from './tokens';
import {useThemeMode} from './useThemeMode';

type Theme = {colors: Palette; scheme: 'light' | 'dark'};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({children}: {children: React.ReactNode}) {
  // `useColorScheme` returns null until the OS has answered, so anything that
  // is not literally 'dark' is treated as light. Guessing dark would flash the
  // wrong palette on every cold start.
  const osScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const mode = useThemeMode(state => state.mode);
  const scheme = mode === 'system' ? osScheme : mode;

  const value = useMemo<Theme>(
    () => ({colors: palettes[scheme], scheme}),
    [scheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return theme;
}

import React, {createContext, useContext, useMemo} from 'react';
import {useColorScheme} from 'react-native';
import {palettes, type Palette} from './tokens';

type Theme = {colors: Palette; scheme: 'light' | 'dark'};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
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

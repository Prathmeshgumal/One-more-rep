import {create} from 'zustand';
import type {ThemeMode} from '@/db/schema';

/**
 * The chosen theme, mirrored out of SQLite.
 *
 * U9. `ThemeProvider` wraps `DatabaseGate` in `App.tsx`, and the gate calls
 * `useTheme()` to paint its own loading and failure screens — so the provider
 * cannot read this setting through React Query without the two depending on
 * each other.
 *
 * A zustand store has no provider, so it can be written from inside the gate
 * and read from above it. The database stays the source of truth; this is a
 * one-way mirror of it, hydrated once on launch and written again whenever the
 * user picks a different mode.
 */
type ThemeModeState = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

export const useThemeMode = create<ThemeModeState>(set => ({
  // 'system' until the database says otherwise. An install that has never
  // expressed a preference should follow the phone.
  mode: 'system',
  setMode: mode => set({mode}),
}));

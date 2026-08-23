import type {TextStyle} from 'react-native';

/**
 * The Ledger design system (D13). Values are transcribed from
 * docs/design/screens.html; the rationale lives in docs/design/README.md.
 *
 * Nothing outside this file may declare a colour or a font size.
 */
export const palettes = {
  light: {
    paper: '#EDEFF2',
    board: '#E4E7EC',
    surface: '#FFFFFF',
    surface2: '#F5F7F9',
    ink: '#12161B',
    ink2: '#3D4650',
    muted: '#6B7684',
    faint: '#98A2AE',
    rule: '#D3D9E0',
    ruleSoft: '#E6EAEF',
    plate: '#1B4FD8',
    plateInk: '#FFFFFF',
    plateSoft: '#E7EDFC',
    gain: '#17724A',
    gainSoft: '#E1F1E9',
    short: '#A56A12',
    shortSoft: '#F7EFDD',
    skip: '#8A93A0',
    skipSoft: '#EDEFF2',
  },
  dark: {
    paper: '#0C0F13',
    board: '#080A0D',
    surface: '#161B21',
    surface2: '#1D242C',
    ink: '#E8ECF1',
    ink2: '#B7C0CB',
    muted: '#8590A0',
    faint: '#6A7482',
    rule: '#2A323C',
    ruleSoft: '#212831',
    plate: '#5B87FF',
    plateInk: '#08122B',
    plateSoft: '#16233F',
    gain: '#35B57C',
    gainSoft: '#10281F',
    short: '#D69B3C',
    shortSoft: '#2A2114',
    skip: '#6C7683',
    skipSoft: '#1D242C',
  },
} as const;

export type ColorToken = keyof typeof palettes.light;
export type Palette = Record<ColorToken, string>;

/**
 * React Native on Android resolves a typeface by the bundled asset's filename,
 * not by family plus weight — so these are file names, and every one of them
 * must exist in assets/fonts. A test enforces that.
 */
export const font = {
  sans: 'Archivo-Regular',
  sansMedium: 'Archivo-Medium',
  sansSemi: 'Archivo-SemiBold',
  sansBold: 'Archivo-Bold',
  wideSemi: 'ArchivoSemiExpanded-SemiBold',
  wideBold: 'ArchivoSemiExpanded-Bold',
  mono: 'IBMPlexMono-Regular',
  monoMedium: 'IBMPlexMono-Medium',
  monoSemi: 'IBMPlexMono-SemiBold',
} as const;

const TABULAR: TextStyle['fontVariant'] = ['tabular-nums'];

/**
 * The design expresses letter-spacing in ems; React Native takes pixels, so
 * the values here are the em figure multiplied by the font size.
 */
export const type = {
  display: {
    fontFamily: font.wideBold,
    fontSize: 38,
    lineHeight: 40,
    letterSpacing: -0.8,
    fontVariant: TABULAR,
  },
  /** The design's `.bignum` — the completion percentage and nothing else. */
  bignum: {
    fontFamily: font.wideBold,
    fontSize: 56,
    lineHeight: 56,
    letterSpacing: -1.96,
    fontVariant: TABULAR,
  },
  h1: {fontFamily: font.sansBold, fontSize: 26, lineHeight: 30, letterSpacing: -0.4},
  h2: {fontFamily: font.sansSemi, fontSize: 20, lineHeight: 25},
  h3: {fontFamily: font.sansSemi, fontSize: 17, lineHeight: 22},
  body: {fontFamily: font.sans, fontSize: 15, lineHeight: 22},
  bodyStrong: {fontFamily: font.sansSemi, fontSize: 15, lineHeight: 22},
  small: {fontFamily: font.sans, fontSize: 13, lineHeight: 18},
  caption: {fontFamily: font.sans, fontSize: 12, lineHeight: 16},
  eyebrow: {
    fontFamily: font.monoMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.76,
    textTransform: 'uppercase',
  },
  // The overprint signature, half one: a target, as pre-printed type.
  printed: {
    fontFamily: font.mono,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.66,
    textTransform: 'uppercase',
    fontVariant: TABULAR,
  },
  // ...and half two: what actually happened, written over it in ink.
  inkNum: {
    fontFamily: font.wideBold,
    fontSize: 25,
    lineHeight: 28,
    letterSpacing: -0.5,
    fontVariant: TABULAR,
  },
  mono: {fontFamily: font.mono, fontSize: 13, lineHeight: 18, fontVariant: TABULAR},
  monoSmall: {
    fontFamily: font.mono,
    fontSize: 11,
    lineHeight: 14,
    fontVariant: TABULAR,
  },
} satisfies Record<string, TextStyle>;

export type TypeToken = keyof typeof type;

export const space = {xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32} as const;
export const radius = {sm: 10, md: 14, lg: 20, pill: 999} as const;

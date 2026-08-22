import {palettes, type, space, radius, font} from '@/theme/tokens';

describe('design tokens', () => {
  it('defines identical token sets in both themes', () => {
    expect(Object.keys(palettes.dark).sort()).toEqual(
      Object.keys(palettes.light).sort(),
    );
  });

  it('carries the approved Ledger palette', () => {
    expect(palettes.light.paper).toBe('#EDEFF2');
    expect(palettes.light.ink).toBe('#12161B');
    expect(palettes.light.plate).toBe('#1B4FD8');
    expect(palettes.dark.paper).toBe('#0C0F13');
    expect(palettes.dark.plate).toBe('#5B87FF');
  });

  it('never uses red for falling short of a target', () => {
    // The design rule: below-target is data, not failure. Ochre, never red.
    expect(palettes.light.short).toBe('#A56A12');
    expect(palettes.dark.short).toBe('#D69B3C');
  });

  it('uses tabular figures wherever numbers align', () => {
    for (const token of ['inkNum', 'mono', 'monoSmall', 'printed'] as const) {
      expect(type[token].fontVariant).toContain('tabular-nums');
    }
  });

  it('exposes a spacing scale on a 4px grid', () => {
    for (const value of Object.values(space)) {
      expect(value % 4).toBe(0);
    }
    expect(radius.md).toBe(14);
  });

  it('names only fonts that are actually bundled', () => {
    const bundled = require('fs')
      .readdirSync('assets/fonts')
      .map((f: string) => f.replace(/\.ttf$/, ''));
    for (const family of Object.values(font)) {
      expect(bundled).toContain(family);
    }
  });

  it('sets every type token to a bundled font family', () => {
    const families: string[] = Object.values(font);
    for (const [name, style] of Object.entries(type)) {
      expect(families).toContain(style.fontFamily);
      expect(name).toBeTruthy();
    }
  });
});

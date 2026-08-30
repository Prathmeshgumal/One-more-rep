import React from 'react';
import fs from 'fs';
import path from 'path';
import {render} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {IconButton} from '@/ui/IconButton';

/**
 * Plan, History and Exercises were tabs, and their glyphs were copied verbatim
 * from the approved design. When those sections became buttons the glyphs moved
 * from `TabIcon` to `IconButton` — and a redrawn glyph is exactly the kind of
 * change nobody notices in review and nobody can un-notice afterwards.
 *
 * So this checks the moved paths against the design file itself rather than
 * against a copy of them: if `docs/design/screens.html` and the button ever
 * disagree, one of the two was edited without the other.
 */
const DESIGN = fs.readFileSync(
  path.join(__dirname, '..', '..', 'docs', 'design', 'screens.html'),
  'utf8',
);

type Node = {props?: Record<string, unknown>; children?: unknown} | null;

function pathData(node: unknown): string[] {
  if (!node || typeof node !== 'object') {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap(pathData);
  }
  const {props, children} = node as Node & {children?: unknown};
  const here = typeof props?.d === 'string' ? [props.d] : [];
  return [...here, ...pathData(children)];
}

const glyphFor = async (
  glyph: React.ComponentProps<typeof IconButton>['glyph'],
) =>
  pathData(
    (
      await render(
        <ThemeProvider>
          <IconButton glyph={glyph} label="probe" onPress={jest.fn()} />
        </ThemeProvider>,
      )
    ).toJSON(),
  );

describe('the glyphs that moved off the tab bar', () => {
  it.each(['plan', 'history', 'dumbbell'] as const)(
    'draws %s exactly as the design does',
    async glyph => {
      const [drawn] = await glyphFor(glyph);
      expect(drawn).toBeDefined();
      expect(DESIGN).toContain(drawn!);
    },
  );

  it('still draws the glyphs that were always buttons', async () => {
    for (const glyph of ['calendar', 'chevronLeft', 'chevronRight'] as const) {
      const paths = await glyphFor(glyph);
      expect(paths).toHaveLength(1);
      expect(paths[0]!.length).toBeGreaterThan(8);
    }
  });

  it('gives every glyph its own drawing', async () => {
    const drawn: string[] = [];
    for (const glyph of [
      'calendar',
      'chevronLeft',
      'chevronRight',
      'plan',
      'history',
      'dumbbell',
    ] as const) {
      drawn.push((await glyphFor(glyph))[0]!);
    }
    expect(new Set(drawn).size).toBe(drawn.length);
  });
});

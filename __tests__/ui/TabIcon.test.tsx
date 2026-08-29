import React from 'react';
import {render} from '@testing-library/react-native';
import {TabIcon} from '@/ui/TabIcon';
import type {RootTabParamList} from '@/navigation/types';

const TABS: ReadonlyArray<keyof RootTabParamList> = ['Today', 'Settings'];

type Node = {props?: Record<string, unknown>; children?: unknown} | null;

/** Every `d` in the rendered tree — the actual glyph geometry that shipped. */
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

/** Every `stroke` in the rendered tree. */
function strokeColours(node: unknown): string[] {
  if (!node || typeof node !== 'object') {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap(strokeColours);
  }
  const {props, children} = node as Node & {children?: unknown};
  const here = typeof props?.stroke === 'string' ? [props.stroke] : [];
  return [...here, ...strokeColours(children)];
}

const glyphFor = async (name: keyof RootTabParamList) =>
  pathData((await render(<TabIcon name={name} color="#123456" />)).toJSON());

describe('TabIcon', () => {
  // The tab bar shipped label-only once already, which did not match the
  // approved design. A missing glyph should fail here, not in a screenshot.
  it.each(TABS)('draws a glyph for %s', async name => {
    const paths = await glyphFor(name);
    expect(paths).toHaveLength(1);
    expect(paths[0]!.length).toBeGreaterThan(10);
  });

  // Sequentially, not Promise.all: concurrent renders leave RNTL in a state
  // where the next test's toJSON() comes back null.
  it('draws each tab a different glyph', async () => {
    const drawn: string[] = [];
    for (const name of TABS) {
      drawn.push((await glyphFor(name))[0]!);
    }
    expect(new Set(drawn).size).toBe(TABS.length);
  });

  it('takes its colour from the caller, so the active tint drives it', async () => {
    const view = await render(<TabIcon name="Today" color="#123456" />);
    const strokes = strokeColours(view.toJSON());
    expect(strokes).toContain('#123456');
  });
});

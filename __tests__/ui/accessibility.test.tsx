import React from 'react';
import {render} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {Stepper} from '@/ui/Stepper';
import {Toggle} from '@/ui/Toggle';
import {Chip} from '@/ui/Chip';
import {IconButton} from '@/ui/IconButton';

const wrap = (node: React.ReactElement) =>
  render(<ThemeProvider>{node}</ThemeProvider>);

/**
 * Android's own guidance puts the smallest comfortable target at 48dp and the
 * floor at 44. Two controls here are drawn smaller than that on purpose — the
 * design's `.iconbtn` is 38px and the stepper's shoulders are shorter still —
 * so both buy the difference back with `hitSlop` rather than growing.
 */
const MIN_TARGET = 44;
const effective = (size: number, slop: unknown): number => {
  if (typeof slop === 'number') {
    return size + slop * 2;
  }
  return size;
};

describe('controls announce themselves', () => {
  it('names both ends of a stepper', async () => {
    const view = await wrap(
      <Stepper label="Weight" value={30} step={2.5} onChange={jest.fn()} />,
    );
    expect(view.getByLabelText('Decrease Weight')).toBeTruthy();
    expect(view.getByLabelText('Increase Weight')).toBeTruthy();
  });

  it('reads the stepper value out, not just the label', async () => {
    const view = await wrap(
      <Stepper label="Weight" value={30} step={2.5} onChange={jest.fn()} />,
    );
    expect(view.getByLabelText('Weight').props.accessibilityValue).toEqual(
      expect.objectContaining({now: 30, text: '30'}),
    );
  });

  it('reports a toggle as checked', async () => {
    const view = await wrap(
      <Toggle label="Track weight" value onValueChange={jest.fn()} />,
    );
    expect(
      view.getByLabelText('Track weight').props.accessibilityState,
    ).toEqual(expect.objectContaining({checked: true}));
  });

  it('reports a chip as selected', async () => {
    const view = await wrap(
      <Chip label="Barbell" selected onPress={jest.fn()} />,
    );
    expect(view.getByLabelText('Barbell').props.accessibilityState).toEqual(
      expect.objectContaining({selected: true}),
    );
  });

  it('names an icon-only button, which has no text of its own', async () => {
    const view = await wrap(
      <IconButton glyph="calendar" label="Open the calendar" onPress={jest.fn()} />,
    );
    expect(view.getByLabelText('Open the calendar')).toBeTruthy();
  });
});

describe('controls are big enough to hit', () => {
  it('gives the 38px icon button enough slop to clear the minimum', async () => {
    const view = await wrap(
      <IconButton glyph="calendar" label="Open the calendar" onPress={jest.fn()} />,
    );
    const button = view.getByLabelText('Open the calendar');
    expect(effective(38, button.props.hitSlop)).toBeGreaterThanOrEqual(
      MIN_TARGET,
    );
  });

  it('gives the stepper shoulders enough slop', async () => {
    const view = await wrap(
      <Stepper label="Reps" value={10} step={1} onChange={jest.fn()} />,
    );
    for (const name of ['Decrease Reps', 'Increase Reps']) {
      const shoulder = view.getByLabelText(name);
      // The shoulder is roughly 38px tall: 22px of line box plus 8px above and
      // below. The slop has to cover the rest.
      expect(effective(38, shoulder.props.hitSlop)).toBeGreaterThanOrEqual(
        MIN_TARGET,
      );
    }
  });
});

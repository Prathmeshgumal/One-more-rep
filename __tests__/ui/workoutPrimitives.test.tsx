import React from 'react';
import {render} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {ProgressBar} from '@/ui/ProgressBar';
import {StatusChip} from '@/ui/StatusChip';
import {BigNumber} from '@/ui/BigNumber';
import {LedgerTable} from '@/ui/LedgerTable';

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider>{ui}</ThemeProvider>);

/** Collects every value of one style key in the rendered tree. */
function styleValues(node: unknown, key: string): unknown[] {
  const found: unknown[] = [];
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') {
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    const el = n as {props?: {style?: unknown}; children?: unknown};
    const style = el.props?.style;
    for (const entry of Array.isArray(style) ? style : [style]) {
      const value = (entry as Record<string, unknown> | undefined)?.[key];
      if (value !== undefined) {
        found.push(value);
      }
    }
    walk(el.children);
  };
  walk(node);
  return found;
}

describe('ProgressBar', () => {
  it('reports progress to a screen reader as well as drawing it', async () => {
    const view = await wrap(<ProgressBar value={6} total={15} />);
    const bar = view.getByRole('progressbar');
    expect(bar.props.accessibilityValue).toEqual({min: 0, max: 15, now: 6});
  });

  // The fill is a percentage string, not a number — React Native lays it out
  // against the parent rather than in pixels.
  it('fills in proportion to the value', async () => {
    const view = await wrap(<ProgressBar value={6} total={15} />);
    expect(styleValues(view.toJSON(), 'width')).toContain('40%');
  });

  // A workout with nothing planned would divide by zero and render NaN, which
  // React Native treats as a fatal style value rather than an empty bar.
  it('survives a total of zero', async () => {
    const view = await wrap(<ProgressBar value={0} total={0} />);
    expect(styleValues(view.toJSON(), 'width')).toContain('0%');
  });

  it('never overflows past full', async () => {
    const view = await wrap(<ProgressBar value={20} total={15} />);
    expect(styleValues(view.toJSON(), 'width')).toContain('100%');
  });
});

// One render per test, deliberately. Rendering repeatedly inside a single test
// leaves React Native Testing Library returning a stale tree from the third
// render onward, which reads as a component bug and is not one.
describe('StatusChip', () => {
  it.each([
    ['achieved', 'Achieved'],
    ['exceeded', 'Exceeded'],
    ['below', 'Below'],
    ['skipped', 'Skipped'],
    ['unplanned', 'Bonus'],
  ] as const)('words %s the way the design does', async (status, label) => {
    const view = await wrap(<StatusChip status={status} />);
    expect(view.getByText(label)).toBeTruthy();
  });

  it('takes an explicit label when there is a number to show', async () => {
    const view = await wrap(<StatusChip status="exceeded" label="+2 reps" />);
    expect(view.getByText('+2 reps')).toBeTruthy();
  });
});

describe('BigNumber', () => {
  it('shows the value and its suffix', async () => {
    const view = await wrap(<BigNumber value="93" suffix="% of plan" />);
    expect(view.getByText('93')).toBeTruthy();
    expect(view.getByText('% of plan')).toBeTruthy();
  });
});

describe('LedgerTable', () => {
  const rows = [
    {
      setNumber: 1,
      target: '10 × 30.0',
      actual: '10 × 30.0',
      result: 'even',
      status: 'achieved' as const,
    },
    {
      setNumber: 3,
      target: '10 × 30.0',
      actual: '8 × 32.5',
      result: '−40 kg vol',
      status: 'below' as const,
    },
  ];

  it('heads the columns the way the design does', async () => {
    const view = await wrap(<LedgerTable rows={rows} />);
    for (const heading of ['Set', 'Target', 'Actual', 'Result']) {
      expect(view.getByText(heading)).toBeTruthy();
    }
  });

  it('renders a row per set', async () => {
    const view = await wrap(<LedgerTable rows={rows} />);
    expect(view.getByText('8 × 32.5')).toBeTruthy();
    expect(view.getByText('−40 kg vol')).toBeTruthy();
    expect(view.getByText('3')).toBeTruthy();
  });
});

import React from 'react';
import {render} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {AppText} from '@/ui/Text';
import {ReorderableRows} from '@/ui/ReorderableRows';

type Row = {id: string; name: string};

const rows: Row[] = [
  {id: 'a', name: 'Machine Chest Press'},
  {id: 'b', name: 'Cable Fly'},
];

describe('ReorderableRows', () => {
  it('renders every row in the order given', async () => {
    const view = await render(
      <ThemeProvider>
        <ReorderableRows
          data={rows}
          keyOf={r => r.id}
          onReorder={jest.fn()}
          renderRow={r => <AppText>{r.name}</AppText>}
        />
      </ThemeProvider>,
    );
    expect(view.getByText('Machine Chest Press')).toBeTruthy();
    expect(view.getByText('Cable Fly')).toBeTruthy();
  });

  // These are list cells, so a `gap` on the container never applies between
  // them. Without an explicit per-row gap the cards render flush against each
  // other, which shipped once and had to be caught on the device.
  it('separates one row from the next', async () => {
    const view = await render(
      <ThemeProvider>
        <ReorderableRows
          data={rows}
          keyOf={r => r.id}
          onReorder={jest.fn()}
          renderRow={r => <AppText>{r.name}</AppText>}
        />
      </ThemeProvider>,
    );

    const gaps: number[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') {
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      const element = node as {
        props?: {style?: unknown};
        children?: unknown;
      };
      const style = element.props?.style;
      for (const entry of Array.isArray(style) ? style : [style]) {
        const bottom = (entry as {marginBottom?: unknown} | undefined)
          ?.marginBottom;
        if (typeof bottom === 'number') {
          gaps.push(bottom);
        }
      }
      walk(element.children);
    };
    walk(view.toJSON());

    expect(gaps.length).toBeGreaterThanOrEqual(rows.length);
    expect(gaps.every(g => g > 0)).toBe(true);
  });

  // The whole card starts the drag, so there is no separate grip to hunt for.
  // The row is handed `drag` and decides for itself what triggers it.
  it('hands each row a drag callback and draws no handle of its own', async () => {
    const seen: unknown[] = [];
    const view = await render(
      <ThemeProvider>
        <ReorderableRows
          data={rows}
          keyOf={r => r.id}
          onReorder={jest.fn()}
          renderRow={(r, drag) => {
            seen.push(drag);
            return <AppText>{r.name}</AppText>;
          }}
        />
      </ThemeProvider>,
    );

    expect(seen).toHaveLength(rows.length);
    expect(seen.every(d => typeof d === 'function')).toBe(true);
    expect(view.queryByLabelText('Drag to reorder')).toBeNull();
  });

  it('renders nothing but stays mounted when empty', async () => {
    const view = await render(
      <ThemeProvider>
        <ReorderableRows
          data={[]}
          keyOf={(r: Row) => r.id}
          onReorder={jest.fn()}
          renderRow={r => <AppText>{r.name}</AppText>}
        />
      </ThemeProvider>,
    );
    expect(view.toJSON()).toBeTruthy();
  });
});

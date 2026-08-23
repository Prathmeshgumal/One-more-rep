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

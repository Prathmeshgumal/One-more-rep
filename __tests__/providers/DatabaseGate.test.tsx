import React from 'react';
import {Text} from 'react-native';
import {render, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {DatabaseGate} from '@/providers/DatabaseGate';
import {createTestDb} from '../helpers/testDb';

// React Native Testing Library 14 made render async.
const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider>{ui}</ThemeProvider>);

describe('DatabaseGate', () => {
  let open: Array<() => void> = [];
  afterEach(() => {
    open.forEach(close => close());
    open = [];
  });

  it('renders children once migrations succeed', async () => {
    const {db, close} = createTestDb();
    open.push(close);
    const view = await wrap(
      <DatabaseGate getDb={() => db}>
        <Text>ready</Text>
      </DatabaseGate>,
    );
    expect(await view.findByText('ready')).toBeTruthy();
  });

  it('shows a blocking error screen instead of crashing when migrations fail', async () => {
    const view = await wrap(
      <DatabaseGate
        getDb={() => {
          throw new Error('disk is full');
        }}>
        <Text>ready</Text>
      </DatabaseGate>,
    );
    await waitFor(() => {
      expect(view.getByText(/couldn't open your data/i)).toBeTruthy();
    });
    expect(view.getByText(/disk is full/)).toBeTruthy();
    expect(view.queryByText('ready')).toBeNull();
  });
});

import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme';
import { DatabaseGate } from '@/providers/DatabaseGate';
import { sql } from 'drizzle-orm';
import { runMigrations } from '@/db/migrate';
import { createTestDb } from '../helpers/testDb';

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
    const { db, close } = createTestDb();
    open.push(close);
    const view = await wrap(
      <DatabaseGate getDb={() => db}>
        <Text>ready</Text>
      </DatabaseGate>,
    );
    expect(await view.findByText('ready')).toBeTruthy();
  });

  // Spec 6.4: an in-progress session from a previous day closes as abandoned
  // on launch, keeping every set it recorded. There is no background job, so
  // this is the only moment it can happen.
  it('closes a session left open from a previous day', async () => {
    const { db, close } = createTestDb();
    open.push(close);
    await runMigrations(db);
    await db.run(
      sql`INSERT INTO workout_sessions (id,date,day_name_snapshot,status,started_at)
          VALUES ('old', 0, 'Push Day', 'in_progress', 0)`,
    );

    const view = await wrap(
      <DatabaseGate getDb={() => db}>
        <Text>ready</Text>
      </DatabaseGate>,
    );
    expect(await view.findByText('ready')).toBeTruthy();

    await waitFor(async () => {
      const rows = await db.all<{ status: string }>(
        sql`SELECT status FROM workout_sessions WHERE id='old'`,
      );
      expect(rows[0]?.status).toBe('abandoned');
    });
  });

  it('shows a blocking error screen instead of crashing when migrations fail', async () => {
    const view = await wrap(
      <DatabaseGate
        getDb={() => {
          throw new Error('disk is full');
        }}
      >
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

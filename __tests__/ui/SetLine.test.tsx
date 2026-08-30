import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {SetLine, SET_LINE_HEIGHT, toneForSet} from '@/ui/SetLine';

const base = {
  targetReps: 12,
  targetWeight: null,
  actualReps: null as number | null,
  actualWeight: null as number | null,
  status: 'pending' as 'pending' | 'completed' | 'skipped',
  isUnplanned: false,
};

const wrap = (node: React.ReactElement) =>
  render(<ThemeProvider>{node}</ThemeProvider>);

describe('toneForSet', () => {
  // The old row let compareSet collapse pending and skipped into one word.
  // That is right for arithmetic and wrong for a ledger: one is a decision
  // you made, the other is a set you have not reached.
  it('keeps pending and skipped apart', () => {
    expect(toneForSet({...base, status: 'pending'})).toBe('pending');
    expect(toneForSet({...base, status: 'skipped'})).toBe('skipped');
  });

  it('reads a recorded set through the same comparison as the rest of the app', () => {
    expect(toneForSet({...base, status: 'completed', actualReps: 12})).toBe(
      'achieved',
    );
    expect(toneForSet({...base, status: 'completed', actualReps: 14})).toBe(
      'exceeded',
    );
    expect(toneForSet({...base, status: 'completed', actualReps: 9})).toBe(
      'below',
    );
  });

  it('calls a set with no target bonus, not a failure', () => {
    expect(
      toneForSet({
        ...base,
        targetReps: null,
        status: 'completed',
        actualReps: 11,
        isUnplanned: true,
      }),
    ).toBe('bonus');
  });

  // Where you are looking is not something the database knows, so it has to
  // win over what the row says about itself.
  it('lets live and amending override the record', () => {
    expect(
      toneForSet({
        ...base,
        status: 'completed',
        actualReps: 12,
        isLive: true,
      }),
    ).toBe('live');
    expect(
      toneForSet({
        ...base,
        status: 'completed',
        actualReps: 12,
        isAmending: true,
      }),
    ).toBe('amending');
  });

  it('prefers amending over live when both are set', () => {
    expect(toneForSet({...base, isLive: true, isAmending: true})).toBe(
      'amending',
    );
  });
});

describe('SetLine', () => {
  // The number the whole redesign turns on. A row taller than this and the
  // session stops fitting; shorter and it stops being touchable.
  it('is exactly 44dp tall', () => {
    expect(SET_LINE_HEIGHT).toBe(44);
  });

  it('prints reps alone for a bodyweight set', async () => {
    await wrap(
      <SetLine
        {...base}
        index={1}
        status="completed"
        actualReps={12}
        unit="kg"
      />,
    );
    expect(screen.getByText('12 reps')).toBeTruthy();
  });

  // "12 reps · 0 kg" would be inventing a load nobody lifted.
  it('omits a weight of zero rather than printing it', async () => {
    await wrap(
      <SetLine
        {...base}
        index={1}
        status="completed"
        actualReps={12}
        actualWeight={0}
        unit="kg"
      />,
    );
    expect(screen.getByText('12 reps')).toBeTruthy();
  });

  it('prints weight beside reps when there was one', async () => {
    await wrap(
      <SetLine
        {...base}
        index={2}
        targetWeight={20}
        status="completed"
        actualReps={10}
        actualWeight={20}
        unit="kg"
      />,
    );
    expect(screen.getByText('10 · 20 kg')).toBeTruthy();
  });

  it('says what an undecided set is, rather than showing a dash', async () => {
    await wrap(<SetLine {...base} index={3} unit="kg" />);
    expect(screen.getByText('not recorded')).toBeTruthy();
  });

  it('ghosts the target beside every line', async () => {
    await wrap(<SetLine {...base} index={1} unit="kg" />);
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('labels a bonus set instead of ghosting a target it never had', async () => {
    await wrap(
      <SetLine
        {...base}
        index={4}
        targetReps={null}
        status="completed"
        actualReps={11}
        isUnplanned
        unit="kg"
      />,
    );
    expect(screen.getByText('bonus')).toBeTruthy();
  });

  it('is a button only when it can be acted on', async () => {
    const view = await wrap(<SetLine {...base} index={1} unit="kg" />);
    expect(view.queryByRole('button')).toBeNull();

    await wrap(
      <SetLine {...base} index={1} unit="kg" onPress={() => undefined} />,
    );
    expect(screen.getByRole('button')).toBeTruthy();
  });
});

import React from 'react';
import {render, act} from '@testing-library/react-native';
import {Text} from 'react-native';
import {useDebounced} from '@/features/exercises/useDebounced';

/**
 * Renders the hook and reports every value it has settled on, so the test can
 * assert on how many queries *would* have been issued, not just the final one.
 */
function Probe({
  value,
  onSettle,
}: {
  value: string;
  onSettle: (v: string) => void;
}) {
  const settled = useDebounced(value, 250);
  React.useEffect(() => onSettle(settled), [settled, onSettle]);
  return <Text>{settled}</Text>;
}

describe('useDebounced', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('holds the initial value straight away', async () => {
    const onSettle = jest.fn();
    await render(<Probe value="" onSettle={onSettle} />);
    expect(onSettle).toHaveBeenCalledWith('');
  });

  // The measured failure this prevents: typing "squat" fired five full-library
  // queries that serialised on one connection, and the last waited 1.4s behind
  // the backlog.
  it('settles once for a burst of typing, not once per keystroke', async () => {
    const onSettle = jest.fn();
    const view = await render(<Probe value="" onSettle={onSettle} />);
    onSettle.mockClear();

    for (const term of ['s', 'sq', 'squ', 'squa', 'squat']) {
      await view.rerender(<Probe value={term} onSettle={onSettle} />);
      await act(async () => {
        jest.advanceTimersByTime(40);
      });
    }
    expect(onSettle).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith('squat');
  });

  it('settles again once typing resumes and stops', async () => {
    const onSettle = jest.fn();
    const view = await render(<Probe value="a" onSettle={onSettle} />);
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    onSettle.mockClear();

    await view.rerender(<Probe value="ab" onSettle={onSettle} />);
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    expect(onSettle).toHaveBeenCalledWith('ab');
  });
});

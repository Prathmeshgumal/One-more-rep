import React from 'react';
import {render, screen, fireEvent, act} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {UndoBanner, UNDO_WINDOW_MS} from '@/features/workout/UndoBanner';

/**
 * Tested here rather than through the screen: the expiry needs fake timers,
 * and `findBy*` polls on timers of its own, so a fake-timer test that also
 * renders the whole workout deadlocks rather than fails. Ask a question at the
 * level that can answer it.
 */
describe('UndoBanner', () => {
  const wrap = (props: Partial<React.ComponentProps<typeof UndoBanner>> = {}) =>
    render(
      <ThemeProvider>
        <UndoBanner
          message="Set 1 recorded — 10 reps"
          onUndo={jest.fn()}
          onExpire={jest.fn()}
          {...props}
        />
      </ThemeProvider>,
    );

  it('says what it is offering to take back', async () => {
    await wrap();
    expect(screen.getByText('Set 1 recorded — 10 reps')).toBeTruthy();
  });

  it('takes it back when pressed', async () => {
    const onUndo = jest.fn();
    await wrap({onUndo});
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  // Long enough to notice a wrong number, short enough not to sit there.
  it('closes on its own after four seconds', async () => {
    jest.useFakeTimers();
    try {
      const onExpire = jest.fn();
      await wrap({onExpire});
      expect(onExpire).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(UNDO_WINDOW_MS - 1);
      });
      expect(onExpire).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(2);
      });
      expect(onExpire).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  // The caller keys this on the message, so a second record inside the window
  // remounts it — otherwise the new set would inherit whatever was left of the
  // old one's four seconds, and could vanish almost immediately.
  it('gives each message its own full window', async () => {
    jest.useFakeTimers();
    try {
      const onExpire = jest.fn();
      const view = await wrap({onExpire});
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });

      view.unmount();
      await wrap({message: 'Set 2 recorded — 9 reps', onExpire});
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      expect(onExpire).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1100);
      });
      expect(onExpire).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

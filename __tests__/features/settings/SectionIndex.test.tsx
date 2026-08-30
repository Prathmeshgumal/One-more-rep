import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {render, fireEvent, screen} from '@testing-library/react-native';
import {useSectionIndex} from '@/features/settings/SectionIndex';

const KEYS = ['lifting', 'appearance', 'about'] as const;
type Key = (typeof KEYS)[number];

/**
 * Drives the hook directly: what it does with measurements it has not been
 * given yet is the whole bug, and no amount of pressing a real screen makes
 * that reproducible.
 */
function Harness({measurements}: {measurements: ReadonlyArray<[Key, number]>}) {
  const index = useSectionIndex<Key>(KEYS as unknown as readonly Key[]);
  React.useEffect(() => {
    for (const [key, y] of measurements) index.measure(key)(y);
  }, [measurements, index]);
  return (
    <View>
      <Text>{index.active}</Text>
      <Pressable
        accessibilityLabel="scroll to 600"
        onPress={() => index.onScrollY(600)}
      />
      <Pressable
        accessibilityLabel="scroll to top"
        onPress={() => index.onScrollY(0)}
      />
    </View>
  );
}

const laidOut: ReadonlyArray<[Key, number]> = [
  ['lifting', 0],
  ['appearance', 500],
  ['about', 700],
];

/** What every section reports on its first pass, before any of them has height. */
const unmeasured: ReadonlyArray<[Key, number]> = [
  ['lifting', 0],
  ['appearance', 0],
  ['about', 0],
];

describe('useSectionIndex', () => {
  it('starts on the first section', async () => {
    await render(<Harness measurements={laidOut} />);
    expect(screen.getByText('lifting')).toBeTruthy();
  });

  it('follows the scroll down the page', async () => {
    await render(<Harness measurements={laidOut} />);
    await fireEvent.press(screen.getByLabelText('scroll to 600'));
    expect(screen.getByText('appearance')).toBeTruthy();
  });

  it('comes back to the first section at the top', async () => {
    await render(<Harness measurements={laidOut} />);
    await fireEvent.press(screen.getByLabelText('scroll to 600'));
    await fireEvent.press(screen.getByLabelText('scroll to top'));
    expect(screen.getByText('lifting')).toBeTruthy();
  });

  /**
   * The bug this exists for. Every section reports `y = 0` on its first
   * layout pass, and a scroll of nothing then satisfied all three — so the
   * *last* one won, and Settings opened with `About` lit on a page nobody had
   * touched. Found on the phone.
   */
  it('does not light the last section before anything has been measured', async () => {
    await render(<Harness measurements={unmeasured} />);
    await fireEvent.press(screen.getByLabelText('scroll to top'));
    expect(screen.getByText('lifting')).toBeTruthy();
  });

  it('still ignores a stale zero once the rest have real offsets', async () => {
    await render(
      <Harness
        measurements={[
          ['lifting', 0],
          ['appearance', 500],
          ['about', 0],
        ]}
      />,
    );
    await fireEvent.press(screen.getByLabelText('scroll to 600'));
    expect(screen.getByText('appearance')).toBeTruthy();
  });
});

import React from 'react';
import {ScrollView, Text} from 'react-native';
import {render, fireEvent, screen} from '@testing-library/react-native';
import {useScrollFade} from '@/ui/ScrollFade';

/**
 * The fade was drawn whether or not anything was under it, so a list at rest
 * had its first 28dp washed out — which on the workout screen is the date.
 */
function Harness() {
  const fade = useScrollFade();
  return (
    <ScrollView {...fade.scrollProps} testID="list">
      <Text>{fade.faded ? 'faded' : 'clear'}</Text>
    </ScrollView>
  );
}

const scrollTo = async (y: number) =>
  fireEvent.scroll(screen.getByTestId('list'), {
    nativeEvent: {
      contentOffset: {x: 0, y},
      contentSize: {height: 2000, width: 393},
      layoutMeasurement: {height: 800, width: 393},
    },
  });

describe('useScrollFade', () => {
  it('starts clear, because nothing is under the top edge yet', async () => {
    await render(<Harness />);
    expect(screen.getByText('clear')).toBeTruthy();
  });

  it('fades once the list has moved', async () => {
    await render(<Harness />);
    await scrollTo(120);
    expect(screen.getByText('faded')).toBeTruthy();
  });

  it('clears again when the list comes back to the top', async () => {
    await render(<Harness />);
    await scrollTo(120);
    await scrollTo(0);
    expect(screen.getByText('clear')).toBeTruthy();
  });

  /** Overscroll bounce and a stray sub-pixel offset are not a scroll. */
  it('ignores a nudge of a pixel or two', async () => {
    await render(<Harness />);
    await scrollTo(1.5);
    expect(screen.getByText('clear')).toBeTruthy();
  });
});

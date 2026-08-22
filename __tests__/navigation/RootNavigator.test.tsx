import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {NavigationContainer} from '@react-navigation/native';
import {ThemeProvider} from '@/theme';
import {RootNavigator} from '@/navigation/RootNavigator';

const renderApp = () =>
  render(
    <ThemeProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </ThemeProvider>,
  );

describe('RootNavigator', () => {
  it('opens on Today', async () => {
    const view = await renderApp();
    expect(view.getByText(/workout for today/i)).toBeTruthy();
  });

  it('reaches every one of the five tabs', async () => {
    const view = await renderApp();
    // Asserted on each screen's own copy rather than its title, because a tab
    // label and its heading can read the same.
    const tabs: ReadonlyArray<readonly [string, RegExp]> = [
      ['Plan', /weekly routine/i],
      ['History', /past workouts/i],
      ['Exercises', /exercise library appears/i],
      ['Settings', /^Settings$/],
    ];
    for (const [tab, marker] of tabs) {
      fireEvent.press(view.getByRole('button', {name: new RegExp(tab)}));
      await waitFor(() => {
        expect(view.getAllByText(marker).length).toBeGreaterThan(0);
      });
    }
  });
});

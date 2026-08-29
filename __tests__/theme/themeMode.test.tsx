import React from 'react';
import {Text, useColorScheme} from 'react-native';
import {act, render} from '@testing-library/react-native';
import {ThemeProvider, useTheme} from '@/theme';
import {useThemeMode} from '@/theme/useThemeMode';

// The OS scheme has to be drivable from a test, and it is a hook rather than a
// value, so the module behind it is replaced wholesale.
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

const mockedColorScheme = useColorScheme as jest.MockedFunction<
  typeof useColorScheme
>;

function Probe() {
  const {scheme} = useTheme();
  return <Text>{scheme}</Text>;
}

const renderProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

describe('theme mode', () => {
  beforeEach(() => {
    useThemeMode.setState({mode: 'system'});
    mockedColorScheme.mockReturnValue('light');
  });

  it('follows the OS when set to system', async () => {
    mockedColorScheme.mockReturnValue('dark');
    const view = await renderProbe();
    expect(view.getByText('dark')).toBeTruthy();
  });

  it('overrides a dark OS when light is chosen', async () => {
    mockedColorScheme.mockReturnValue('dark');
    useThemeMode.setState({mode: 'light'});
    const view = await renderProbe();
    expect(view.getByText('light')).toBeTruthy();
  });

  it('overrides a light OS when dark is chosen', async () => {
    mockedColorScheme.mockReturnValue('light');
    useThemeMode.setState({mode: 'dark'});
    const view = await renderProbe();
    expect(view.getByText('dark')).toBeTruthy();
  });

  // useColorScheme returns null before the OS has answered. Treating that as
  // dark would flash the wrong palette on every cold start.
  it('treats an unknown OS scheme as light', async () => {
    mockedColorScheme.mockReturnValue(null);
    const view = await renderProbe();
    expect(view.getByText('light')).toBeTruthy();
  });

  it('repaints when the mode changes after mount', async () => {
    const view = await renderProbe();
    expect(view.getByText('light')).toBeTruthy();

    await act(async () => useThemeMode.getState().setMode('dark'));
    expect(view.getByText('dark')).toBeTruthy();
  });
});

import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {BackButton} from '@/ui/BackButton';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({goBack: mockGoBack}),
}));

const wrap = (node: React.ReactElement) =>
  render(<ThemeProvider>{node}</ThemeProvider>);

describe('BackButton', () => {
  beforeEach(() => mockGoBack.mockClear());

  it('is announced as a button that goes back', async () => {
    const view = await wrap(<BackButton />);
    expect(view.getByLabelText('Go back')).toBeTruthy();
  });

  it('goes back when pressed', async () => {
    const view = await wrap(<BackButton />);
    await fireEvent.press(view.getByLabelText('Go back'));
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('names where it goes when told', async () => {
    const view = await wrap(<BackButton label="Back to the week" />);
    expect(view.getByLabelText('Back to the week')).toBeTruthy();
  });
});

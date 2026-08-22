import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {SearchField} from '@/ui/SearchField';
import {Chip} from '@/ui/Chip';
import {Card} from '@/ui/Card';
import {AppText} from '@/ui/Text';

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider>{ui}</ThemeProvider>);

describe('SearchField', () => {
  it('reports what the user types', async () => {
    const onChangeText = jest.fn();
    const view = await wrap(
      <SearchField
        value=""
        onChangeText={onChangeText}
        placeholder="Search exercises"
      />,
    );
    fireEvent.changeText(view.getByPlaceholderText('Search exercises'), 'squat');
    expect(onChangeText).toHaveBeenCalledWith('squat');
  });

  it('offers a clear control only once there is something to clear', async () => {
    const empty = await wrap(<SearchField value="" onChangeText={jest.fn()} />);
    expect(empty.queryByLabelText('Clear search')).toBeNull();

    const onChangeText = jest.fn();
    const filled = await wrap(
      <SearchField value="squat" onChangeText={onChangeText} />,
    );
    fireEvent.press(filled.getByLabelText('Clear search'));
    expect(onChangeText).toHaveBeenCalledWith('');
  });
});

describe('Chip', () => {
  it('exposes its selected state to assistive technology', async () => {
    const view = await wrap(<Chip label="Chest" selected />);
    expect(view.getByLabelText('Chest').props.accessibilityState.selected).toBe(
      true,
    );
  });

  it('fires onPress', async () => {
    const onPress = jest.fn();
    const view = await wrap(<Chip label="Back" onPress={onPress} />);
    fireEvent.press(view.getByLabelText('Back'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('Card', () => {
  it('is a button only when it can be pressed', async () => {
    const pressable = await wrap(
      <Card onPress={() => {}}>
        <AppText>Tappable</AppText>
      </Card>,
    );
    expect(pressable.getByRole('button')).toBeTruthy();

    const plain = await wrap(
      <Card>
        <AppText>Static</AppText>
      </Card>,
    );
    expect(plain.queryByRole('button')).toBeNull();
  });
});

import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {Button} from '@/ui/Button';
import {Toggle} from '@/ui/Toggle';
import {Stepper} from '@/ui/Stepper';

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider>{ui}</ThemeProvider>);

describe('Button', () => {
  it('fires onPress', async () => {
    const onPress = jest.fn();
    const view = await wrap(<Button label="Create plan" onPress={onPress} />);
    await fireEvent.press(view.getByText('Create plan'));
    expect(onPress).toHaveBeenCalled();
  });

  it('does not fire while disabled, and says so to a screen reader', async () => {
    const onPress = jest.fn();
    const view = await wrap(
      <Button label="Add 0 exercises" onPress={onPress} disabled />,
    );
    const button = view.getByRole('button', {name: /Add 0 exercises/});
    expect(button.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Toggle', () => {
  it('reports its state to a screen reader', async () => {
    const view = await wrap(
      <Toggle label="Same target every set" value onValueChange={jest.fn()} />,
    );
    expect(
      view.getByLabelText('Same target every set').props.accessibilityState
        .checked,
    ).toBe(true);
  });

  it('flips on press', async () => {
    const onValueChange = jest.fn();
    const view = await wrap(
      <Toggle
        label="Same target every set"
        value={false}
        onValueChange={onValueChange}
      />,
    );
    await fireEvent.press(view.getByLabelText('Same target every set'));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});

describe('Stepper', () => {
  it('steps up and down by the given amount', async () => {
    const onChange = jest.fn();
    const view = await wrap(
      <Stepper label="Weight" value={30} step={2.5} onChange={onChange} />,
    );
    await fireEvent.press(view.getByLabelText('Increase Weight'));
    expect(onChange).toHaveBeenCalledWith(32.5);
    await fireEvent.press(view.getByLabelText('Decrease Weight'));
    expect(onChange).toHaveBeenCalledWith(27.5);
  });

  // 2.5 + 2.5 + 2.5 is 7.5 in decimal and 7.500000000000001 in binary floating
  // point. Left alone, a few taps put that into the database as a target.
  it('does not accumulate floating point noise', async () => {
    const onChange = jest.fn();
    const view = await wrap(
      <Stepper label="Weight" value={0.1} step={0.2} onChange={onChange} />,
    );
    await fireEvent.press(view.getByLabelText('Increase Weight'));
    expect(onChange).toHaveBeenCalledWith(0.3);
  });

  it('will not go below its minimum', async () => {
    const onChange = jest.fn();
    const view = await wrap(
      <Stepper label="Reps" value={1} step={1} min={1} onChange={onChange} />,
    );
    await fireEvent.press(view.getByLabelText('Decrease Reps'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('accepts a typed value', async () => {
    const onChange = jest.fn();
    const view = await wrap(
      <Stepper label="Reps" value={10} step={1} onChange={onChange} />,
    );
    await fireEvent.changeText(view.getByLabelText('Reps'), '12');
    expect(onChange).toHaveBeenCalledWith(12);
  });

  it('ignores a typed value that is not a number', async () => {
    const onChange = jest.fn();
    const view = await wrap(
      <Stepper label="Reps" value={10} step={1} onChange={onChange} />,
    );
    await fireEvent.changeText(view.getByLabelText('Reps'), 'abc');
    expect(onChange).not.toHaveBeenCalled();
  });
});

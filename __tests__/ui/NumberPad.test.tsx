import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {NumberPad} from '@/ui/NumberPad';

describe('NumberPad', () => {
  const onSubmit = jest.fn();
  const onClose = jest.fn();

  const renderPad = (props: Partial<React.ComponentProps<typeof NumberPad>>) =>
    render(
      <ThemeProvider>
        <NumberPad
          visible
          title="reps"
          value={10}
          confirmLabel={v => `Set ${v} reps`}
          onSubmit={onSubmit}
          onClose={onClose}
          {...props}
        />
      </ThemeProvider>,
    );

  beforeEach(() => {
    onSubmit.mockClear();
    onClose.mockClear();
  });

  it('opens showing what the field already holds', async () => {
    const view = await renderPad({});
    expect(view.getByText('10')).toBeTruthy();
    expect(view.getByText('Set 10 reps')).toBeTruthy();
  });

  /**
   * The rule the whole component exists for. Accumulating onto 42.5 gives
   * 42.56, which is not a weight anyone meant.
   */
  it('replaces the incoming value with the first key pressed', async () => {
    const view = await renderPad({value: 42.5, allowDecimal: true});
    await fireEvent.press(view.getByLabelText('6'));
    // The readout, not the key that shares its digit.
    expect(view.getByLabelText('reps 6')).toBeTruthy();
    expect(view.queryByText('42.5')).toBeNull();
  });

  it('appends every key after the first', async () => {
    const view = await renderPad({});
    await fireEvent.press(view.getByLabelText('1'));
    await fireEvent.press(view.getByLabelText('2'));
    expect(view.getByText('12')).toBeTruthy();
  });

  it('submits the number that was typed', async () => {
    const view = await renderPad({});
    await fireEvent.press(view.getByLabelText('8'));
    await fireEvent.press(view.getByText('Set 8 reps'));
    expect(onSubmit).toHaveBeenCalledWith(8);
  });

  it('offers no decimal point when the field takes whole numbers', async () => {
    const view = await renderPad({});
    expect(view.queryByLabelText('Decimal point')).toBeNull();
  });

  it('offers a decimal point for weight', async () => {
    const view = await renderPad({
      value: 30,
      allowDecimal: true,
      unit: 'kg',
      confirmLabel: v => `Set ${v} kg`,
    });
    await fireEvent.press(view.getByLabelText('4'));
    await fireEvent.press(view.getByLabelText('Decimal point'));
    await fireEvent.press(view.getByLabelText('5'));
    await fireEvent.press(view.getByText('Set 4.5 kg'));
    expect(onSubmit).toHaveBeenCalledWith(4.5);
  });

  it('ignores a second decimal point', async () => {
    const view = await renderPad({allowDecimal: true});
    await fireEvent.press(view.getByLabelText('4'));
    await fireEvent.press(view.getByLabelText('Decimal point'));
    await fireEvent.press(view.getByLabelText('5'));
    await fireEvent.press(view.getByLabelText('Decimal point'));
    expect(view.getByText('4.5')).toBeTruthy();
  });

  /** A point typed first means a number below one, so it needs the zero. */
  it('writes a leading zero when the point comes first', async () => {
    const view = await renderPad({allowDecimal: true});
    await fireEvent.press(view.getByLabelText('Decimal point'));
    await fireEvent.press(view.getByLabelText('5'));
    expect(view.getByText('0.5')).toBeTruthy();
  });

  it('rounds away a decimal the field does not accept', async () => {
    const view = await renderPad({});
    await fireEvent.press(view.getByLabelText('9'));
    await fireEvent.press(view.getByText('Set 9 reps'));
    expect(onSubmit).toHaveBeenCalledWith(9);
  });

  it('backspaces the last character', async () => {
    const view = await renderPad({});
    await fireEvent.press(view.getByLabelText('1'));
    await fireEvent.press(view.getByLabelText('2'));
    await fireEvent.press(view.getByLabelText('Backspace'));
    expect(view.getByLabelText('reps 1')).toBeTruthy();
  });

  /** Backspace on an untouched field clears it rather than editing it. */
  it('clears the incoming value on the first backspace', async () => {
    const view = await renderPad({value: 120});
    await fireEvent.press(view.getByLabelText('Backspace'));
    expect(view.getByText('—')).toBeTruthy();
    expect(view.queryByText('120')).toBeNull();
  });

  it('cannot submit an empty field', async () => {
    const view = await renderPad({});
    await fireEvent.press(view.getByLabelText('Backspace'));
    await fireEvent.press(view.getByText('Set NaN reps'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cannot submit below the minimum', async () => {
    const view = await renderPad({min: 1});
    await fireEvent.press(view.getByLabelText('0'));
    await fireEvent.press(view.getByText('Set 0 reps'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cannot submit above the maximum', async () => {
    const view = await renderPad({max: 99});
    await fireEvent.press(view.getByLabelText('1'));
    await fireEvent.press(view.getByLabelText('0'));
    await fireEvent.press(view.getByLabelText('0'));
    await fireEvent.press(view.getByText('Set 100 reps'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('closes without writing anything', async () => {
    const view = await renderPad({});
    await fireEvent.press(view.getByLabelText('7'));
    await fireEvent.press(view.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the caption it was given', async () => {
    const view = await renderPad({caption: 'target 10 · last time 11'});
    expect(view.getByText('target 10 · last time 11')).toBeTruthy();
  });
});

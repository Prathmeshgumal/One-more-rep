import React from 'react';
import {Pressable, Text} from 'react-native';
import {render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {NumberField} from '@/ui/NumberField';

type Props = React.ComponentProps<typeof NumberField>;

const renderField = (props: Partial<Props> = {}) =>
  render(
    <ThemeProvider>
      <NumberField
        label="Weight"
        value={20}
        step={0.5}
        decimals={1}
        onChange={jest.fn()}
        {...props}
      />
    </ThemeProvider>,
  );

describe('NumberField', () => {
  it('shows the value it is given, to the requested precision', async () => {
    const view = await renderField();
    expect(view.getByLabelText('Weight').props.value).toBe('20.0');
  });

  it('prints a count naturally when no precision is asked for', async () => {
    const view = await renderField({value: 3, decimals: undefined, label: 'Sets'});
    expect(view.getByLabelText('Sets').props.value).toBe('3');
  });

  it('renders an em dash rather than a zero when there is no value', async () => {
    const view = await renderField({value: null});
    expect(view.getByLabelText('Weight').props.value).toBe('—');
  });

  it('commits a typed value', async () => {
    const onChange = jest.fn();
    const view = await renderField({onChange});
    await fireEvent.changeText(view.getByLabelText('Weight'), '37.5');
    expect(onChange).toHaveBeenLastCalledWith(37.5);
  });

  // Typing "37.5" passes through "3", "37" and "37." on the way. All three
  // parse -- Number('37.') is 37, not NaN -- so all three commit, which is
  // right. What must not happen is the field redrawing itself as "37.0" and
  // eating the decimal point the user is in the middle of typing.
  it('does not fight the user mid-edit', async () => {
    const onChange = jest.fn();
    const view = await renderField({onChange});
    await fireEvent.changeText(view.getByLabelText('Weight'), '3');
    await fireEvent.changeText(view.getByLabelText('Weight'), '37');
    await fireEvent.changeText(view.getByLabelText('Weight'), '37.');
    // Re-queried, not held: the node from the first render does not carry the
    // props of the current one.
    expect(view.getByLabelText('Weight').props.value).toBe('37.');
    expect(onChange).toHaveBeenNthCalledWith(3, 37);
  });

  // The test above uses a jest.fn() parent, which never feeds the value back.
  // A real parent does, on every keystroke, and that is what broke on the
  // device: typing "57.5" into a field showing 62.5 produced 7.5, because the
  // first "5" round-tripped as 5 -> "5.0" and the sync effect threw away the
  // draft mid-word.
  it('survives a parent that echoes every keystroke back', async () => {
    function Controlled() {
      const [value, setValue] = React.useState<number | null>(62.5);
      return (
        <ThemeProvider>
          <NumberField
            label="Weight"
            value={value}
            step={0.5}
            decimals={1}
            onChange={setValue}
          />
        </ThemeProvider>
      );
    }
    const view = await render(<Controlled />);
    const field = () => view.getByLabelText('Weight');

    // Typed the way a keyboard types: each character is appended to whatever
    // the field is actually showing at that moment, not to the string the test
    // wishes were there. Dictating the whole value each time hides the bug,
    // because it papers over any redraw the component did in between.
    //
    // selectTextOnFocus means the first character replaces the old value; the
    // rest append.
    let text = '5';
    await fireEvent.changeText(field(), text);
    for (const ch of ['7', '.', '5']) {
      text = field().props.value + ch;
      await fireEvent.changeText(field(), text);
    }

    expect(field().props.value).toBe('57.5');
    await fireEvent(field(), 'blur');
    expect(field().props.value).toBe('57.5');
  });

  it('still follows a value the field did not type', async () => {
    // The other half: when the parent changes the value for its own reasons —
    // the active set moving on — the draft must be dropped, not defended.
    function Controlled() {
      const [value, setValue] = React.useState<number | null>(20);
      return (
        <ThemeProvider>
          <NumberField label="Weight" value={value} step={0.5} decimals={1} onChange={setValue} />
          <Pressable accessibilityLabel="jump" onPress={() => setValue(80)}>
            <Text>jump</Text>
          </Pressable>
        </ThemeProvider>
      );
    }
    const view = await render(<Controlled />);
    await fireEvent.changeText(view.getByLabelText('Weight'), '3');
    await fireEvent.press(view.getByLabelText('jump'));
    expect(view.getByLabelText('Weight').props.value).toBe('80.0');
  });

  it('does not commit while the field is empty', async () => {
    const onChange = jest.fn();
    const view = await renderField({onChange});
    await fireEvent.changeText(view.getByLabelText('Weight'), '');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('restores the last good value when the field is left empty', async () => {
    const view = await renderField();
    const input = view.getByLabelText('Weight');
    await fireEvent.changeText(input, '');
    await fireEvent(input, 'blur');
    expect(input.props.value).toBe('20.0');
  });

  it('restores the last good value when the draft is nonsense', async () => {
    const onChange = jest.fn();
    const view = await renderField({onChange});
    const input = view.getByLabelText('Weight');
    await fireEvent.changeText(input, '-');
    await fireEvent(input, 'blur');
    expect(input.props.value).toBe('20.0');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('steps by the increment it is given', async () => {
    const onChange = jest.fn();
    const view = await renderField({onChange});
    await fireEvent.press(view.getByLabelText('Increase Weight'));
    expect(onChange).toHaveBeenCalledWith(20.5);
    await fireEvent.press(view.getByLabelText('Decrease Weight'));
    expect(onChange).toHaveBeenLastCalledWith(19.5);
  });

  it('does not drift on repeated fractional steps', async () => {
    // 0.5 is exact in binary, but 20.1 + 0.2 is not, and the same rounding
    // guards both. Three steps must land on exactly 21.5, never
    // 21.500000000000004 written into somebody's history.
    let value = 20;
    const onChange = jest.fn((next: number) => {
      value = next;
    });
    const view = await renderField({onChange});
    for (let i = 0; i < 3; i++) {
      await view.rerender(
        <ThemeProvider>
          <NumberField
            label="Weight"
            value={value}
            step={0.5}
            decimals={1}
            onChange={onChange}
          />
        </ThemeProvider>,
      );
      await fireEvent.press(view.getByLabelText('Increase Weight'));
    }
    expect(value).toBe(21.5);
  });

  it('honours its floor and ceiling', async () => {
    const onChange = jest.fn();
    const view = await renderField({value: 0, min: 0, onChange});
    await fireEvent.press(view.getByLabelText('Decrease Weight'));
    expect(onChange).not.toHaveBeenCalled();

    const capped = await renderField({value: 10, max: 10, onChange});
    await fireEvent.press(capped.getByLabelText('Increase Weight'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps a typed value into range rather than rejecting it', async () => {
    const onChange = jest.fn();
    const view = await renderField({min: 1, onChange});
    await fireEvent.changeText(view.getByLabelText('Weight'), '0');
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('redraws when the value changes underneath it', async () => {
    // The active set moving on hands this field a different number. It has to
    // follow, or the next set opens showing the previous set's weight.
    const view = await renderField();
    await view.rerender(
      <ThemeProvider>
        <NumberField
          label="Weight"
          value={62.5}
          step={0.5}
          decimals={1}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(view.getByLabelText('Weight').props.value).toBe('62.5');
  });

  it('announces its value to a screen reader', async () => {
    const view = await renderField();
    expect(view.getByLabelText('Weight').props.accessibilityValue).toEqual({
      now: 20,
      text: '20.0',
    });
  });

  it('names its shoulders after the field', async () => {
    const view = await renderField({label: 'Reps', decimals: 0});
    expect(view.getByLabelText('Increase Reps')).toBeTruthy();
    expect(view.getByLabelText('Decrease Reps')).toBeTruthy();
  });
});

import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {ActionSheet, type SheetAction} from '@/ui/ActionSheet';

const actions = (over: Partial<SheetAction>[] = []): SheetAction[] => [
  {label: 'Add a note', onPress: jest.fn()},
  {label: 'Swap this exercise', onPress: jest.fn()},
  ...(over as SheetAction[]),
];

const renderSheet = (
  props: Partial<React.ComponentProps<typeof ActionSheet>> = {},
) =>
  render(
    <ThemeProvider>
      <ActionSheet
        visible
        title="Bench Press"
        actions={actions()}
        onClose={jest.fn()}
        {...props}
      />
    </ThemeProvider>,
  );

describe('ActionSheet', () => {
  it('names what it is acting on', async () => {
    const view = await renderSheet();
    expect(view.getByText('Bench Press')).toBeTruthy();
  });

  it('draws a row per action', async () => {
    const view = await renderSheet();
    expect(view.getByLabelText('Add a note')).toBeTruthy();
    expect(view.getByLabelText('Swap this exercise')).toBeTruthy();
  });

  it('runs an action and closes', async () => {
    const onPress = jest.fn();
    const onClose = jest.fn();
    const view = await renderSheet({
      actions: [{label: 'Move up', onPress}],
      onClose,
    });
    await fireEvent.press(view.getByLabelText('Move up'));
    expect(onPress).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  // A control that is not applicable yet should say why rather than vanish.
  // Hiding it leaves the user hunting for something that was there last time.
  it('keeps a disabled action visible and explains it', async () => {
    const onPress = jest.fn();
    const view = await renderSheet({
      actions: [
        {
          label: 'Swap this exercise',
          onPress,
          disabled: true,
          reason: 'A set is already recorded',
        },
      ],
    });
    const row = view.getByLabelText('Swap this exercise');
    expect(row.props.accessibilityState.disabled).toBe(true);
    expect(view.getByText('A set is already recorded')).toBeTruthy();

    await fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('closes when the scrim is pressed', async () => {
    const onClose = jest.fn();
    const view = await renderSheet({onClose});
    await fireEvent.press(view.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('draws nothing when it is not visible', async () => {
    const view = await renderSheet({visible: false});
    expect(view.queryByText('Bench Press')).toBeNull();
  });
});

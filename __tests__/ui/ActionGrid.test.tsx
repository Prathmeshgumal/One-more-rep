import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {ActionGrid, type GridAction} from '@/ui/ActionGrid';

const actions = (over?: GridAction[]): GridAction[] =>
  over ?? [
    {label: 'Add a note', short: 'Note', glyph: '✎', onPress: jest.fn()},
    {label: 'Move up', short: 'Up', glyph: '▲', onPress: jest.fn()},
  ];

const renderGrid = (
  props: Partial<React.ComponentProps<typeof ActionGrid>> = {},
) =>
  render(
    <ThemeProvider>
      <ActionGrid
        visible
        title="Bench Press"
        actions={actions()}
        onClose={jest.fn()}
        {...props}
      />
    </ThemeProvider>,
  );

const blocked: GridAction[] = [
  {label: 'Add a note', short: 'Note', glyph: '✎', onPress: jest.fn()},
  {
    label: 'Swap for another exercise',
    short: 'Swap',
    glyph: '⇄',
    onPress: jest.fn(),
    disabled: true,
    reason: 'A set is already recorded',
  },
  {
    label: 'Move up',
    short: 'Up',
    glyph: '▲',
    onPress: jest.fn(),
    disabled: true,
    reason: 'Already first',
  },
];

describe('ActionGrid', () => {
  it('names what it is acting on', async () => {
    const view = await renderGrid();
    expect(view.getByText('Bench Press')).toBeTruthy();
  });

  /**
   * The tile prints what fits on 111dp; the whole sentence is what it
   * announces, so a screen reader gets the same menu everyone else does.
   */
  it('draws a tile per action, captioned short and announced in full', async () => {
    const view = await renderGrid();
    expect(view.getByText('Note')).toBeTruthy();
    expect(view.getByLabelText('Add a note')).toBeTruthy();
  });

  it('runs an action and closes', async () => {
    const onPress = jest.fn();
    const onClose = jest.fn();
    const view = await renderGrid({
      actions: [{label: 'Move up', short: 'Up', glyph: '▲', onPress}],
      onClose,
    });
    await fireEvent.press(view.getByLabelText('Move up'));
    expect(onPress).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  /**
   * A tile has nowhere to print a reason, which is the one thing the list it
   * replaced could do. So an unavailable tile is still pressable and spends
   * the press explaining itself — and, crucially, does not run.
   */
  it('explains an unavailable action instead of running it', async () => {
    const onPress = jest.fn();
    const onClose = jest.fn();
    const view = await renderGrid({actions: blocked, onClose});

    const tile = view.getByLabelText('Swap for another exercise');
    expect(tile.props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(tile);
    expect(onPress).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      view.getByText('Swap for another exercise — A set is already recorded'),
    ).toBeTruthy();
  });

  it('counts what is greyed out before you press anything', async () => {
    const view = await renderGrid({actions: blocked});
    expect(view.getByText('2 greyed out · tap one to see why')).toBeTruthy();
  });

  it('draws exactly the actions it is given, and nothing of its own', async () => {
    const view = await renderGrid({actions: blocked});
    expect(view.queryByLabelText('Why are some greyed out?')).toBeNull();
  });

  it('says so when there is nothing to explain', async () => {
    const view = await renderGrid();
    expect(view.getByText('Everything here is available')).toBeTruthy();
  });

  /** A sheet reopened must not still be showing what you asked last time. */
  it('forgets the explanation when it closes', async () => {
    const view = await renderGrid({actions: blocked});
    await fireEvent.press(view.getByLabelText('Move up'));
    expect(view.getByText('Move up — Already first')).toBeTruthy();

    await view.rerender(
      <ThemeProvider>
        <ActionGrid
          visible={false}
          title="Bench Press"
          actions={blocked}
          onClose={jest.fn()}
        />
      </ThemeProvider>,
    );
    await view.rerender(
      <ThemeProvider>
        <ActionGrid
          visible
          title="Bench Press"
          actions={blocked}
          onClose={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(view.queryByText('Move up — Already first')).toBeNull();
  });

  it('closes when the scrim is pressed', async () => {
    const onClose = jest.fn();
    const view = await renderGrid({onClose});
    await fireEvent.press(view.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('draws nothing when it is not visible', async () => {
    const view = await renderGrid({visible: false});
    expect(view.queryByText('Bench Press')).toBeNull();
  });
});

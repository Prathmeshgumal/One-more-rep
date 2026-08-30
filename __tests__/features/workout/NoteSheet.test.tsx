import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {NoteSheet} from '@/features/workout/NoteSheet';
import {NOTE_MAX_LENGTH} from '@/constants';

const renderSheet = (
  props: Partial<React.ComponentProps<typeof NoteSheet>> = {},
) =>
  render(
    <ThemeProvider>
      <NoteSheet
        visible
        exerciseName="Bench Press"
        note={null}
        onSave={jest.fn()}
        onClose={jest.fn()}
        {...props}
      />
    </ThemeProvider>,
  );

const of = (n: number) => 'x'.repeat(n);

describe('NoteSheet', () => {
  it('names the exercise it is about', async () => {
    const view = await renderSheet();
    expect(view.getByText('Bench Press')).toBeTruthy();
  });

  it('opens on the note that is already there', async () => {
    const view = await renderSheet({note: 'felt heavy'});
    expect(view.getByLabelText('Note').props.value).toBe('felt heavy');
  });

  /**
   * A note is a sentence or two written between sets, on a phone, with a
   * barbell waiting — not somewhere a training diary quietly accumulates
   * inside a row every history screen renders in full.
   */
  it('stops the field at the limit', async () => {
    const view = await renderSheet();
    expect(view.getByLabelText('Note').props.maxLength).toBe(NOTE_MAX_LENGTH);
  });

  it('says nothing about the limit while you are nowhere near it', async () => {
    const view = await renderSheet();
    await fireEvent.changeText(
      view.getByLabelText('Note'),
      'shoulder felt off',
    );
    expect(view.queryByText(/characters left/)).toBeNull();
  });

  it('starts counting in the last fifth of the field', async () => {
    const view = await renderSheet();
    await fireEvent.changeText(
      view.getByLabelText('Note'),
      of(NOTE_MAX_LENGTH - 120),
    );
    expect(view.getByText('120 characters left')).toBeTruthy();
  });

  it('says so plainly once the field is full', async () => {
    const view = await renderSheet();
    await fireEvent.changeText(
      view.getByLabelText('Note'),
      of(NOTE_MAX_LENGTH),
    );
    expect(view.getByText('that is the whole note')).toBeTruthy();
  });

  it('saves what was written', async () => {
    const onSave = jest.fn();
    const view = await renderSheet({onSave});
    await fireEvent.changeText(
      view.getByLabelText('Note'),
      '  dropped to 15kg  ',
    );
    await fireEvent.press(view.getByText('Save note'));
    expect(onSave).toHaveBeenCalledWith('dropped to 15kg');
  });

  /**
   * An empty field means no note, not a note that is empty: a blank string
   * would render as a stray line under the exercise.
   */
  it('saves an emptied note as no note', async () => {
    const onSave = jest.fn();
    const view = await renderSheet({note: 'felt heavy', onSave});
    await fireEvent.changeText(view.getByLabelText('Note'), '   ');
    await fireEvent.press(view.getByText('Save note'));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('draws nothing when it is not visible', async () => {
    const view = await renderSheet({visible: false});
    expect(view.queryByText('Bench Press')).toBeNull();
  });
});

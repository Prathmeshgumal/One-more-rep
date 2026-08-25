import {useLastCreatedExercise} from '@/features/exercises/useLastCreatedExercise';

describe('useLastCreatedExercise', () => {
  beforeEach(() => useLastCreatedExercise.setState({id: null}));

  it('hands the id to whoever asks first', () => {
    useLastCreatedExercise.getState().set('ex_new');
    expect(useLastCreatedExercise.getState().claim()).toBe('ex_new');
  });

  // Two pickers can be mounted at once in different stacks, and the same
  // picker regains focus every time you come back to it. Either would
  // re-select something the user never chose if claiming did not clear.
  it('cannot be consumed twice', () => {
    useLastCreatedExercise.getState().set('ex_new');
    expect(useLastCreatedExercise.getState().claim()).toBe('ex_new');
    expect(useLastCreatedExercise.getState().claim()).toBeNull();
  });

  it('is empty when nothing was created', () => {
    expect(useLastCreatedExercise.getState().claim()).toBeNull();
  });

  it('keeps only the most recent creation', () => {
    useLastCreatedExercise.getState().set('first');
    useLastCreatedExercise.getState().set('second');
    expect(useLastCreatedExercise.getState().claim()).toBe('second');
  });
});

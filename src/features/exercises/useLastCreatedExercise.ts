import {create} from 'zustand';

/**
 * Hands a newly created exercise back to whichever picker asked for it.
 *
 * The editor is pushed from three different stacks and has no idea which one
 * it is in, so it cannot navigate back *with* a result — and React Navigation
 * params only travel forwards. A store sidesteps both: the editor drops the id
 * here on its way out, and whichever picker regains focus picks it up.
 *
 * `claim` clears as it reads, so one creation cannot be consumed twice — by
 * two pickers left mounted in different stacks, or by the same picker being
 * focused again later and silently re-selecting something.
 */
type LastCreatedExerciseState = {
  id: string | null;
  set: (id: string) => void;
  claim: () => string | null;
};

export const useLastCreatedExercise = create<LastCreatedExerciseState>(
  (setState, getState) => ({
    id: null,
    set: id => setState({id}),
    claim: () => {
      const {id} = getState();
      if (id !== null) {
        setState({id: null});
      }
      return id;
    },
  }),
);

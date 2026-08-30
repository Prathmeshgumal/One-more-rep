import {weightInPlay} from '@/features/workout/weightInPlay';

const bar = {weightApplicable: true};
const body = {weightApplicable: false};
const bare = {targetWeight: null, actualWeight: null};

describe('weightInPlay', () => {
  it('is true whenever the catalogue says the movement takes weight', () => {
    expect(weightInPlay(bar, bare)).toBe(true);
  });

  it('is false for a body-only movement with no weight anywhere', () => {
    expect(weightInPlay(body, bare)).toBe(false);
  });

  /**
   * The reported defect: a 0.5 kg plate planned onto a sit-up rendered as
   * uneditable text, because the catalogue calls a sit-up body only.
   */
  it('is true when the plan gave a body-only set a target weight', () => {
    expect(weightInPlay(body, {targetWeight: 0.5, actualWeight: null})).toBe(
      true,
    );
  });

  it('is true when a body-only set was recorded with a weight', () => {
    expect(weightInPlay(body, {targetWeight: null, actualWeight: 2.5})).toBe(
      true,
    );
  });

  /** A target of zero is a number someone typed, not an absence. */
  it('counts a zero target as a weight in play', () => {
    expect(weightInPlay(body, {targetWeight: 0, actualWeight: null})).toBe(
      true,
    );
  });
});

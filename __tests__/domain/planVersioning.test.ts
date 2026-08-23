import {canEditInPlace} from '@/domain/planVersioning';

const at = (day: number, hour = 12) => new Date(2026, 7, day, hour).getTime();

describe('canEditInPlace', () => {
  // Without the compaction exception, one evening of planning leaves a dozen
  // near-identical versions in the history list.
  it('edits in place while the version is still today and unused', () => {
    expect(
      canEditInPlace({
        effectiveFrom: at(17, 9),
        now: at(17, 21),
        sessionCount: 0,
      }),
    ).toBe(true);
  });

  it('forks once the version is from an earlier day', () => {
    expect(
      canEditInPlace({effectiveFrom: at(16), now: at(17), sessionCount: 0}),
    ).toBe(false);
  });

  // The rule that protects history: once a workout has been performed against
  // this version, its targets are evidence and must not be rewritten.
  it('forks as soon as a session references the version, even today', () => {
    expect(
      canEditInPlace({
        effectiveFrom: at(17, 9),
        now: at(17, 21),
        sessionCount: 1,
      }),
    ).toBe(false);
  });

  it('forks across midnight', () => {
    expect(
      canEditInPlace({
        effectiveFrom: at(17, 23),
        now: at(18, 0) + 60_000,
        sessionCount: 0,
      }),
    ).toBe(false);
  });
});

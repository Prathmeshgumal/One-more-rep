import {
  summarizeProgress,
  type ProgressSession,
} from '@/domain/exerciseProgress';

const AUG = (day: number) => new Date(2026, 7, day).getTime();

/** Newest first, as the repository returns them. */
const HISTORY: ProgressSession[] = [
  {
    sessionId: 's3',
    date: AUG(22),
    sets: [
      {reps: 10, weight: 30},
      {reps: 10, weight: 30},
      {reps: 8, weight: 32.5},
    ],
  },
  {
    sessionId: 's2',
    date: AUG(15),
    sets: [
      {reps: 10, weight: 30},
      {reps: 9, weight: 30},
      {reps: 8, weight: 30},
    ],
  },
  {
    sessionId: 's1',
    date: AUG(8),
    sets: [
      {reps: 10, weight: 25},
      {reps: 10, weight: 25},
      {reps: 10, weight: 25},
    ],
  },
];

describe('summarizeProgress', () => {
  it('returns empty figures for an exercise never performed', () => {
    const p = summarizeProgress([], true);
    expect(p.sessions).toEqual([]);
    expect(p.bestSet).toBeNull();
    expect(p.bestVolume).toBeNull();
    expect(p.workingWeights).toEqual([]);
  });

  it('computes each session volume and keeps the order it was given', () => {
    const p = summarizeProgress(HISTORY, true);
    expect(p.sessions.map(s => s.sessionId)).toEqual(['s3', 's2', 's1']);
    expect(p.sessions.map(s => s.volume)).toEqual([860, 810, 750]);
  });

  it('reports the heaviest weight touched in each session', () => {
    const p = summarizeProgress(HISTORY, true);
    expect(p.sessions.map(s => s.topWeight)).toEqual([32.5, 30, 25]);
  });

  it('reports the best volume across every session', () => {
    expect(summarizeProgress(HISTORY, true).bestVolume).toBe(860);
  });

  it('picks the best set by volume, not by weight alone', () => {
    const p = summarizeProgress(HISTORY, true);
    // 30 x 10 = 300 beats 32.5 x 8 = 260, even though 32.5 is heavier.
    expect(p.bestSet).toEqual({reps: 10, weight: 30, volume: 300});
  });

  it('breaks a tie in favour of the more recent session', () => {
    const tied: ProgressSession[] = [
      {sessionId: 'new', date: AUG(22), sets: [{reps: 10, weight: 30}]},
      {sessionId: 'old', date: AUG(15), sets: [{reps: 10, weight: 30}]},
    ];
    const p = summarizeProgress(tied, true);
    expect(p.bestSet).toEqual({reps: 10, weight: 30, volume: 300});
    expect(p.sessions[0]!.sessionId).toBe('new');
  });

  // §26: for a movement that carries no weight, volume is omitted rather than
  // reported as zero, and reps decide the best set instead.
  it('omits volume entirely for a bodyweight exercise', () => {
    const bodyweight: ProgressSession[] = [
      {sessionId: 'b2', date: AUG(22), sets: [{reps: 12, weight: null}]},
      {sessionId: 'b1', date: AUG(15), sets: [{reps: 15, weight: null}]},
    ];
    const p = summarizeProgress(bodyweight, false);
    expect(p.sessions.map(s => s.volume)).toEqual([null, null]);
    expect(p.bestVolume).toBeNull();
    expect(p.bestSet).toEqual({reps: 15, weight: null, volume: null});
    expect(p.workingWeights).toEqual([]);
  });

  it('reads the working weight run oldest to newest', () => {
    expect(summarizeProgress(HISTORY, true).workingWeights).toEqual([
      25, 30, 32.5,
    ]);
  });

  it('collapses a weight held across several sessions into one step', () => {
    const plateau: ProgressSession[] = [
      {sessionId: 'e', date: AUG(22), sets: [{reps: 8, weight: 32.5}]},
      {sessionId: 'd', date: AUG(21), sets: [{reps: 10, weight: 30}]},
      {sessionId: 'c', date: AUG(20), sets: [{reps: 10, weight: 30}]},
      {sessionId: 'b', date: AUG(19), sets: [{reps: 10, weight: 30}]},
      {sessionId: 'a', date: AUG(18), sets: [{reps: 10, weight: 27.5}]},
    ];
    expect(summarizeProgress(plateau, true).workingWeights).toEqual([
      27.5, 30, 32.5,
    ]);
  });

  it('keeps only the most recent steps of the run', () => {
    const long: ProgressSession[] = [40, 37.5, 35, 32.5, 30, 27.5, 25].map(
      (weight, i) => ({
        sessionId: `s${i}`,
        date: AUG(22 - i),
        sets: [{reps: 10, weight}],
      }),
    );
    // The design draws four steps; the run is a sentence, not a table.
    expect(summarizeProgress(long, true).workingWeights).toEqual([
      32.5, 35, 37.5, 40,
    ]);
    expect(
      summarizeProgress(long, true, {runLength: 2}).workingWeights,
    ).toEqual([37.5, 40]);
  });

  it('ignores a session with no weight recorded when building the run', () => {
    const patchy: ProgressSession[] = [
      {sessionId: 'b', date: AUG(22), sets: [{reps: 10, weight: 30}]},
      {sessionId: 'a', date: AUG(15), sets: [{reps: 10, weight: null}]},
    ];
    const p = summarizeProgress(patchy, true);
    expect(p.sessions[1]!.topWeight).toBeNull();
    expect(p.workingWeights).toEqual([30]);
  });
});

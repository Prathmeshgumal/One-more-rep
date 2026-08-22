import {loadSeedExercises} from '@/db/seed';
import {MUSCLE_FILTERS} from '@/features/exercises/muscles';

const seedExerciseData = loadSeedExercises();

describe('bundled exercise seed', () => {
  it('carries a substantial library', () => {
    expect(seedExerciseData.length).toBeGreaterThan(700);
  });

  it('has no duplicate ids', () => {
    const ids = new Set(seedExerciseData.map(e => e.id));
    expect(ids.size).toBe(seedExerciseData.length);
  });

  it('gives every exercise a name, a primary muscle, and a type', () => {
    for (const e of seedExerciseData) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.primaryMuscle.length).toBeGreaterThan(0);
      expect(e.exerciseType.length).toBeGreaterThan(0);
    }
  });

  it('marks bodyweight movements as not weight-bearing', () => {
    const bodyOnly = seedExerciseData.filter(e => e.equipment === 'body only');
    expect(bodyOnly.length).toBeGreaterThan(0);
    for (const e of bodyOnly) {
      expect(e.weightApplicable).toBe(false);
    }
  });

  it('marks barbell and dumbbell movements as weight-bearing', () => {
    const loaded = seedExerciseData.filter(
      e => e.equipment === 'barbell' || e.equipment === 'dumbbell',
    );
    expect(loaded.length).toBeGreaterThan(100);
    for (const e of loaded) {
      expect(e.weightApplicable).toBe(true);
    }
  });

  it('keeps barbell lifts performed with bands weight-bearing', () => {
    // A name mentioning bands says nothing about load. These are barbell
    // lifts; marking them unweighted would silently lose their volume.
    for (const name of [
      'Deadlift with Bands',
      'Squat with Bands',
      'Reverse Band Bench Press',
      'Sumo Deadlift with Bands',
      'Rack Pull with Bands',
    ]) {
      const found = seedExerciseData.find(e => e.name === name);
      expect(found).toBeDefined();
      expect(found!.weightApplicable).toBe(true);
    }
  });

  it('keeps pure band work unweighted even when tagged powerlifting', () => {
    for (const name of ['Band Good Morning', 'Hip Lift with Band', 'Band Pull Apart']) {
      const found = seedExerciseData.find(e => e.name === name);
      expect(found).toBeDefined();
      expect(found!.weightApplicable).toBe(false);
    }
  });

  it('treats assisted machines as unweighted and added load as weighted', () => {
    const assisted = seedExerciseData.find(e => e.name === 'Band Assisted Pull-Up');
    expect(assisted?.weightApplicable).toBe(false);
    const weighted = seedExerciseData.find(e => e.name === 'Weighted Pull Ups');
    expect(weighted?.weightApplicable).toBe(true);
  });

  it('is sorted by name, so the library needs no runtime sort', () => {
    const names = seedExerciseData.map(e => e.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });
});

describe('muscle filters', () => {
  it('covers every primary muscle in the library, so nothing is unreachable', () => {
    const covered = new Set(MUSCLE_FILTERS.flatMap(f => f.values));
    const used = new Set(seedExerciseData.map(e => e.primaryMuscle));
    const missing = [...used].filter(m => !covered.has(m));
    expect(missing).toEqual([]);
  });

  it('never lists the same muscle under two labels', () => {
    const all = MUSCLE_FILTERS.flatMap(f => f.values);
    expect(new Set(all).size).toBe(all.length);
  });
});

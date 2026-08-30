/**
 * Whether this set has a weight worth showing a control for.
 *
 * The catalogue's `weightApplicable` is a statement about the movement in
 * general — a sit-up is body only, and `exercises.json` says so. But the plan
 * editor never consulted that flag, so a 0.5 kg plate held on your chest went
 * into the target quite happily, and the session screen then printed
 * `TARGET 11 × 0.5 KG` above a screen with no way to change it. The set knew
 * about a weight the exercise denied existed.
 *
 * So the set gets the casting vote. A weight is in play when the catalogue
 * says the movement takes one, or when this particular set already carries a
 * target or a recorded weight — which is the only way an exercise the
 * catalogue calls body-only can end up with a number on it in the first place.
 *
 * Deliberately *not* used for the value the screen opens holding: a bodyweight
 * set with no weight anywhere should still arrive at `null`, not at a zero
 * that reads like a measurement.
 */
export function weightInPlay(
  exercise: {weightApplicable: boolean},
  set: {targetWeight: number | null; actualWeight: number | null},
): boolean {
  return (
    exercise.weightApplicable ||
    set.targetWeight !== null ||
    set.actualWeight !== null
  );
}

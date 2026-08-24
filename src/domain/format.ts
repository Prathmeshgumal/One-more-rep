/** A true minus sign — a hyphen is the wrong width beside tabular figures. */
const MINUS = '−';

/**
 * "4,280". Written out rather than delegated to `toLocaleString`, for the same
 * reason the month names are: Hermes ships without full ICU data, so the
 * device and Node disagree about the output.
 */
export function groupDigits(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [whole = '0', fraction = ''] = Math.abs(rounded).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const trimmed = fraction.replace(/0+$/, '');
  const sign = rounded < 0 ? MINUS : '';
  return trimmed ? `${sign}${grouped}.${trimmed}` : `${sign}${grouped}`;
}

/** "48 min", "1 h 15 min" — how long a session took (design 14). */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Just enough of a set to describe what it is aiming at. */
export type TargetLineSet = {
  targetReps: number;
  targetWeight: number | null;
};

/**
 * "3 × 10 · 60.0 kg" — what an exercise is asking of you, in one line.
 *
 * Written three times across the plan day, the Today list and the workout card
 * before it lived here, and one of those copies hard-coded "kg", which was
 * simply wrong for anyone training in pounds.
 *
 * A ramp is reported as varied rather than collapsed to its first set: "3 × 12"
 * for a 12/10/8 ladder is a lie, and the honest short form is to say there is
 * no short form.
 */
export function targetLine(
  sets: readonly TargetLineSet[],
  unit: string,
): string {
  const [first, ...rest] = sets;
  if (!first) {
    return 'No sets';
  }
  const uniform = rest.every(
    s =>
      s.targetReps === first.targetReps &&
      s.targetWeight === first.targetWeight,
  );
  if (!uniform) {
    return `${sets.length} sets · varied`;
  }
  const base = `${sets.length} × ${first.targetReps}`;
  return first.targetWeight === null
    ? base
    : `${base} · ${first.targetWeight.toFixed(1)} ${unit}`;
}

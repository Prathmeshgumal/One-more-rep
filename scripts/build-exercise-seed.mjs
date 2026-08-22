// Transforms free-exercise-db into the bundled seed (D12, spec 4.1).
//
// weight_applicable does not exist upstream and must be derived. The rule here
// is mechanical and deliberately conservative; every case it is unsure about
// lands in docs/exercise-weight-review.md for a human to settle, and the
// answers live in scripts/weight-overrides.json.
//
// Why this is not just a nice-to-have: the flag decides whether an exercise
// ever contributes volume. Wrong means zero kilograms recorded forever, and
// §39 forbids rewriting history. Silent, permanent, unfixable after the fact.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';

const SOURCE = '.exercise-source/exercises.json';
const SEED = 'src/db/seed/exercises.json';
const OVERRIDES = 'scripts/weight-overrides.json';
const REVIEW = 'docs/exercise-weight-review.md';

const source = JSON.parse(readFileSync(SOURCE, 'utf8'));
const overrides = JSON.parse(readFileSync(OVERRIDES, 'utf8'));

/** Categories where a kilogram figure is never meaningful. */
const NON_WEIGHTED_TYPES = new Set(['stretching', 'cardio', 'plyometrics']);

/** Categories that are loaded by definition. */
const ALWAYS_WEIGHTED_TYPES = new Set(['strongman', 'powerlifting']);

/**
 * Equipment that always carries a kilogram figure, whatever the category says.
 * Plyometrics is normally unweighted, but "Dumbbell Seated Box Jump" is a jump
 * performed holding dumbbells — the equipment is the stronger signal.
 */
const ALWAYS_WEIGHTED_EQUIPMENT = new Set([
  'barbell',
  'dumbbell',
  'kettlebells',
  'e-z curl bar',
  'cable',
  'machine',
  'medicine ball',
]);

/** Equipment that carries no weight number a person could record. */
const NON_WEIGHTED_EQUIPMENT = new Set([
  'body only',
  'bands',
  'foam roll',
  'exercise ball',
  'none',
]);

/**
 * Name-level facts that beat the equipment field, because they describe how
 * the movement is loaded rather than what it is performed on:
 *
 *   assisted — the machine subtracts weight; recording it would invert volume
 *   weighted — a bodyweight movement carrying real added load
 *   sled     — real plates, pushed rather than lifted, but still a kg figure
 *
 * There is deliberately no "band" rule. A name mentioning bands says nothing
 * about whether weight applies: "Band Pull Apart" is pure elastic, but
 * "Deadlift with Bands" and "Reverse Band Bench Press" are barbell lifts where
 * the bar weight is the whole point. Ten such lifts would have been marked
 * unweighted, silently losing their volume forever. The equipment field
 * already marks genuine band work as `bands`, which is the correct signal.
 *
 * `\bsled\b` rather than `sled`, so Sledgehammer Swings is not swept in.
 */
const NAME_RULES = [
  {match: /\bassisted\b/i, weightApplicable: false},
  {match: /\bweighted\b/i, weightApplicable: true},
  {match: /\bsled\b/i, weightApplicable: true},
];

function deriveWeightApplicable(entry) {
  for (const rule of NAME_RULES) {
    if (rule.match.test(entry.name)) return rule.weightApplicable;
  }
  // Equipment is checked before category, and deliberately so: three pure-band
  // movements are categorised "powerlifting" upstream, and a category cannot
  // conjure a kilogram figure onto apparatus that has none.
  if (entry.equipment && NON_WEIGHTED_EQUIPMENT.has(entry.equipment)) return false;
  if (entry.equipment && ALWAYS_WEIGHTED_EQUIPMENT.has(entry.equipment)) return true;
  if (NON_WEIGHTED_TYPES.has(entry.category)) return false;
  if (ALWAYS_WEIGHTED_TYPES.has(entry.category)) return true;
  if (!entry.equipment) return false;
  return true;
}

/**
 * What the rules genuinely cannot settle.
 *
 * Upstream's "other" equipment on a strength movement is a real coin-flip: the
 * group holds bodyweight work (muscle-ups, hyperextensions, inverted rows)
 * alongside plate-loaded work (front plate raise, plate neck resistance).
 * Nothing in the data separates them, so a person has to look.
 *
 * Everything else the rules above decide, and decide correctly — verified
 * against the full dataset rather than assumed.
 */
function ambiguityReason(entry) {
  if (NAME_RULES.some(r => r.match.test(entry.name))) return null;
  if (entry.equipment === 'other' && entry.category === 'strength') {
    return 'equipment "other" on a strength movement';
  }
  return null;
}

const ambiguous = [];
const rows = source.map(entry => {
  const [first, ...restPrimary] = entry.primaryMuscles ?? [];
  const secondary = [...restPrimary, ...(entry.secondaryMuscles ?? [])];

  const derived = deriveWeightApplicable(entry);
  const hasOverride = Object.prototype.hasOwnProperty.call(overrides, entry.id);
  const weightApplicable = hasOverride ? overrides[entry.id] : derived;

  const reason = ambiguityReason(entry);
  if (!hasOverride && reason) {
    ambiguous.push({
      id: entry.id,
      name: entry.name,
      equipment: entry.equipment ?? null,
      category: entry.category,
      derived,
      reason,
    });
  }

  return {
    id: entry.id,
    name: entry.name,
    primaryMuscle: first ?? 'other',
    secondaryMuscles: secondary,
    equipment: entry.equipment ?? null,
    exerciseType: entry.category ?? 'strength',
    instructions: (entry.instructions ?? []).join('\n\n') || null,
    weightApplicable,
  };
});

rows.sort((a, b) => a.name.localeCompare(b.name));

mkdirSync('src/db/seed', {recursive: true});
writeFileSync(SEED, JSON.stringify(rows) + '\n');

const weighted = rows.filter(r => r.weightApplicable).length;

const lines = [
  '# `weight_applicable` review',
  '',
  'Generated by `npm run seed:build`. This file is the record of a decision, not documentation.',
  '',
  '## Why this matters',
  '',
  'Every exercise carries one flag: does a kilogram figure mean anything for this movement?',
  'A bodyweight movement wrongly marked weight-bearing logs zero-kilogram volume into',
  'history forever, and §39 forbids rewriting history. Wrong here is silent and permanent.',
  '',
  '## Current state',
  '',
  `- Source: free-exercise-db, ${source.length} exercises, The Unlicense.`,
  `- Weight-bearing: ${weighted}. Bodyweight or unweighted: ${rows.length - weighted}.`,
  `- Human decisions recorded in \`scripts/weight-overrides.json\`: ${Object.keys(overrides).length}.`,
  `- Outstanding: **${ambiguous.length}**.`,
  '',
];

if (ambiguous.length === 0) {
  lines.push(
    '## Outstanding cases',
    '',
    'None. Every ambiguous case has a decision in `scripts/weight-overrides.json`.',
    '',
  );
} else {
  const byReason = new Map();
  for (const a of ambiguous) {
    if (!byReason.has(a.reason)) byReason.set(a.reason, []);
    byReason.get(a.reason).push(a);
  }

  lines.push(
    '## Outstanding cases',
    '',
    'The question for each: **would writing down a kilogram figure here be meaningful?**',
    '',
    'Add an entry to `scripts/weight-overrides.json` for each, then re-run `npm run seed:build`.',
    '',
  );

  for (const [reason, group] of [...byReason.entries()].sort()) {
    lines.push(`### ${reason} — ${group.length}`, '');
    lines.push('| id | name | equipment | derived |', '|---|---|---|---|');
    for (const a of group.sort((x, y) => x.name.localeCompare(y.name))) {
      lines.push(
        `| \`${a.id}\` | ${a.name} | ${a.equipment ?? '—'} | ${a.derived} |`,
      );
    }
    lines.push('');
  }
}

writeFileSync(REVIEW, lines.join('\n'));

console.log(`Wrote ${rows.length} exercises to ${SEED}`);
console.log(`${ambiguous.length} case(s) need review — see ${REVIEW}`);

# Phase 1 — Exercise Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a searchable, filterable exercise library of ~800 movements seeded from free-exercise-db, plus the ability to create and edit your own — the first phase you can actually use.

**Architecture:** A checked-in Node script transforms free-exercise-db into `src/db/seed/exercises.json`, which is bundled and inserted on first launch inside one transaction. `exerciseRepo` is the only place SQL appears; it receives its Drizzle instance by injection exactly as `settingsRepo` does. The Exercises tab gains a native stack: list → detail → editor. Search and filtering happen in SQL, not in JavaScript over a loaded array.

**Tech Stack:** As Phase 0 — React Native CLI 0.87 · TypeScript strict · op-sqlite + Drizzle · TanStack Query · React Navigation · Jest + better-sqlite3 + RNTL

**Spec:** [`docs/superpowers/specs/2026-08-22-workout-tracker-design.md`](../specs/2026-08-22-workout-tracker-design.md) §4.1, §29, §30, D12

**Design:** Screens 18 (Exercise library) and 19 (Exercise — create custom) in [`docs/design/screens.html`](../../design/screens.html). Approved and binding (D13).

**Prerequisite:** Phase 0 complete (tag `phase-0`).

---

## Global Constraints

Everything in Phase 0's Global Constraints still applies. In particular: no Expo, Android only, TypeScript strict, `domain/` imports nothing from `db/`, repositories take a database rather than importing one, colours and type come from `src/theme/tokens.ts` by name, and below-target is never red.

Carried forward from Phase 0's hard-won findings — do not regress these:

- **`src/db/client.ts` adapts the op-sqlite connection for drizzle.** drizzle-orm 0.45.2's driver is broken on every read path against op-sqlite v18. Do not remove the adapter, and do not upgrade either package without re-running the Phase 0 device gate.
- **Metro needs `unstable_enablePackageExports: true`.** Without it drizzle's ESM internal imports do not resolve.
- **React Native Testing Library 14's `render` is async.** Always `await render(...)`.
- **QueryClients in tests need `gcTime: 0` and an explicit `clear()` in teardown**, or the run hangs.
- **Every `createTestDb()` must be closed** in teardown.
- **Wait for a control to be *live*, not merely present, before firing an event.** Screens
  disable their controls while the first query is in flight, and `findBy*` resolves as soon
  as the element exists. Pressing then lands on a dead control and the test fails
  intermittently. Wait on the loaded state first, then press.
- **Assert on the UI, then on the database — never poll the database inside `waitFor`.**
  The screen only updates after a write and its invalidation, so the UI is the honest
  signal; polling the database races the mutation.

New for this phase:

- **`weight_applicable` is permanent and silent when wrong.** A bodyweight movement wrongly marked weight-bearing logs zero-kilogram volume into history forever, and §39 forbids rewriting history. It gets a human review pass before it ships (Task 2).
- **Exercises are soft-deleted only.** An exercise referenced by history must never be hard-deleted. Every read filters `deleted_at IS NULL` unless explicitly asked not to.
- **Custom exercises behave identically to built-ins** (§30). `is_custom` drives one badge and edit permission — nothing else. No separate code path, no separate table.
- **No exercise images.** ~1,600 photos would dominate APK size and §41 places them out of scope.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/db/schema/exercises.ts` | The `exercises` table. |
| `src/db/migrations/0001_*.ts` | Generated. Adds `exercises`. |
| `scripts/fetch-exercise-source.mjs` | Downloads free-exercise-db to a gitignored working copy. |
| `scripts/build-exercise-seed.mjs` | Transforms it, applies overrides, writes the seed and the review report. |
| `scripts/weight-overrides.json` | Human decisions on `weight_applicable`. Committed. Hand-edited. |
| `src/db/seed/exercises.json` | The bundled seed. Generated, committed. |
| `src/db/seed/index.ts` | Imports the JSON and types it. |
| `src/db/seed/seedExercises.ts` | Idempotent first-launch insert. |
| `src/repositories/exerciseRepo.ts` | All exercise SQL. |
| `src/features/exercises/ExerciseListScreen.tsx` | Screen 18. |
| `src/features/exercises/ExerciseDetailScreen.tsx` | Read-only view of a built-in; entry point to editing a custom. |
| `src/features/exercises/ExerciseEditorScreen.tsx` | Screen 19, create and edit. |
| `src/features/exercises/useExercises.ts` | Query hooks and keys. |
| `src/features/exercises/muscles.ts` | The filter groups and their display order. |
| `src/navigation/ExercisesStack.tsx` | list → detail → editor. |
| `src/ui/SearchField.tsx`, `src/ui/Chip.tsx`, `src/ui/Card.tsx` | Primitives the design needs; reused by Phase 2's picker. |
| `docs/exercise-weight-review.md` | Generated review report. Committed as the record of the decision. |

---

## Task 1: The exercises table

**Files:**
- Create: `src/db/schema/exercises.ts`
- Modify: `src/db/schema/index.ts`
- Create: `src/db/migrations/0001_*.ts` (generated)
- Test: `__tests__/db/exerciseSchema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `exercises` — Drizzle table.
  - `type ExerciseRow = typeof exercises.$inferSelect`
  - `type NewExercise = typeof exercises.$inferInsert`

- [ ] **Step 1: Write the failing test**

Create `__tests__/db/exerciseSchema.test.ts`:

```ts
import {getTableConfig} from 'drizzle-orm/sqlite-core';
import {exercises} from '@/db/schema';

describe('exercises schema', () => {
  it('carries every column section 4.1 specifies', () => {
    const names = getTableConfig(exercises)
      .columns.map(c => c.name)
      .sort();
    expect(names).toEqual([
      'deleted_at',
      'equipment',
      'exercise_type',
      'id',
      'instructions',
      'is_custom',
      'name',
      'primary_muscle',
      'secondary_muscles',
      'updated_at',
      'weight_applicable',
    ]);
  });

  it('allows equipment and instructions to be absent but nothing else', () => {
    const optional = getTableConfig(exercises)
      .columns.filter(c => !c.notNull)
      .map(c => c.name)
      .sort();
    expect(optional).toEqual(['deleted_at', 'equipment', 'instructions']);
  });

  it('indexes the columns the library screen filters and sorts on', () => {
    const indexed = getTableConfig(exercises)
      .indexes.map(i => i.config.name)
      .sort();
    expect(indexed).toEqual([
      'exercises_name_idx',
      'exercises_primary_muscle_idx',
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest exerciseSchema
```

Expected: FAIL — `exercises` is not exported from `@/db/schema`.

- [ ] **Step 3: Write the schema**

Create `src/db/schema/exercises.ts`:

```ts
import {sqliteTable, text, integer, index} from 'drizzle-orm/sqlite-core';

/**
 * The exercise library (§29, §30). Built-ins are seeded from free-exercise-db
 * (D12); custom exercises are created by the user and behave identically.
 *
 * Rows are soft-deleted only. An exercise referenced by a past workout must
 * never be hard-deleted, because §39 forbids history changing shape.
 */
export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    primaryMuscle: text('primary_muscle').notNull(),
    /** JSON array of muscle names. Empty array when there are none. */
    secondaryMuscles: text('secondary_muscles').notNull(),
    equipment: text('equipment'),
    exerciseType: text('exercise_type').notNull(),
    instructions: text('instructions'),
    /**
     * Whether weight is meaningful for this movement (§26). Wrong values are
     * silent and permanent — see docs/exercise-weight-review.md.
     */
    weightApplicable: integer('weight_applicable', {mode: 'boolean'}).notNull(),
    isCustom: integer('is_custom', {mode: 'boolean'}).notNull(),
    deletedAt: integer('deleted_at'),
    updatedAt: integer('updated_at').notNull(),
  },
  table => [
    index('exercises_name_idx').on(table.name),
    index('exercises_primary_muscle_idx').on(table.primaryMuscle),
  ],
);

export type ExerciseRow = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
```

Update `src/db/schema/index.ts`:

```ts
export * from './settings';
export * from './exercises';
```

- [ ] **Step 4: Run the tests**

```bash
npx jest exerciseSchema
```

Expected: PASS, all three.

- [ ] **Step 5: Generate the migration**

```bash
npm run db:generate
```

Expected: a new `src/db/migrations/0001_*.ts` with `version = 2`, and `index.ts` listing both migrations.

Verify the runner still agrees the list is contiguous:

```bash
npx jest migrate
```

Expected: PASS. The "applies the real shipped migrations" test now creates two tables.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add exercises table"
```

---

## Task 2: The seed transform and the weight_applicable review

This is the task with permanent consequences. The mechanical derivation is a starting point, not the answer — it gets reviewed by a human before it ships.

**Files:**
- Create: `scripts/fetch-exercise-source.mjs`, `scripts/build-exercise-seed.mjs`, `scripts/weight-overrides.json`
- Create: `src/db/seed/exercises.json`, `src/db/seed/index.ts`
- Create: `docs/exercise-weight-review.md`
- Modify: `.gitignore`, `package.json`
- Test: `__tests__/db/seed.test.ts`

**Interfaces:**
- Consumes: `NewExercise` (Task 1).
- Produces:
  - `seedExerciseData: readonly SeedExercise[]` from `@/db/seed`
  - `type SeedExercise` — the JSON row shape: `{id, name, primaryMuscle, secondaryMuscles: string[], equipment: string | null, exerciseType, instructions: string | null, weightApplicable: boolean}`

- [ ] **Step 1: Fetch the source**

Create `scripts/fetch-exercise-source.mjs`:

```js
// Downloads free-exercise-db's dataset to a gitignored working copy.
// The committed artefact is src/db/seed/exercises.json, not this.
import {writeFileSync, mkdirSync} from 'node:fs';

const URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const OUT = '.exercise-source/exercises.json';

const response = await fetch(URL);
if (!response.ok) {
  console.error(`Fetch failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}
const body = await response.text();
const parsed = JSON.parse(body);
if (!Array.isArray(parsed) || parsed.length < 500) {
  console.error(`Unexpected payload: ${parsed.length ?? 'not an array'} entries`);
  process.exit(1);
}

mkdirSync('.exercise-source', {recursive: true});
writeFileSync(OUT, body);
console.log(`Wrote ${parsed.length} source exercises to ${OUT}`);
```

Add to `.gitignore`:

```
# Upstream exercise data. The committed artefact is src/db/seed/exercises.json
.exercise-source/
```

Add to `package.json` scripts:

```json
"seed:fetch": "node scripts/fetch-exercise-source.mjs",
"seed:build": "node scripts/build-exercise-seed.mjs"
```

Run it:

```bash
npm run seed:fetch
```

Expected: roughly 800 entries written.

- [ ] **Step 2: Confirm the licence has not changed**

D12 rests on free-exercise-db being public domain. Verify rather than assume:

```bash
curl -s https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/LICENSE.md | head -5
```

Expected: the Unlicense. **If it is anything else, stop and raise it** — a Play Store release makes this a real question, not a formality.

- [ ] **Step 3: Write the transform**

Create `scripts/build-exercise-seed.mjs`. The field mapping is §4.1's, verbatim:

```js
// Transforms free-exercise-db into the bundled seed (D12, spec 4.1).
//
// weight_applicable does not exist upstream and must be derived. The rule here
// is mechanical and deliberately conservative; every case it is unsure about
// lands in docs/exercise-weight-review.md for a human to settle, and the
// answers live in scripts/weight-overrides.json.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';

const SOURCE = '.exercise-source/exercises.json';
const SEED = 'src/db/seed/exercises.json';
const OVERRIDES = 'scripts/weight-overrides.json';
const REVIEW = 'docs/exercise-weight-review.md';

const source = JSON.parse(readFileSync(SOURCE, 'utf8'));
const overrides = JSON.parse(readFileSync(OVERRIDES, 'utf8'));

const NON_WEIGHTED_TYPES = new Set(['stretching', 'cardio', 'plyometrics']);
const NON_WEIGHTED_EQUIPMENT = new Set(['body only', 'bands', 'foam roll', 'none']);

/** Cases the mechanical rule cannot settle on its own. */
function isAmbiguous(entry) {
  const name = entry.name.toLowerCase();
  return (
    name.includes('assisted') ||
    name.includes('weighted') ||
    name.includes('sled') ||
    name.includes('band') ||
    entry.equipment === null ||
    entry.equipment === undefined
  );
}

function deriveWeightApplicable(entry) {
  if (NON_WEIGHTED_TYPES.has(entry.category)) return false;
  if (entry.equipment && NON_WEIGHTED_EQUIPMENT.has(entry.equipment)) return false;
  if (!entry.equipment) return false;
  return true;
}

const ambiguous = [];
const rows = source.map(entry => {
  const [first, ...restPrimary] = entry.primaryMuscles ?? [];
  const secondary = [...restPrimary, ...(entry.secondaryMuscles ?? [])];

  const derived = deriveWeightApplicable(entry);
  const override = Object.prototype.hasOwnProperty.call(overrides, entry.id)
    ? overrides[entry.id]
    : undefined;
  const weightApplicable = override ?? derived;

  if (override === undefined && isAmbiguous(entry)) {
    ambiguous.push({id: entry.id, name: entry.name, equipment: entry.equipment, derived});
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
writeFileSync(SEED, JSON.stringify(rows, null, 0) + '\n');

const counts = rows.reduce(
  (acc, r) => ({...acc, [r.weightApplicable ? 'weighted' : 'bodyweight']:
    (r.weightApplicable ? acc.weighted : acc.bodyweight) + 1}),
  {weighted: 0, bodyweight: 0},
);

const lines = [
  '# `weight_applicable` review',
  '',
  'Generated by `npm run seed:build`. This file is the record of a decision, not documentation.',
  '',
  `Source: free-exercise-db, ${source.length} exercises.`,
  `Derived: ${counts.weighted} weight-bearing, ${counts.bodyweight} bodyweight.`,
  `Human overrides applied: ${Object.keys(overrides).length}.`,
  '',
  '## Why this matters',
  '',
  'A bodyweight movement wrongly marked weight-bearing logs zero-kilogram volume into',
  'history forever, and §39 forbids rewriting history. Wrong here is silent and permanent.',
  '',
  '## Cases the mechanical rule could not settle',
  '',
  ambiguous.length === 0
    ? 'None outstanding — every ambiguous case has an entry in `scripts/weight-overrides.json`.'
    : 'Add an entry to `scripts/weight-overrides.json` for each, then re-run `npm run seed:build`.',
  '',
];

if (ambiguous.length > 0) {
  lines.push('| id | name | equipment | derived |', '|---|---|---|---|');
  for (const a of ambiguous) {
    lines.push(`| \`${a.id}\` | ${a.name} | ${a.equipment ?? '—'} | ${a.derived} |`);
  }
  lines.push('');
}

writeFileSync(REVIEW, lines.join('\n'));

console.log(`Wrote ${rows.length} exercises to ${SEED}`);
console.log(`${ambiguous.length} case(s) need review — see ${REVIEW}`);
```

Create `scripts/weight-overrides.json` as an empty object to start:

```json
{}
```

- [ ] **Step 4: Run it and read the review**

```bash
npm run seed:build
cat docs/exercise-weight-review.md
```

- [ ] **Step 5: Settle every ambiguous case**

**This step requires a human decision and must not be guessed.** For each row in the review table, decide whether weight is meaningful for that movement and add it to `scripts/weight-overrides.json`:

```json
{
  "Assisted_Pull_Up": false,
  "Weighted_Dip": true,
  "Sled_Push": true
}
```

The guiding question is not "is this hard" but **"would recording a kilogram figure against this be meaningful?"** Assisted machines subtract weight rather than adding it, so they record as bodyweight. Weighted variants of bodyweight moves record the added weight. Sled work records the load.

Re-run until the review reports none outstanding:

```bash
npm run seed:build
```

Expected: `0 case(s) need review`.

- [ ] **Step 6: Write the typed seed module**

Create `src/db/seed/index.ts`:

```ts
import data from './exercises.json';

export type SeedExercise = {
  readonly id: string;
  readonly name: string;
  readonly primaryMuscle: string;
  readonly secondaryMuscles: readonly string[];
  readonly equipment: string | null;
  readonly exerciseType: string;
  readonly instructions: string | null;
  readonly weightApplicable: boolean;
};

export const seedExerciseData: readonly SeedExercise[] = data as SeedExercise[];
```

TypeScript needs to be told JSON imports are allowed. Add to `tsconfig.json` `compilerOptions`:

```json
"resolveJsonModule": true
```

- [ ] **Step 7: Write the seed data test**

Create `__tests__/db/seed.test.ts`. These assertions guard the data itself, which is the thing most likely to rot silently:

```ts
import {seedExerciseData} from '@/db/seed';

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

  it('is sorted by name, so the library needs no runtime sort', () => {
    const names = seedExerciseData.map(e => e.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });
});
```

- [ ] **Step 8: Run the tests**

```bash
npx jest seed
```

Expected: PASS, all six.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add exercise seed transform with reviewed weight_applicable"
```

---

## Task 3: The exercise repository

**Files:**
- Create: `src/repositories/exerciseRepo.ts`
- Test: `__tests__/repositories/exerciseRepo.test.ts`

**Interfaces:**
- Consumes: `AppDatabase`, `exercises`, `ExerciseRow` (Task 1).
- Produces:
  - `type Exercise` — `ExerciseRow` with `secondaryMuscles` parsed to `string[]`.
  - `type ExerciseQuery = {search?: string; muscles?: readonly string[]; includeDeleted?: boolean}`
  - `listExercises(db, query?): Promise<Exercise[]>`
  - `getExercise(db, id): Promise<Exercise | undefined>`
  - `createCustomExercise(db, input): Promise<Exercise>` where input is `{name, primaryMuscle, secondaryMuscles, equipment, weightApplicable, instructions?}`
  - `updateCustomExercise(db, id, patch): Promise<Exercise>`
  - `softDeleteExercise(db, id): Promise<void>`
  - `countExercises(db): Promise<number>`

- [ ] **Step 1: Write the failing test**

Create `__tests__/repositories/exerciseRepo.test.ts`:

```ts
import {runMigrations} from '@/db/migrate';
import {
  listExercises,
  getExercise,
  createCustomExercise,
  updateCustomExercise,
  softDeleteExercise,
  countExercises,
} from '@/repositories/exerciseRepo';
import {createTestDb} from '../helpers/testDb';

describe('exerciseRepo', () => {
  let ctx: ReturnType<typeof createTestDb>;

  const seed = async () => {
    await createCustomExercise(ctx.db, {
      name: 'Cable Fly',
      primaryMuscle: 'chest',
      secondaryMuscles: ['shoulders'],
      equipment: 'cable',
      weightApplicable: true,
    });
    await createCustomExercise(ctx.db, {
      name: 'Air Squat',
      primaryMuscle: 'quadriceps',
      secondaryMuscles: [],
      equipment: 'body only',
      weightApplicable: false,
    });
  };

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
  });
  afterEach(() => ctx.close());

  it('starts empty', async () => {
    expect(await countExercises(ctx.db)).toBe(0);
  });

  it('creates a custom exercise and reads it back with parsed muscles', async () => {
    const created = await createCustomExercise(ctx.db, {
      name: 'Cable Fly',
      primaryMuscle: 'chest',
      secondaryMuscles: ['shoulders', 'triceps'],
      equipment: 'cable',
      weightApplicable: true,
    });
    expect(created.isCustom).toBe(true);
    expect(created.secondaryMuscles).toEqual(['shoulders', 'triceps']);

    const read = await getExercise(ctx.db, created.id);
    expect(read?.secondaryMuscles).toEqual(['shoulders', 'triceps']);
  });

  it('lists alphabetically by name', async () => {
    await seed();
    const all = await listExercises(ctx.db);
    expect(all.map(e => e.name)).toEqual(['Air Squat', 'Cable Fly']);
  });

  it('searches by name, case-insensitively', async () => {
    await seed();
    const found = await listExercises(ctx.db, {search: 'cable'});
    expect(found.map(e => e.name)).toEqual(['Cable Fly']);
  });

  it('matches a search term anywhere in the name', async () => {
    await seed();
    const found = await listExercises(ctx.db, {search: 'squat'});
    expect(found.map(e => e.name)).toEqual(['Air Squat']);
  });

  it('treats a search term with SQL wildcards literally', async () => {
    await seed();
    expect(await listExercises(ctx.db, {search: '%'})).toEqual([]);
  });

  it('filters by primary muscle', async () => {
    await seed();
    const found = await listExercises(ctx.db, {muscles: ['chest']});
    expect(found.map(e => e.name)).toEqual(['Cable Fly']);
  });

  it('filters by a group of muscles, so Back catches lats and traps alike', async () => {
    await seed();
    const found = await listExercises(ctx.db, {muscles: ['chest', 'quadriceps']});
    expect(found.map(e => e.name)).toEqual(['Air Squat', 'Cable Fly']);
  });

  it('treats an empty muscle group as no filter', async () => {
    await seed();
    expect(await listExercises(ctx.db, {muscles: []})).toHaveLength(2);
  });

  it('combines search and muscle filter', async () => {
    await seed();
    expect(
      await listExercises(ctx.db, {search: 'cable', muscles: ['quadriceps']}),
    ).toEqual([]);
  });

  it('updates a custom exercise', async () => {
    const created = await createCustomExercise(ctx.db, {
      name: 'Cable Fly',
      primaryMuscle: 'chest',
      secondaryMuscles: [],
      equipment: 'cable',
      weightApplicable: true,
    });
    const updated = await updateCustomExercise(ctx.db, created.id, {
      name: 'Cable Fly (wide grip)',
      weightApplicable: false,
    });
    expect(updated.name).toBe('Cable Fly (wide grip)');
    expect(updated.weightApplicable).toBe(false);
    expect(updated.primaryMuscle).toBe('chest');
  });

  it('hides soft-deleted exercises but keeps the row', async () => {
    await seed();
    const [first] = await listExercises(ctx.db);
    await softDeleteExercise(ctx.db, first!.id);

    expect((await listExercises(ctx.db)).map(e => e.name)).toEqual(['Cable Fly']);
    expect(await countExercises(ctx.db)).toBe(2);
    expect(await getExercise(ctx.db, first!.id)).toBeDefined();
  });

  it('can be asked for deleted exercises explicitly', async () => {
    await seed();
    const [first] = await listExercises(ctx.db);
    await softDeleteExercise(ctx.db, first!.id);
    expect(await listExercises(ctx.db, {includeDeleted: true})).toHaveLength(2);
  });

  it('stamps updatedAt on every write', async () => {
    const created = await createCustomExercise(ctx.db, {
      name: 'Cable Fly',
      primaryMuscle: 'chest',
      secondaryMuscles: [],
      equipment: 'cable',
      weightApplicable: true,
    });
    await new Promise(r => setTimeout(r, 5));
    const updated = await updateCustomExercise(ctx.db, created.id, {name: 'Fly'});
    expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest exerciseRepo
```

Expected: FAIL — `Cannot find module '@/repositories/exerciseRepo'`.

- [ ] **Step 3: Write the repository**

Create `src/repositories/exerciseRepo.ts`:

```ts
import {and, asc, eq, inArray, isNull, like, sql} from 'drizzle-orm';
import {exercises, type ExerciseRow} from '@/db/schema';
import type {AppDatabase} from '@/db/types';

/** An exercise with its JSON muscle list parsed. */
export type Exercise = Omit<ExerciseRow, 'secondaryMuscles'> & {
  secondaryMuscles: string[];
};

export type ExerciseQuery = {
  search?: string;
  /**
   * Primary muscles to include. A group, not a single value: the upstream data
   * splits the back across lats, middle back, lower back and traps, so one
   * "Back" filter must match all four.
   */
  muscles?: readonly string[];
  includeDeleted?: boolean;
};

export type NewCustomExercise = {
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string | null;
  weightApplicable: boolean;
  instructions?: string | null;
};

export type CustomExercisePatch = Partial<NewCustomExercise>;

function hydrate(row: ExerciseRow): Exercise {
  let parsed: string[] = [];
  try {
    const value: unknown = JSON.parse(row.secondaryMuscles);
    if (Array.isArray(value)) {
      parsed = value.filter((m): m is string => typeof m === 'string');
    }
  } catch {
    // A malformed muscle list is not worth failing a screen over; it renders
    // as "no secondary muscles" and the row is otherwise intact.
  }
  return {...row, secondaryMuscles: parsed};
}

/** LIKE treats % and _ as wildcards; a user typing them means them literally. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, c => `\\${c}`);
}

export async function listExercises(
  db: AppDatabase,
  query: ExerciseQuery = {},
): Promise<Exercise[]> {
  const conditions = [];
  if (!query.includeDeleted) {
    conditions.push(isNull(exercises.deletedAt));
  }
  if (query.search?.trim()) {
    conditions.push(
      like(sql`lower(${exercises.name})`, `%${escapeLike(query.search.trim().toLowerCase())}%`),
    );
  }
  if (query.muscles && query.muscles.length > 0) {
    conditions.push(inArray(exercises.primaryMuscle, [...query.muscles]));
  }

  const rows = await db
    .select()
    .from(exercises)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(exercises.name));

  return rows.map(hydrate);
}

export async function getExercise(
  db: AppDatabase,
  id: string,
): Promise<Exercise | undefined> {
  const rows = await db.select().from(exercises).where(eq(exercises.id, id)).limit(1);
  const row = rows[0];
  return row ? hydrate(row) : undefined;
}

export async function countExercises(db: AppDatabase): Promise<number> {
  const rows = await db
    .select({n: sql<number>`count(*)`})
    .from(exercises);
  return rows[0]?.n ?? 0;
}

export async function createCustomExercise(
  db: AppDatabase,
  input: NewCustomExercise,
): Promise<Exercise> {
  const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await db.insert(exercises).values({
    id,
    name: input.name.trim(),
    primaryMuscle: input.primaryMuscle,
    secondaryMuscles: JSON.stringify(input.secondaryMuscles),
    equipment: input.equipment,
    exerciseType: 'strength',
    instructions: input.instructions ?? null,
    weightApplicable: input.weightApplicable,
    isCustom: true,
    deletedAt: null,
    updatedAt: Date.now(),
  });

  const created = await getExercise(db, id);
  if (!created) {
    throw new Error('Exercise could not be created.');
  }
  return created;
}

export async function updateCustomExercise(
  db: AppDatabase,
  id: string,
  patch: CustomExercisePatch,
): Promise<Exercise> {
  const values: Record<string, unknown> = {updatedAt: Date.now()};
  if (patch.name !== undefined) values.name = patch.name.trim();
  if (patch.primaryMuscle !== undefined) values.primaryMuscle = patch.primaryMuscle;
  if (patch.secondaryMuscles !== undefined) {
    values.secondaryMuscles = JSON.stringify(patch.secondaryMuscles);
  }
  if (patch.equipment !== undefined) values.equipment = patch.equipment;
  if (patch.weightApplicable !== undefined) {
    values.weightApplicable = patch.weightApplicable;
  }
  if (patch.instructions !== undefined) values.instructions = patch.instructions;

  await db.update(exercises).set(values).where(eq(exercises.id, id));

  const updated = await getExercise(db, id);
  if (!updated) {
    throw new Error(`Exercise ${id} does not exist.`);
  }
  return updated;
}

/** Soft delete only — history may reference this row (§39). */
export async function softDeleteExercise(db: AppDatabase, id: string): Promise<void> {
  await db
    .update(exercises)
    .set({deletedAt: Date.now(), updatedAt: Date.now()})
    .where(eq(exercises.id, id));
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest exerciseRepo
```

Expected: PASS, all twelve.

- [ ] **Step 5: Verify the whole suite and types**

```bash
npm test
npm run typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add exercise repository with search, filter, and soft delete"
```

---

## Task 4: First-launch seeding

Eight hundred inserts on the app's first open, on a phone, without a spinner that outstays its welcome.

**Files:**
- Create: `src/db/seed/seedExercises.ts`
- Modify: `src/providers/DatabaseGate.tsx`
- Test: `__tests__/db/seedExercises.test.ts`

**Interfaces:**
- Consumes: `AppDatabase`, `exercises` (Task 1), `seedExerciseData` (Task 2), `countExercises` (Task 3).
- Produces: `seedExercises(db, data?): Promise<{inserted: number}>`

- [ ] **Step 1: Write the failing test**

Create `__tests__/db/seedExercises.test.ts`:

```ts
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {seedExercises} from '@/db/seed/seedExercises';
import {seedExerciseData} from '@/db/seed';
import {listExercises, createCustomExercise} from '@/repositories/exerciseRepo';
import {createTestDb} from '../helpers/testDb';

describe('seedExercises', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
  });
  afterEach(() => ctx.close());

  it('inserts the whole library on an empty database', async () => {
    const result = await seedExercises(ctx.db);
    expect(result.inserted).toBe(seedExerciseData.length);
    expect(await listExercises(ctx.db)).toHaveLength(seedExerciseData.length);
  });

  it('is a no-op on a database that already holds the library', async () => {
    await seedExercises(ctx.db);
    const second = await seedExercises(ctx.db);
    expect(second.inserted).toBe(0);
    expect(await listExercises(ctx.db)).toHaveLength(seedExerciseData.length);
  });

  it('never overwrites a custom exercise', async () => {
    const mine = await createCustomExercise(ctx.db, {
      name: 'My Movement',
      primaryMuscle: 'chest',
      secondaryMuscles: [],
      equipment: 'cable',
      weightApplicable: true,
    });
    await seedExercises(ctx.db);
    const all = await listExercises(ctx.db);
    expect(all.find(e => e.id === mine.id)?.name).toBe('My Movement');
    expect(all).toHaveLength(seedExerciseData.length + 1);
  });

  it('marks every seeded exercise as not custom', async () => {
    await seedExercises(ctx.db);
    const all = await listExercises(ctx.db);
    expect(all.every(e => e.isCustom === false)).toBe(true);
  });

  it('stores secondary muscles as parseable JSON', async () => {
    await seedExercises(ctx.db);
    const all = await listExercises(ctx.db);
    expect(all.every(e => Array.isArray(e.secondaryMuscles))).toBe(true);
  });

  it('inserts inside a transaction, leaving nothing behind on failure', async () => {
    const poison = [
      ...seedExerciseData.slice(0, 3),
      {...seedExerciseData[0]!, name: null as unknown as string},
    ];
    await expect(seedExercises(ctx.db, poison)).rejects.toThrow();
    const rows = await ctx.db.all<{n: number}>(sql`SELECT COUNT(*) AS n FROM exercises`);
    expect(rows[0]?.n).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest seedExercises
```

Expected: FAIL — `Cannot find module '@/db/seed/seedExercises'`.

- [ ] **Step 3: Write the seeder**

Create `src/db/seed/seedExercises.ts`:

```ts
import {sql} from 'drizzle-orm';
import {exercises} from '@/db/schema';
import type {AppDatabase} from '@/db/types';
import {seedExerciseData, type SeedExercise} from './index';

/**
 * Inserts in batches rather than one statement per row: ~800 individual
 * round trips is slow enough to be visible on first launch.
 */
const BATCH_SIZE = 100;

/**
 * Populates the exercise library on first launch.
 *
 * Idempotent by counting built-ins rather than by upsert, so a user's edits to
 * their own exercises are never touched. A future library refresh ships as a
 * migration that clears built-ins and re-seeds, not as a change here.
 */
export async function seedExercises(
  db: AppDatabase,
  data: readonly SeedExercise[] = seedExerciseData,
): Promise<{inserted: number}> {
  const existing = await db.all<{n: number}>(
    sql`SELECT COUNT(*) AS n FROM exercises WHERE is_custom = 0`,
  );
  if ((existing[0]?.n ?? 0) > 0) {
    return {inserted: 0};
  }

  const now = Date.now();
  const rows = data.map(e => ({
    id: e.id,
    name: e.name,
    primaryMuscle: e.primaryMuscle,
    secondaryMuscles: JSON.stringify(e.secondaryMuscles),
    equipment: e.equipment,
    exerciseType: e.exerciseType,
    instructions: e.instructions,
    weightApplicable: e.weightApplicable,
    isCustom: false,
    deletedAt: null,
    updatedAt: now,
  }));

  await db.run(sql.raw('BEGIN'));
  try {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await db.insert(exercises).values(rows.slice(i, i + BATCH_SIZE));
    }
    await db.run(sql.raw('COMMIT'));
  } catch (error) {
    await db.run(sql.raw('ROLLBACK'));
    throw error instanceof Error ? error : new Error(String(error));
  }

  return {inserted: rows.length};
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest seedExercises
```

Expected: PASS, all six.

- [ ] **Step 5: Run seeding at startup**

In `src/providers/DatabaseGate.tsx`, import the seeder and call it immediately after migrations:

```tsx
import {seedExercises} from '@/db/seed/seedExercises';
```

Inside the effect, change:

```tsx
        const db = getDb();
        await runMigrations(db);
```

to:

```tsx
        const db = getDb();
        await runMigrations(db);
        await seedExercises(db);
```

The gate already renders a spinner while this runs and a blocking error screen if it throws, so seeding inherits both.

- [ ] **Step 6: Verify**

```bash
npm test
npm run typecheck
```

Expected: both pass. The `DatabaseGate` tests still pass because seeding an empty database is valid.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: seed the exercise library on first launch"
```

---

## Task 5: UI primitives the library needs

Screen 18 needs a search field, filter chips, and a card. Phase 2's exercise picker reuses all three, so they are built as primitives rather than inline.

**Files:**
- Create: `src/ui/SearchField.tsx`, `src/ui/Chip.tsx`, `src/ui/Card.tsx`
- Create: `src/features/exercises/muscles.ts`
- Test: `__tests__/ui/primitives.test.tsx`

**Interfaces:**
- Consumes: `useTheme`, `type`, `space`, `radius` (Phase 0).
- Produces:
  - `SearchField` — props `{value: string; onChangeText: (t: string) => void; placeholder?: string}`
  - `Chip` — props `{label: string; selected?: boolean; onPress?: () => void}`
  - `Card` — props `{onPress?: () => void; children: React.ReactNode}`
  - `MUSCLE_FILTERS: ReadonlyArray<{label: string; values: readonly string[]}>`

- [ ] **Step 1: Write the failing test**

Create `__tests__/ui/primitives.test.tsx`:

```tsx
import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {SearchField} from '@/ui/SearchField';
import {Chip} from '@/ui/Chip';
import {Card} from '@/ui/Card';
import {AppText} from '@/ui/Text';

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider>{ui}</ThemeProvider>);

describe('SearchField', () => {
  it('reports what the user types', async () => {
    const onChangeText = jest.fn();
    const view = await wrap(
      <SearchField value="" onChangeText={onChangeText} placeholder="Search exercises" />,
    );
    fireEvent.changeText(view.getByPlaceholderText('Search exercises'), 'squat');
    expect(onChangeText).toHaveBeenCalledWith('squat');
  });
});

describe('Chip', () => {
  it('exposes its selected state to assistive technology', async () => {
    const view = await wrap(<Chip label="Chest" selected />);
    expect(view.getByLabelText('Chest').props.accessibilityState.selected).toBe(true);
  });

  it('fires onPress', async () => {
    const onPress = jest.fn();
    const view = await wrap(<Chip label="Back" onPress={onPress} />);
    fireEvent.press(view.getByLabelText('Back'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('Card', () => {
  it('is a button only when it can be pressed', async () => {
    const pressable = await wrap(
      <Card onPress={() => {}}>
        <AppText>Tappable</AppText>
      </Card>,
    );
    expect(pressable.getByRole('button')).toBeTruthy();

    const plain = await wrap(
      <Card>
        <AppText>Static</AppText>
      </Card>,
    );
    expect(plain.queryByRole('button')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest primitives
```

Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Write the primitives**

Create `src/ui/Card.tsx`:

```tsx
import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useTheme, space, radius} from '@/theme';

export function Card({
  onPress,
  children,
}: {
  onPress?: () => void;
  children: React.ReactNode;
}) {
  const {colors} = useTheme();
  const style = [
    styles.card,
    {backgroundColor: colors.surface, borderColor: colors.ruleSoft},
  ];

  if (!onPress) {
    return <View style={style}>{children}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [style, pressed && {backgroundColor: colors.surface2}]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.xs,
  },
});
```

Create `src/ui/Chip.tsx`:

```tsx
import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {useTheme, space, radius} from '@/theme';
import {AppText} from './Text';

export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{selected}}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.plate : colors.surface,
          borderColor: selected ? colors.plate : colors.rule,
        },
      ]}>
      <AppText variant="small" color={selected ? 'plateInk' : 'ink2'}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
});
```

Create `src/ui/SearchField.tsx`:

```tsx
import React from 'react';
import {StyleSheet, TextInput, View} from 'react-native';
import {useTheme, type as typeScale, space, radius} from '@/theme';

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) {
  const {colors} = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        {backgroundColor: colors.surface, borderColor: colors.rule},
      ]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        style={[typeScale.body, styles.input, {color: colors.ink}]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
  },
  input: {paddingVertical: space.md},
});
```

Create `src/features/exercises/muscles.ts`. The values are free-exercise-db's own
muscle names, which is why they are lowercase. Each label covers a **group**, because
the upstream data splits body parts across several names — verified against the actual
dataset, whose 873 exercises use exactly seventeen primary-muscle values:

```ts
/**
 * The filter row on screen 18.
 *
 * Labels are ours; values are free-exercise-db's own muscle names. Each label
 * covers a group because the upstream data is finer-grained than a person
 * browsing a gym: "back" is four separate values there, and "legs" is six.
 * Matching only one of each would hide most of the library — Legs alone would
 * drop from 298 exercises to 148.
 *
 * Every one of the seventeen upstream values appears here exactly once, so no
 * exercise is unreachable by filtering. `neck` sits under Back, next to traps,
 * which is where neck work lands in practice.
 */
export const MUSCLE_FILTERS: ReadonlyArray<{
  label: string;
  values: readonly string[];
}> = [
  {label: 'All', values: []},
  {label: 'Chest', values: ['chest']},
  {label: 'Back', values: ['lats', 'middle back', 'lower back', 'traps', 'neck']},
  {
    label: 'Legs',
    values: [
      'quadriceps',
      'hamstrings',
      'glutes',
      'calves',
      'adductors',
      'abductors',
    ],
  },
  {label: 'Shoulders', values: ['shoulders']},
  {label: 'Arms', values: ['biceps', 'triceps', 'forearms']},
  {label: 'Core', values: ['abdominals']},
];
```

Add a test that the grouping stays exhaustive as the dataset changes. Append to
`__tests__/db/seed.test.ts`:

```ts
import {MUSCLE_FILTERS} from '@/features/exercises/muscles';

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
```

- [ ] **Step 4: Run the tests**

```bash
npx jest primitives
```

Expected: PASS, all four.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add search field, chip, and card primitives"
```

---

## Task 6: The exercise library screen

Screen 18, and the phase's centrepiece.

**Files:**
- Create: `src/features/exercises/useExercises.ts`, `src/features/exercises/ExerciseListScreen.tsx`
- Create: `src/navigation/ExercisesStack.tsx`
- Modify: `src/navigation/RootNavigator.tsx`, `src/navigation/types.ts`
- Delete: `src/features/exercises/ExercisesScreen.tsx`
- Test: `__tests__/features/exercises/ExerciseListScreen.test.tsx`

**Interfaces:**
- Consumes: `listExercises`, `Exercise` (Task 3); `useDatabase` (Phase 0); `SearchField`, `Chip`, `Card`, `MUSCLE_FILTERS` (Task 5).
- Produces:
  - `exerciseKeys = {all: ['exercises'] as const, list: (q: ExerciseQuery) => ['exercises', 'list', q] as const}`
  - `useExerciseListQuery(query: ExerciseQuery)`
  - `type ExercisesStackParamList = {ExerciseList: undefined; ExerciseDetail: {id: string}; ExerciseEditor: {id?: string}}`

- [ ] **Step 1: Write the failing test**

Create `__tests__/features/exercises/ExerciseListScreen.test.tsx`:

```tsx
import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {runMigrations} from '@/db/migrate';
import {createCustomExercise} from '@/repositories/exerciseRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {ExerciseListScreen} from '@/features/exercises/ExerciseListScreen';
import {createTestDb} from '../../helpers/testDb';

describe('ExerciseListScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <ExerciseListScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: 0}}});

    await createCustomExercise(ctx.db, {
      name: 'Cable Fly',
      primaryMuscle: 'chest',
      secondaryMuscles: ['shoulders'],
      equipment: 'cable',
      weightApplicable: true,
    });
    await createCustomExercise(ctx.db, {
      name: 'Air Squat',
      primaryMuscle: 'quadriceps',
      secondaryMuscles: [],
      equipment: 'body only',
      weightApplicable: false,
    });
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('lists what is in the library', async () => {
    const view = await renderScreen();
    expect(await view.findByText('Cable Fly')).toBeTruthy();
    expect(view.getByText('Air Squat')).toBeTruthy();
  });

  it('shows each exercise its muscles and equipment', async () => {
    const view = await renderScreen();
    expect(await view.findByText(/chest.*cable/i)).toBeTruthy();
  });

  it('badges custom exercises', async () => {
    const view = await renderScreen();
    expect((await view.findAllByText('Custom')).length).toBe(2);
  });

  it('narrows the list as the user searches', async () => {
    const view = await renderScreen();
    await view.findByText('Cable Fly');
    fireEvent.changeText(view.getByPlaceholderText('Search exercises'), 'squat');
    await waitFor(() => {
      expect(view.queryByText('Cable Fly')).toBeNull();
    });
    expect(view.getByText('Air Squat')).toBeTruthy();
  });

  it('filters by muscle when a chip is tapped', async () => {
    const view = await renderScreen();
    await view.findByText('Cable Fly');
    fireEvent.press(view.getByLabelText('Chest'));
    await waitFor(() => {
      expect(view.queryByText('Air Squat')).toBeNull();
    });
    expect(view.getByText('Cable Fly')).toBeTruthy();
  });

  it('says so plainly when a search matches nothing', async () => {
    const view = await renderScreen();
    await view.findByText('Cable Fly');
    fireEvent.changeText(view.getByPlaceholderText('Search exercises'), 'zzzz');
    expect(await view.findByText(/No exercises match/i)).toBeTruthy();
  });

  it('counts the library', async () => {
    const view = await renderScreen();
    expect(await view.findByText('2 exercises')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest ExerciseListScreen
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the query hooks**

Create `src/features/exercises/useExercises.ts`:

```ts
import {useQuery} from '@tanstack/react-query';
import {useDatabase} from '@/providers/DatabaseGate';
import {listExercises, getExercise, type ExerciseQuery} from '@/repositories/exerciseRepo';

export const exerciseKeys = {
  all: ['exercises'] as const,
  list: (query: ExerciseQuery) => ['exercises', 'list', query] as const,
  detail: (id: string) => ['exercises', 'detail', id] as const,
};

export function useExerciseListQuery(query: ExerciseQuery) {
  const db = useDatabase();
  return useQuery({
    queryKey: exerciseKeys.list(query),
    queryFn: () => listExercises(db, query),
  });
}

export function useExerciseQuery(id: string) {
  const db = useDatabase();
  return useQuery({
    queryKey: exerciseKeys.detail(id),
    queryFn: () => getExercise(db, id),
  });
}
```

- [ ] **Step 4: Write the screen**

Create `src/features/exercises/ExerciseListScreen.tsx`:

```tsx
import React, {useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Card} from '@/ui/Card';
import {Chip} from '@/ui/Chip';
import {SearchField} from '@/ui/SearchField';
import {useTheme, space} from '@/theme';
import type {Exercise} from '@/repositories/exerciseRepo';
import type {ExercisesStackParamList} from '@/navigation/types';
import {MUSCLE_FILTERS} from './muscles';
import {useExerciseListQuery} from './useExercises';

/** "Chest · Shoulders — Cable", matching the design's exmeta line. */
function describe(exercise: Exercise): string {
  const muscles = [exercise.primaryMuscle, ...exercise.secondaryMuscles]
    .map(m => m.charAt(0).toUpperCase() + m.slice(1))
    .join(' · ');
  return exercise.equipment
    ? `${muscles} — ${exercise.equipment}`
    : muscles;
}

export function ExerciseListScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<ExercisesStackParamList>>();

  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('All');

  const selected = MUSCLE_FILTERS.find(f => f.label === group) ?? MUSCLE_FILTERS[0]!;

  const {data, isPending} = useExerciseListQuery({
    search: search || undefined,
    muscles: selected.values.length ? selected.values : undefined,
  });

  const header = (
    <View style={styles.header}>
      <AppText variant="eyebrow" color="muted">
        {isPending || !data
          ? 'Loading'
          : `${data.length} exercise${data.length === 1 ? '' : 's'}`}
      </AppText>
      <AppText variant="h1">Exercises</AppText>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search exercises"
      />

      <View style={styles.chips}>
        {MUSCLE_FILTERS.map(filter => (
          <Chip
            key={filter.label}
            label={filter.label}
            selected={group === filter.label}
            onPress={() => setGroup(filter.label)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.root, {backgroundColor: colors.paper}]}>
      <FlatList
        data={data ?? []}
        keyExtractor={item => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={[
          styles.content,
          {paddingTop: insets.top + space.xl},
        ]}
        ListEmptyComponent={
          isPending ? null : (
            <AppText color="muted">
              No exercises match that. Try a different search, or create your own.
            </AppText>
          )
        }
        renderItem={({item}) => (
          <Card
            onPress={() => navigation.navigate('ExerciseDetail', {id: item.id})}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <AppText variant="bodyStrong">{item.name}</AppText>
                <AppText variant="small" color="muted">
                  {describe(item)}
                </AppText>
              </View>
              {item.isCustom ? (
                <AppText variant="monoSmall" color="muted">
                  Custom
                </AppText>
              ) : null}
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.md},
  header: {gap: space.md, marginBottom: space.xs},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: space.sm},
  row: {flexDirection: 'row', alignItems: 'center', gap: space.md},
  grow: {flex: 1, gap: 2},
});
```

- [ ] **Step 5: Add the stack**

Add to `src/navigation/types.ts`:

```ts
export type ExercisesStackParamList = {
  ExerciseList: undefined;
  ExerciseDetail: {id: string};
  ExerciseEditor: {id?: string};
};
```

Create `src/navigation/ExercisesStack.tsx`. `ExerciseDetailScreen` and `ExerciseEditorScreen` arrive in Task 7 — build this after them, or stub them to compile:

```tsx
import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {ExerciseListScreen} from '@/features/exercises/ExerciseListScreen';
import {ExerciseDetailScreen} from '@/features/exercises/ExerciseDetailScreen';
import {ExerciseEditorScreen} from '@/features/exercises/ExerciseEditorScreen';
import type {ExercisesStackParamList} from './types';

const Stack = createNativeStackNavigator<ExercisesStackParamList>();

export function ExercisesStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="ExerciseList" component={ExerciseListScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      <Stack.Screen name="ExerciseEditor" component={ExerciseEditorScreen} />
    </Stack.Navigator>
  );
}
```

In `src/navigation/RootNavigator.tsx`, replace the `ExercisesScreen` import and usage with `ExercisesStack`, and delete `src/features/exercises/ExercisesScreen.tsx`.

- [ ] **Step 6: Run the tests**

```bash
npx jest ExerciseListScreen
npm test
```

Expected: PASS. The `RootNavigator` test's `/exercise library appears/i` marker no longer exists — update it to `/Search exercises/i`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add the exercise library screen with search and muscle filters"
```

---

## Task 7: Exercise detail and the custom exercise editor

Screen 19, plus a read-only view for built-ins that reuses its field layout.

**A note on scope.** The approved designs cover the library list and the create-custom form. They do not include a detail screen, but screen 18's cards are drawn as tappable, so one is required. It is built strictly from screen 19's existing field layout rendered read-only — an extension of an approved design, not a new invention. If it wants a design of its own, that is a Phase 5 polish item.

**Files:**
- Create: `src/features/exercises/ExerciseDetailScreen.tsx`, `src/features/exercises/ExerciseEditorScreen.tsx`, `src/features/exercises/useExerciseMutations.ts`
- Test: `__tests__/features/exercises/ExerciseEditorScreen.test.tsx`

**Interfaces:**
- Consumes: `createCustomExercise`, `updateCustomExercise`, `softDeleteExercise`, `getExercise` (Task 3); `exerciseKeys`, `useExerciseQuery` (Task 6); primitives (Task 5).
- Produces: `useCreateExercise()`, `useUpdateExercise()`, `useDeleteExercise()`

- [ ] **Step 1: Write the failing test**

Create `__tests__/features/exercises/ExerciseEditorScreen.test.tsx`:

```tsx
import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {runMigrations} from '@/db/migrate';
import {listExercises} from '@/repositories/exerciseRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {ExerciseEditorScreen} from '@/features/exercises/ExerciseEditorScreen';
import {createTestDb} from '../../helpers/testDb';

const goBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({goBack, navigate: jest.fn()}),
  useRoute: () => ({params: {}}),
}));

describe('ExerciseEditorScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <ExerciseEditorScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: 0}}});
    goBack.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('will not save without a name', async () => {
    const view = await renderScreen();
    fireEvent.press(view.getByText('Save exercise'));
    expect(await view.findByText(/Give the exercise a name/i)).toBeTruthy();
    expect(await listExercises(ctx.db)).toHaveLength(0);
  });

  it('saves a custom exercise and goes back', async () => {
    const view = await renderScreen();
    fireEvent.changeText(view.getByPlaceholderText('Exercise name'), 'Cable Fly');
    fireEvent.press(view.getByLabelText('Chest'));
    fireEvent.press(view.getByLabelText('Cable'));
    fireEvent.press(view.getByText('Save exercise'));

    await waitFor(async () => {
      expect(await listExercises(ctx.db)).toHaveLength(1);
    });
    const [saved] = await listExercises(ctx.db);
    expect(saved!.name).toBe('Cable Fly');
    expect(saved!.primaryMuscle).toBe('chest');
    expect(saved!.equipment).toBe('cable');
    expect(saved!.isCustom).toBe(true);
    expect(goBack).toHaveBeenCalled();
  });

  it('tracks weight by default and can be turned off', async () => {
    const view = await renderScreen();
    expect(view.getByLabelText('Track weight').props.accessibilityState.checked).toBe(true);

    fireEvent.changeText(view.getByPlaceholderText('Exercise name'), 'Air Squat');
    fireEvent.press(view.getByLabelText('Chest'));
    fireEvent.press(view.getByLabelText('Bodyweight'));
    fireEvent.press(view.getByLabelText('Track weight'));
    fireEvent.press(view.getByText('Save exercise'));

    await waitFor(async () => {
      expect(await listExercises(ctx.db)).toHaveLength(1);
    });
    const [saved] = await listExercises(ctx.db);
    expect(saved!.weightApplicable).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest ExerciseEditorScreen
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the mutation hooks**

Create `src/features/exercises/useExerciseMutations.ts`:

```ts
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useDatabase} from '@/providers/DatabaseGate';
import {
  createCustomExercise,
  updateCustomExercise,
  softDeleteExercise,
  type NewCustomExercise,
  type CustomExercisePatch,
} from '@/repositories/exerciseRepo';
import {exerciseKeys} from './useExercises';

export function useCreateExercise() {
  const db = useDatabase();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NewCustomExercise) => createCustomExercise(db, input),
    onSuccess: () => client.invalidateQueries({queryKey: exerciseKeys.all}),
  });
}

export function useUpdateExercise() {
  const db = useDatabase();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({id, patch}: {id: string; patch: CustomExercisePatch}) =>
      updateCustomExercise(db, id, patch),
    onSuccess: () => client.invalidateQueries({queryKey: exerciseKeys.all}),
  });
}

export function useDeleteExercise() {
  const db = useDatabase();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeleteExercise(db, id),
    onSuccess: () => client.invalidateQueries({queryKey: exerciseKeys.all}),
  });
}
```

- [ ] **Step 4: Write the editor**

Create `src/features/exercises/ExerciseEditorScreen.tsx`. The `Track weight` control is the one field with downstream consequences, and its helper text says so:

```tsx
import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, TextInput, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Chip} from '@/ui/Chip';
import {Card} from '@/ui/Card';
import {useTheme, type as typeScale, space, radius} from '@/theme';
import {useExerciseQuery} from './useExercises';
import {useCreateExercise, useUpdateExercise} from './useExerciseMutations';

const MUSCLES = [
  {label: 'Chest', value: 'chest'},
  {label: 'Back', value: 'lats'},
  {label: 'Shoulders', value: 'shoulders'},
  {label: 'Biceps', value: 'biceps'},
  {label: 'Triceps', value: 'triceps'},
  {label: 'Legs', value: 'quadriceps'},
  {label: 'Glutes', value: 'glutes'},
  {label: 'Core', value: 'abdominals'},
] as const;

const EQUIPMENT = [
  {label: 'Machine', value: 'machine'},
  {label: 'Barbell', value: 'barbell'},
  {label: 'Dumbbell', value: 'dumbbell'},
  {label: 'Cable', value: 'cable'},
  {label: 'Bodyweight', value: 'body only'},
] as const;

export function ExerciseEditorScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const editingId = (route.params as {id?: string} | undefined)?.id;

  const {data: existing} = useExerciseQuery(editingId ?? '');
  const create = useCreateExercise();
  const update = useUpdateExercise();

  const [name, setName] = useState('');
  const [primaryMuscle, setPrimaryMuscle] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [weightApplicable, setWeightApplicable] = useState(true);
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editingId || !existing) {
      return;
    }
    setName(existing.name);
    setPrimaryMuscle(existing.primaryMuscle);
    setEquipment(existing.equipment);
    setWeightApplicable(existing.weightApplicable);
    setInstructions(existing.instructions ?? '');
  }, [editingId, existing]);

  const save = () => {
    if (!name.trim()) {
      setError('Give the exercise a name so you can find it later.');
      return;
    }
    if (!primaryMuscle) {
      setError('Pick the muscle this mainly works.');
      return;
    }
    setError(null);

    const input = {
      name,
      primaryMuscle,
      secondaryMuscles: [],
      equipment,
      weightApplicable,
      instructions: instructions.trim() || null,
    };

    const done = {onSuccess: () => navigation.goBack()};
    if (editingId) {
      update.mutate({id: editingId, patch: input}, done);
    } else {
      create.mutate(input, done);
    }
  };

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[styles.content, {paddingTop: insets.top + space.xl}]}>
      <AppText variant="eyebrow" color="muted">
        Custom
      </AppText>
      <AppText variant="h1">{editingId ? 'Edit exercise' : 'New exercise'}</AppText>

      <View style={styles.field}>
        <AppText variant="eyebrow" color="muted">
          Name
        </AppText>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Exercise name"
          placeholderTextColor={colors.faint}
          style={[
            typeScale.body,
            styles.input,
            {color: colors.ink, backgroundColor: colors.surface, borderColor: colors.rule},
          ]}
        />
      </View>

      <View style={styles.field}>
        <AppText variant="eyebrow" color="muted">
          Primary muscle
        </AppText>
        <View style={styles.chips}>
          {MUSCLES.map(m => (
            <Chip
              key={m.value}
              label={m.label}
              selected={primaryMuscle === m.value}
              onPress={() => setPrimaryMuscle(m.value)}
            />
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <AppText variant="eyebrow" color="muted">
          Equipment
        </AppText>
        <View style={styles.chips}>
          {EQUIPMENT.map(e => (
            <Chip
              key={e.value}
              label={e.label}
              selected={equipment === e.value}
              onPress={() => setEquipment(e.value)}
            />
          ))}
        </View>
      </View>

      <Card>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Track weight"
          accessibilityState={{checked: weightApplicable}}
          onPress={() => setWeightApplicable(v => !v)}
          style={styles.toggleRow}>
          <View style={styles.grow}>
            <AppText variant="bodyStrong">Track weight</AppText>
            <AppText variant="small" color="muted">
              Turn this off for bodyweight movements. It decides whether this
              exercise ever counts towards volume.
            </AppText>
          </View>
          <View
            style={[
              styles.switch,
              {
                backgroundColor: weightApplicable ? colors.plate : colors.rule,
              },
            ]}>
            <View
              style={[
                styles.knob,
                {
                  backgroundColor: colors.surface,
                  alignSelf: weightApplicable ? 'flex-end' : 'flex-start',
                },
              ]}
            />
          </View>
        </Pressable>
      </Card>

      <View style={styles.field}>
        <AppText variant="eyebrow" color="muted">
          Notes
        </AppText>
        <TextInput
          value={instructions}
          onChangeText={setInstructions}
          placeholder="Optional"
          placeholderTextColor={colors.faint}
          multiline
          style={[
            typeScale.body,
            styles.input,
            styles.multiline,
            {color: colors.ink, backgroundColor: colors.surface, borderColor: colors.rule},
          ]}
        />
      </View>

      {error ? (
        <AppText variant="small" color="short">
          {error}
        </AppText>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={save}
        style={[styles.save, {backgroundColor: colors.plate}]}>
        <AppText variant="bodyStrong" color="plateInk">
          Save exercise
        </AppText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.lg},
  field: {gap: space.sm},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: space.sm},
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  multiline: {minHeight: 88, textAlignVertical: 'top'},
  toggleRow: {flexDirection: 'row', alignItems: 'center', gap: space.md},
  grow: {flex: 1, gap: 2},
  switch: {width: 48, height: 28, borderRadius: radius.pill, padding: 3, justifyContent: 'center'},
  knob: {width: 22, height: 22, borderRadius: radius.pill},
  save: {
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: 'center',
    marginTop: space.sm,
  },
});
```

- [ ] **Step 5: Write the detail screen**

Create `src/features/exercises/ExerciseDetailScreen.tsx`:

```tsx
import React from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Card} from '@/ui/Card';
import {useTheme, space, radius} from '@/theme';
import type {ExercisesStackParamList} from '@/navigation/types';
import {useExerciseQuery} from './useExercises';

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ExerciseDetailScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<ExercisesStackParamList>>();
  const {id} = useRoute().params as {id: string};
  const {data: exercise, isPending} = useExerciseQuery(id);

  if (isPending || !exercise) {
    return (
      <View style={[styles.root, {backgroundColor: colors.paper}]}>
        <AppText color="muted" style={{padding: space.xl}}>
          {isPending ? 'Loading…' : 'That exercise no longer exists.'}
        </AppText>
      </View>
    );
  }

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[styles.content, {paddingTop: insets.top + space.xl}]}>
      <AppText variant="eyebrow" color="muted">
        {exercise.isCustom ? 'Custom' : titleCase(exercise.exerciseType)}
      </AppText>
      <AppText variant="h1">{exercise.name}</AppText>

      <Card>
        <View style={styles.row}>
          <AppText variant="small" color="muted">
            Primary muscle
          </AppText>
          <AppText variant="bodyStrong">{titleCase(exercise.primaryMuscle)}</AppText>
        </View>
        {exercise.secondaryMuscles.length > 0 ? (
          <View style={styles.row}>
            <AppText variant="small" color="muted">
              Also works
            </AppText>
            <AppText variant="body">
              {exercise.secondaryMuscles.map(titleCase).join(' · ')}
            </AppText>
          </View>
        ) : null}
        <View style={styles.row}>
          <AppText variant="small" color="muted">
            Equipment
          </AppText>
          <AppText variant="body">
            {exercise.equipment ? titleCase(exercise.equipment) : 'None'}
          </AppText>
        </View>
        <View style={styles.row}>
          <AppText variant="small" color="muted">
            Weight
          </AppText>
          <AppText variant="body">
            {exercise.weightApplicable ? 'Tracked' : 'Not tracked'}
          </AppText>
        </View>
      </Card>

      {exercise.instructions ? (
        <View style={styles.field}>
          <AppText variant="eyebrow" color="muted">
            How to do it
          </AppText>
          <AppText color="ink2">{exercise.instructions}</AppText>
        </View>
      ) : null}

      {exercise.isCustom ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('ExerciseEditor', {id: exercise.id})}
          style={[styles.edit, {borderColor: colors.rule}]}>
          <AppText variant="bodyStrong" color="plate">
            Edit exercise
          </AppText>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.lg},
  field: {gap: space.sm},
  row: {gap: 2, paddingVertical: space.xs},
  edit: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: 'center',
  },
});
```

- [ ] **Step 6: Add the create entry point**

The library screen needs a way to reach the editor. In `ExerciseListScreen.tsx`, add a create button to the header, after the `<AppText variant="h1">Exercises</AppText>` line:

```tsx
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create exercise"
        onPress={() => navigation.navigate('ExerciseEditor', {})}
        style={[styles.create, {borderColor: colors.rule}]}>
        <AppText variant="bodyStrong" color="plate">
          New exercise
        </AppText>
      </Pressable>
```

and to its `StyleSheet`:

```tsx
  create: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
  },
```

adding `Pressable` to the `react-native` import and `radius` to the `@/theme` import.

- [ ] **Step 7: Run the tests**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add exercise detail and custom exercise editor"
```

---

## Task 8: The phase gate

**Files:** none — this task verifies.

- [ ] **Step 1: Build and install fresh**

```bash
adb -s <device> uninstall com.onemorerep
cd android && ./gradlew app:installDebug
```

- [ ] **Step 2: Time the first launch**

Seeding ~800 rows happens on the first open. Watch for how long the gate's spinner shows. **If it exceeds two seconds, stop and report it** — the fix is a larger `BATCH_SIZE` or a prepared statement, not shipping a slow first run.

- [ ] **Step 3: Walk the gate**

The spec's gate for Phase 1 is: *open Exercises, search the library, filter by equipment, create a custom exercise, see it listed and searchable.* On a physical device:

1. Open the **Exercises** tab. The header reports a count in the hundreds.
2. Type `squat` into search. The list narrows as you type.
3. Clear it. Tap **Chest**. Only chest movements remain. Tap **Legs** — hamstring curls, calf raises and squats all appear, not just quad work. Tap **All** to reset.
4. Tap any exercise. The detail screen shows muscles, equipment, whether weight is tracked, and instructions. Built-ins show no Edit button.
5. Back, then **New exercise**. Save with an empty name — it refuses and says why.
6. Fill in a name, pick a muscle and equipment, turn **Track weight** off, save.
7. It appears in the list with a **Custom** badge. Search for it by name — it is found.
8. Open it, tap **Edit exercise**, rename it, save. The list shows the new name.
9. Force-stop the app and reopen. Your exercise is still there, and the library is not re-seeded (no long spinner).
10. Switch the device between light and dark mode. Check every screen.

- [ ] **Step 4: Confirm the exit criteria**

```bash
npm test
npm run typecheck
npm run lint
grep -rn "#[0-9A-Fa-f]\{6\}\|fontSize:" src/features src/ui && echo "FAIL: literal found" || echo "ok"
find android -name "*.kt" | wc -l   # still 2
```

- [ ] **Step 5: Tag**

```bash
git tag -a phase-1 -m "Phase 1: exercise library complete"
```

---

## Phase 1 Exit Criteria

- [ ] `npm test`, `npm run typecheck`, and `npm run lint` all pass.
- [ ] A fresh install seeds the library in under two seconds and never re-seeds.
- [ ] Search narrows the list; muscle filters work; both together work.
- [ ] A custom exercise can be created, found by search, opened, edited, and survives a force-stop.
- [ ] Built-in exercises cannot be edited.
- [ ] `docs/exercise-weight-review.md` reports zero cases outstanding.
- [ ] Both themes render legibly on every new screen.
- [ ] No literal hex or `fontSize` outside `src/theme/tokens.ts`.

---

## Self-Review

**Spec coverage.** §29's fields are Task 1's schema and Task 2's mapping; searchability is Task 3 and Task 6. §30's create-your-own is Task 7, and "behave identically to built-ins" is enforced by there being one table, one repository, and one list — `is_custom` drives a badge and edit permission, nothing more. §4.1's soft-delete rule is Task 3 and tested. D12's seed source, licence check, and `weight_applicable` derivation are Task 2, with the human review pass as an explicit blocking step. The spec's Phase 1 gate is Task 8 Step 3, walked verbatim.

**Deliberate gaps.** Secondary muscles are not editable in the custom editor — screen 19 shows an "Also works" chip row, but making it multi-select adds state for a field the MVP never reads. Seeded exercises keep their secondary muscles; custom ones start empty. Flagged for Phase 5 rather than silently dropped. Equipment filtering is not built. The spec's gate text says "filter by equipment" while screen 18 draws muscle chips; asked directly, the user chose **body part, as designed**. The gate in Task 8 is worded accordingly.

**Type consistency.** `Exercise` (Task 3) is what every screen consumes; `ExerciseRow` never leaves the repository, because `secondaryMuscles` is a JSON string in the database and an array everywhere else. `ExerciseQuery` is shared by the repository and the query key. `ExercisesStackParamList` is declared in Task 6 and consumed in Tasks 6 and 7. `NewCustomExercise` is the editor's save payload and the repository's input.

**Risks.** One. Seeding performance on a mid-range phone is unmeasured — Task 8 Step 2 gates it rather than assuming.

The muscle-grouping risk this plan originally carried is closed. The first draft mapped each filter label onto a *single* upstream muscle name, which would have hidden most of the library: Legs would have shown 148 of 298 exercises and Arms would have lost all 71 triceps movements. `MUSCLE_FILTERS` now maps each label to a group, and a test asserts the groups remain exhaustive against the seed data, so a future dataset change that adds a muscle fails the build rather than silently orphaning exercises.

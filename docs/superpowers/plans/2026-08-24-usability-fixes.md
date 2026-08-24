# Usability fixes — implementation plan

> **For agentic workers:** steps use checkbox (`- [ ]`) syntax for tracking.
> Execute one task at a time, run its verification, and **commit after every
> task**. Do not batch commits.

**Goal:** Close the ten usability complaints raised on 2026-08-24, after the
first real week of using the app on a phone.

**Architecture:** Six independent phases (R1–R6), each shippable and each
verifiable end to end on the device. Two SQLite migrations (0005, 0006). One
significant screen rewrite — the workout screen becomes a single scrolling
list of expandable exercise cards, which is what closes complaints 3, 6 and
half of 10 in one change.

**Tech Stack:** React Native CLI 0.87 (new architecture), op-sqlite + Drizzle,
TanStack Query, zustand, react-native-svg. Two new native dependencies, in R6
only.

**Source:** the ten complaints, verbatim, in `docs/notes.md` (appended by
Task 0). Four design forks were settled by the user before this plan was
written; each is recorded at the head of the phase it governs.

---

## Global constraints

Copied from the project's standing rules. Every task inherits these.

- **React Native CLI only. No Expo. Android only, permanently.** No iOS, no web.
- Local SQLite is the source of truth. No backend.
- Every phase must be **independently testable end to end on a physical
  device, including its UI** — not just in Jest.
- **Commit after every task.**
- Nothing outside `src/theme/tokens.ts` may declare a colour or a font size.
- Ochre (`short`), never red, for a shortfall. Skipping is a decision, not an
  error.
- §39 is inviolable: **editing the plan must never change a workout that has
  already happened.** Targets are snapshotted into `performed_sets` at session
  start and are never joined back to `planned_sets`.
- A device gate runs against a **bundled** APK (`--dev false`, `adb reverse
  --remove-all`), never against Metro. See `docs/deferred.md` for why.
- `adb shell pm clear com.onemorerep` is never run as a default — it destroys
  real training data.

---

## Complaint → phase map

| # | Complaint | Phase |
|---|---|---|
| 1 | Weight only moves in 2.5 steps; want 0.5 and tap-to-type | **R1** |
| 2 | No dark / light / system theme choice | **R1** |
| 3 | Only one exercise visible at a time during a workout | **R2** |
| 4 | Exercise added to the plan mid-workout never appeared in Today | **R3** |
| 5 | Cannot create a custom exercise from inside the plan builder | **R4** |
| 6 | Cannot see later sets' targets; cannot move between exercises | **R2** |
| 7 | No notes per exercise while performing | **R3** |
| 8 | Cannot save an image of a finished day | **R6** |
| 9 | Cannot fix a wrong exercise mid-workout | **R3** |
| 10 | Today hides the summary behind a button | **R5** |

---

## Settled design decisions

Numbered **U1–U9** to avoid colliding with the workout spec's D1–D13 and the
step-tracking spec's S1–S13.

**U1 — The workout is one scrolling list.** Every exercise is a card. The
active one is expanded with its sets and controls; the rest are collapsed to a
name, a progress count and a verdict. Tapping a collapsed card expands it.
*Chosen by the user over keeping the focused single-exercise screen.*

**U2 — Only one card is expanded at a time.** Two open cards means two sets
that both look active, and in a gym that is a recorded number against the
wrong exercise.

**U3 — The plan does not reach into a running workout.** Complaint 4 is the
§39 invariant working as designed, not a bug. The fix is that you never need to
leave the workout: add, remove, reorder and swap all live on the workout
screen, and adding offers to put the exercise into the weekly plan as well.
*Chosen by the user over a "the plan changed" banner and over automatic
pull-in.*

**U4 — The weight step is a setting, default 0.5.** Choices are 0.5 / 1 / 2.5
/ 5. It drives every − / + in the app. `settings.default_increment` already
exists and is currently read on exactly one screen. *Chosen by the user over
hard-coding 0.5.*

**U5 — Any number can be typed.** Tapping a weight or a rep count puts a
keyboard on it, everywhere: plan target editor and workout alike. The step
setting governs the shoulders only.

**U6 — A swap keeps the plan slot.** Swapping Bench Press for Dumbbell Press
keeps `planned_exercise_id`, keeps the target, and records
`substituted_from_exercise_id` so history can say "swapped from Bench Press".
The slot was served; recording it as skipped would understate the workout, and
recording nothing would overstate it.

**U7 — A swap is refused once anything is recorded on that exercise.** The
recorded sets belong to the old movement. The honest move at that point is to
skip what remains and add the new exercise separately, and the UI says so.

**U8 — Only exercises added during the workout can be deleted.** A planned
exercise you did not do is *skipped*, not erased — erasing it would quietly
shrink the denominator of "% of plan". Deleting is offered only for an
unplanned exercise with nothing recorded on it.

**U9 — The theme mode reaches the provider through a store, not the
database.** `ThemeProvider` wraps `DatabaseGate` (`src/App.tsx:29`) and
`DatabaseGate` calls `useTheme()` for its own loading and failure screens, so
the provider cannot read the setting through React Query without the two
depending on each other. A zustand store has no provider and so can be written
from inside the gate and read from above it.

---

## File structure

**New files**

| Path | Responsibility |
|---|---|
| `src/ui/NumberField.tsx` | One editable number: tap to type, − / + shoulders. The single implementation behind every weight and rep input. |
| `src/ui/ActionSheet.tsx` | A bottom sheet of labelled actions over RN's `Modal`. Used by the exercise `⋯` menu. |
| `src/theme/useThemeMode.ts` | zustand store holding `'system' \| 'light' \| 'dark'` (U9). |
| `src/features/workout/WorkoutExerciseCard.tsx` | One exercise in the workout list: collapsed header, expanded body. |
| `src/features/workout/ExerciseActions.tsx` | The `⋯` sheet: swap, remove, move, notes, summary. |
| `src/features/workout/useSessionEditing.ts` | Mutations for R3: swap, delete, move, notes. |
| `src/features/workout/SessionSummary.tsx` | The finished-session summary block, shared by Today and the finish screen. |
| `src/features/exercises/useLastCreatedExercise.ts` | Hands a newly created exercise back to whichever picker asked for it. |
| `src/features/history/DayImageCard.tsx` | The off-screen card that gets rasterised to PNG. |
| `src/features/history/useSaveDayImage.ts` | Capture, then write to the gallery. |
| `src/db/migrations/0005_settings_theme.ts` | Generated. |
| `src/db/migrations/0006_exercise_notes.ts` | Generated. |

**Substantially rewritten**

- `src/features/workout/WorkoutScreen.tsx` — one exercise at a time becomes one list (R2).
- `src/features/workout/SetRow.tsx` — uses `NumberField`; future targets legible (R1, R2).
- `src/features/settings/SettingsScreen.tsx` — theme and weight step (R1).
- `src/features/workout/TodayScreen.tsx` — summary inline (R5).

---

## Task 0: Record the complaints

**Files:** Modify `docs/notes.md`

- [ ] **Step 1:** Append a dated section to `docs/notes.md` containing all ten
      complaints verbatim, the four questions that were asked, and the four
      answers. A plan that argues from requirements has to keep those
      requirements next to it.

- [ ] **Step 2: Commit**

```bash
git add docs/notes.md docs/superpowers/plans/2026-08-24-usability-fixes.md
git commit -m "docs: record the ten usability complaints and the plan"
```

---

# Phase R1 — Settings, theme, and typing numbers

Closes complaints **1** and **2**. Depends on nothing.

### Task 1: Migration 0005 — theme mode

**Files:**
- Modify: `src/db/schema/settings.ts`
- Modify: `src/repositories/settingsRepo.ts`
- Create (generated): `src/db/migrations/0005_settings_theme.ts`
- Test: `__tests__/db/migrate.test.ts`, `__tests__/repositories/settingsRepo.test.ts`

**Interfaces:**
- Produces: `settings.themeMode: 'system' | 'light' | 'dark'`; `SettingsPatch`
  gains `themeMode` and `defaultIncrement`; `DEFAULT_SETTINGS.defaultIncrement`
  becomes `0.5`.

- [ ] **Step 1: Write the failing test**

In `__tests__/repositories/settingsRepo.test.ts`:

```ts
it('defaults a fresh install to a 0.5 step and the system theme', async () => {
  const db = await testDb();
  const row = await getSettings(db);
  expect(row.defaultIncrement).toBe(0.5);
  expect(row.themeMode).toBe('system');
});

it('stores a theme choice', async () => {
  const db = await testDb();
  const row = await updateSettings(db, {themeMode: 'dark'});
  expect(row.themeMode).toBe('dark');
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest __tests__/repositories/settingsRepo.test.ts
```
Expected: FAIL — `themeMode` is not a property of the settings row.

- [ ] **Step 3: Add the column to the schema**

In `src/db/schema/settings.ts`, inside `sqliteTable('settings', {...})`:

```ts
  /**
   * 'system' follows the OS. The two explicit values override it, which is the
   * whole point — a phone left in light mode is not a reason to train in it.
   */
  themeMode: text('theme_mode', {enum: ['system', 'light', 'dark']})
    .notNull()
    .default('system'),
```

And below the existing exports:

```ts
export type ThemeMode = SettingsRow['themeMode'];
```

- [ ] **Step 4: Generate the migration**

```bash
npm run db:generate
```

Confirm `src/db/migrations/0005_settings_theme.ts` exists, that its `version`
is `6`, and that `src/db/migrations/index.ts` lists it. SQLite requires a
default on an added `NOT NULL` column, so the generated statement must read
``ALTER TABLE `settings` ADD `theme_mode` text DEFAULT 'system' NOT NULL;``.
If it does not, fix the schema and regenerate — never hand-edit a generated
migration.

- [ ] **Step 5: Widen the repository**

In `src/repositories/settingsRepo.ts`:

```ts
export const DEFAULT_SETTINGS = {
  unit: 'kg',
  weekStartDay: 1, // Monday
  // U4: 0.5 is the smallest plate most gyms have, and typing beats stepping
  // for anything larger. A fresh install starts here; an existing one keeps
  // whatever it had, and can change it in Settings.
  defaultIncrement: 0.5,
  themeMode: 'system',
} as const;

export type SettingsPatch = Partial<
  Pick<SettingsRow, 'unit' | 'weekStartDay' | 'defaultIncrement' | 'themeMode'>
>;
```

- [ ] **Step 6: Assert the migration**

Add to `__tests__/db/migrate.test.ts`, beside the existing version assertions:

```ts
it('lands on user_version 6 with a theme column', async () => {
  const db = await testDb();
  const [{user_version: version}] = await db.all<{user_version: number}>(
    sql.raw('PRAGMA user_version'),
  );
  expect(version).toBe(6);
  const columns = await db.all<{name: string}>(
    sql.raw('PRAGMA table_info(settings)'),
  );
  expect(columns.map(c => c.name)).toContain('theme_mode');
});
```

- [ ] **Step 7: Run the suite**

```bash
npm test && npm run typecheck
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/db src/repositories/settingsRepo.ts drizzle __tests__
git commit -m "feat(settings): add a theme mode column and a 0.5 default step"
```

---

### Task 2: The theme responds to the setting

**Files:**
- Create: `src/theme/useThemeMode.ts`
- Modify: `src/theme/ThemeProvider.tsx`, `src/theme/index.ts`
- Modify: `src/providers/DatabaseGate.tsx`
- Test: `__tests__/theme/themeMode.test.tsx`

**Interfaces:**
- Consumes: `settings.themeMode` from Task 1.
- Produces: `useThemeMode()` — `{mode, setMode}`. `useTheme()` keeps its shape
  (`{colors, scheme}`), so no existing call site changes.

- [ ] **Step 1: Write the failing test**

`__tests__/theme/themeMode.test.tsx`:

```tsx
import {render, screen} from '@testing-library/react-native';
import {Text} from 'react-native';
import {ThemeProvider, useTheme} from '@/theme';
import {useThemeMode} from '@/theme/useThemeMode';

function Probe() {
  const {scheme} = useTheme();
  return <Text>{scheme}</Text>;
}

describe('theme mode', () => {
  beforeEach(() => useThemeMode.setState({mode: 'system'}));

  it('follows the OS when set to system', () => {
    jest
      .spyOn(require('react-native'), 'useColorScheme')
      .mockReturnValue('dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByText('dark')).toBeTruthy();
  });

  it('overrides the OS when set explicitly', () => {
    jest
      .spyOn(require('react-native'), 'useColorScheme')
      .mockReturnValue('dark');
    useThemeMode.setState({mode: 'light'});
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByText('light')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest __tests__/theme/themeMode.test.tsx
```
Expected: FAIL — `@/theme/useThemeMode` does not exist.

- [ ] **Step 3: Write the store**

`src/theme/useThemeMode.ts`:

```ts
import {create} from 'zustand';
import type {ThemeMode} from '@/db/schema';

/**
 * U9. `ThemeProvider` wraps `DatabaseGate`, and the gate calls `useTheme()`
 * for its own loading and failure screens — so the provider cannot read the
 * setting through React Query without the two depending on each other.
 *
 * A zustand store has no provider, so it can be written from inside the gate
 * and read from above it. SQLite stays the source of truth; this is a one-way
 * mirror of it, hydrated once the gate opens.
 */
type ThemeModeState = {mode: ThemeMode; setMode: (mode: ThemeMode) => void};

export const useThemeMode = create<ThemeModeState>(set => ({
  mode: 'system',
  setMode: mode => set({mode}),
}));
```

- [ ] **Step 4: Read it in the provider**

In `src/theme/ThemeProvider.tsx`:

```tsx
export function ThemeProvider({children}: {children: React.ReactNode}) {
  const osScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const mode = useThemeMode(state => state.mode);
  const scheme = mode === 'system' ? osScheme : mode;
  const value = useMemo<Theme>(
    () => ({colors: palettes[scheme], scheme}),
    [scheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
```

Add to `src/theme/index.ts`:

```ts
export {useThemeMode} from './useThemeMode';
```

- [ ] **Step 5: Hydrate it when the database opens**

In `src/providers/DatabaseGate.tsx`, inside the existing async IIFE, after
`rollOverStaleSessions(db)` and before `setStatus`:

```ts
        // The theme is chosen before anything renders, so the first frame is
        // already in the right palette rather than flashing light and then
        // correcting itself.
        const saved = await getSettings(db);
        useThemeMode.getState().setMode(saved.themeMode);
```

with `import {getSettings} from '@/repositories/settingsRepo';` and
`import {useThemeMode} from '@/theme';`.

- [ ] **Step 6: Run the tests**

```bash
npx jest __tests__/theme && npm run typecheck
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/theme src/providers/DatabaseGate.tsx __tests__/theme
git commit -m "feat(theme): honour a saved light/dark/system choice"
```

---

### Task 3: Theme and weight step in Settings

**Files:**
- Modify: `src/features/settings/SettingsScreen.tsx`
- Test: `__tests__/features/settings/SettingsScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it('writes a theme choice and applies it immediately', async () => {
  renderSettings();
  fireEvent.press(await screen.findByLabelText('Dark'));
  await waitFor(() => expect(useThemeMode.getState().mode).toBe('dark'));
});

it('writes a weight step choice', async () => {
  renderSettings();
  fireEvent.press(await screen.findByLabelText('Step by 2.5'));
  await waitFor(async () =>
    expect((await getSettings(db)).defaultIncrement).toBe(2.5),
  );
});
```

- [ ] **Step 2: Run and watch fail**

```bash
npx jest __tests__/features/settings
```
Expected: FAIL — no such labels.

- [ ] **Step 3: Add both rows**

Above the weight-unit block, a Theme row using the same `Pressable` option
pattern already in this file:

```tsx
const THEMES: ReadonlyArray<{value: ThemeMode; label: string; hint: string}> = [
  {value: 'system', label: 'System', hint: 'Follows your phone'},
  {value: 'light', label: 'Light', hint: 'Always light'},
  {value: 'dark', label: 'Dark', hint: 'Always dark'},
];
```

The handler writes the database **and** the store, so the screen repaints on
the tap rather than on the next launch:

```tsx
onPress={() => {
  setMode(value);
  update.mutate({themeMode: value});
}}
```

Below the unit block, replace the static "Weights increase in steps of…"
sentence with a chooser over `const STEPS = [0.5, 1, 2.5, 5] as const;`. Each
option is labelled `Step by ${step}` for accessibility and prints the number
large with the unit beneath, matching the unit chooser's shape. Keep an
explanatory line underneath:

```
The − and + buttons move weight by this much. You can always tap a number and
type it instead.
```

- [ ] **Step 4: Run**

```bash
npx jest __tests__/features/settings && npm run typecheck && npm run lint
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings __tests__/features/settings
git commit -m "feat(settings): choose the theme and the weight step"
```

---

### Task 4: `NumberField` — tap any number and type it

**Files:**
- Create: `src/ui/NumberField.tsx`
- Modify: `src/ui/Stepper.tsx`, `src/features/workout/SetRow.tsx`
- Modify: `src/features/plan/TargetEditorScreen.tsx`
- Test: `__tests__/ui/NumberField.test.tsx`

**Interfaces:**
- Produces:

```ts
export function NumberField(props: {
  label: string;            // accessibility name, e.g. "Weight"
  value: number | null;     // null renders an em dash, never 0
  step: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  decimals?: number;        // 1 for weight, 0 for reps
  size?: 'display' | 'field';
}): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

```tsx
it('commits a typed value on blur', () => {
  const onChange = jest.fn();
  render(<NumberField label="Weight" value={20} step={0.5} onChange={onChange} />);
  const input = screen.getByLabelText('Weight');
  fireEvent.changeText(input, '37.5');
  fireEvent(input, 'blur');
  expect(onChange).toHaveBeenLastCalledWith(37.5);
});

it('does not commit while the field is empty mid-edit', () => {
  const onChange = jest.fn();
  render(<NumberField label="Weight" value={20} step={0.5} onChange={onChange} />);
  fireEvent.changeText(screen.getByLabelText('Weight'), '');
  expect(onChange).not.toHaveBeenCalled();
});

it('restores the last good value when the field is left empty', () => {
  render(<NumberField label="Weight" value={20} step={0.5} onChange={jest.fn()} />);
  const input = screen.getByLabelText('Weight');
  fireEvent.changeText(input, '');
  fireEvent(input, 'blur');
  expect(input.props.value).toBe('20.0');
});

it('steps by the increment it is given', () => {
  const onChange = jest.fn();
  render(<NumberField label="Weight" value={20} step={0.5} onChange={onChange} />);
  fireEvent.press(screen.getByLabelText('Increase Weight'));
  expect(onChange).toHaveBeenCalledWith(20.5);
});

it('does not drift on repeated 0.5 steps', () => {
  // Binary floating point compounds. Three steps from 20 must be exactly 21.5,
  // not 21.500000000000004 written into somebody's history.
  let v = 20;
  const {rerender} = render(
    <NumberField label="W" value={v} step={0.5} onChange={n => (v = n)} />,
  );
  for (let i = 0; i < 3; i++) {
    fireEvent.press(screen.getByLabelText('Increase W'));
    rerender(<NumberField label="W" value={v} step={0.5} onChange={n => (v = n)} />);
  }
  expect(v).toBe(21.5);
});
```

- [ ] **Step 2: Run and watch fail**

```bash
npx jest __tests__/ui/NumberField.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

Each behaviour below has a test above.

- The `TextInput` holds a **draft string**, not the number. Typing `"3"` on the
  way to `"37.5"` must not fire `onChange(3)` and rewrite the field underneath
  the user's thumb.
- `onChangeText` parses and calls `onChange` only when the text parses to a
  finite number. Never for `""`, `"."` or `"-"`.
- `onBlur` commits, or — if the draft is unparseable — discards it and redraws
  the last good value.
- An external `value` change (a new active set arriving) resets the draft.
- `round(x) = Math.round(x * 100) / 100` on every path. Carry the existing
  explanatory comment across from `Stepper.tsx`.
- `accessibilityValue={{now: value ?? 0, text: display}}`.
- `hitSlop={space.sm}` on the shoulders: they are drawn ~38px and the target
  must reach 44px.
- `keyboardType="decimal-pad"` and `selectTextOnFocus`, so tapping a number and
  typing replaces it rather than appending to it.
- `size="display"` renders at `type.display` for the active set; `"field"` at
  `type.inkNum` for the plan editor.

- [ ] **Step 4: Run the tests**

```bash
npx jest __tests__/ui/NumberField.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Route every existing number input through it**

- `src/ui/Stepper.tsx` becomes a `NumberField` with `size="field"`, keeping its
  current props so `TargetEditorScreen` does not change shape.
- `src/features/workout/SetRow.tsx`: delete the private `Stepper` at the foot
  of the file and render two `NumberField`s for the active set. The weight
  field is omitted entirely when `weightApplicable` is false.
- `src/features/plan/TargetEditorScreen.tsx`: replace the hard-coded
  `step={2.5}` with the settings value and the hard-coded `unit="kg"` with the
  settings unit — that second one is wrong today for anyone training in pounds.

```tsx
const {data: settings} = useSettingsQuery();
const step = settings?.defaultIncrement ?? 0.5;
const unit = settings?.unit ?? 'kg';
```

- [ ] **Step 6: Run everything**

```bash
npm test && npm run typecheck && npm run lint
```
Expected: PASS. Existing `SetRow` and target-editor tests may need their
queries moved from text to `getByLabelText('Weight')`. Update the tests; do not
weaken the assertions.

- [ ] **Step 7: Commit**

```bash
git add src/ui src/features/workout/SetRow.tsx src/features/plan/TargetEditorScreen.tsx __tests__
git commit -m "feat(ui): tap any weight or rep count and type it"
```

---

### Task 5: R1 device gate

- [ ] **Step 1: Build a bundled APK and install it**

```bash
npx react-native bundle --platform android --dev false --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res
cd android && ./gradlew assembleDebug && cd ..
adb reverse --remove-all
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

- [ ] **Step 2: Walk it by hand on the phone**

1. Settings → Dark. The screen repaints **immediately**, without a relaunch.
2. Force-stop, reopen. Still dark, and the **first frame** is dark — no white
   flash.
3. Settings → System. Change the phone's own theme. The app follows.
4. Settings → Weight step → 0.5. Plan → any exercise → the weight + moves
   20.0 → 20.5.
5. Tap the weight number. A number pad appears. Type `37.5`. It sticks.
6. Start a workout. Tap the big weight. Type `62.5`. Record the set. Then:

```bash
adb exec-out run-as com.onemorerep sqlite3 databases/onemorerep.db \
  "SELECT actual_weight, actual_reps FROM performed_sets WHERE status='completed' ORDER BY completed_at DESC LIMIT 3;"
```

- [ ] **Step 3:** Record in `docs/deferred.md` what was walked and what was not.

- [ ] **Step 4: Commit**

```bash
git add docs/deferred.md
git commit -m "docs: record the R1 device gate"
```

---

# Phase R2 — The workout is one list

Closes complaints **3** and **6**. Depends on R1 (uses `NumberField`).
Governed by **U1** and **U2**.

### Task 6: `WorkoutExerciseCard`

**Files:**
- Create: `src/features/workout/WorkoutExerciseCard.tsx`
- Modify: `src/features/workout/SetRow.tsx`, `src/domain/format.ts`
- Test: `__tests__/features/workout/WorkoutExerciseCard.test.tsx`

**Interfaces:**
- Consumes: `SessionExercise` from `@/repositories/sessionRepo`; `SetRow`;
  `NumberField`.
- Produces:

```tsx
export function WorkoutExerciseCard(props: {
  exercise: SessionExercise;
  expanded: boolean;
  onToggle: () => void;
  onLayoutY: (y: number) => void;   // feeds the auto-scroll in Task 7
  unit: string;
  increment: number;
  previous: PreviousPerformance | null;
  children?: React.ReactNode;        // the action row, injected by the screen
}): JSX.Element;
```

Also produces, moved into `src/domain/format.ts`:

```ts
export function targetLine(sets: readonly {targetReps: number; targetWeight: number | null}[], unit: string): string;
```

- [ ] **Step 1: Write the failing tests**

```tsx
it('collapsed, shows the name and how far through it is', () => {
  render(<WorkoutExerciseCard {...props} expanded={false} />);
  expect(screen.getByText('Bench Press')).toBeTruthy();
  expect(screen.getByText('2 / 3 sets')).toBeTruthy();
  expect(screen.queryByLabelText('Weight')).toBeNull();
});

it('collapsed, still names the target', () => {
  // Complaint 6: what you are aiming for has to be readable without opening
  // anything.
  render(<WorkoutExerciseCard {...props} expanded={false} />);
  expect(screen.getByText('3 × 10 · 60.0 kg')).toBeTruthy();
});

it('expanded, shows every set with its target, not just the active one', () => {
  render(<WorkoutExerciseCard {...props} expanded />);
  expect(screen.getAllByText(/target 10 × 60\.0/)).toHaveLength(3);
});

it('reports its y position so the screen can scroll to it', () => {
  const onLayoutY = jest.fn();
  render(<WorkoutExerciseCard {...props} onLayoutY={onLayoutY} />);
  fireEvent(screen.getByTestId('exercise-card'), 'layout', {
    nativeEvent: {layout: {y: 420}},
  });
  expect(onLayoutY).toHaveBeenCalledWith(420);
});

it('a finished exercise carries its verdict in the collapsed header', () => {
  render(<WorkoutExerciseCard {...doneProps} expanded={false} />);
  expect(screen.getByText('Complete')).toBeTruthy();
});
```

- [ ] **Step 2: Run and watch fail**

```bash
npx jest __tests__/features/workout/WorkoutExerciseCard.test.tsx
```

- [ ] **Step 3: Implement**

Collapsed header, always present:

```
┌────────────────────────────────────────┐
│ ✓  Bench Press                3/3 sets │
│    3 × 10 · 60.0 kg          Complete  │
└────────────────────────────────────────┘
```

- Leading glyph: `✓` complete, `–` skipped, `●` the one you are on, `▸`
  otherwise.
- The second line is the target line. That function is currently written twice
  — `TodayScreen.tsx:33` and `PlanDayScreen.tsx:25`. **Move it to
  `src/domain/format.ts` and import all three call sites from there** rather
  than writing it a fourth time.
- The header is a `Pressable` with `accessibilityRole="button"` and
  `accessibilityState={{expanded}}`.

Expanded body: every `SetRow`, the previous-performance line, then `children`.

**The dim is the thing being fixed.** `SetRow` applies `opacity: 0.55` to the
whole row of a future set (`styles.dim`), which is why complaint 6 says the
targets were not there. Change it so the **head strip keeps full contrast** —
the target is information you need *before* you lift — and only the empty
actual is drawn in `faint`. Delete `styles.dim`.

- [ ] **Step 4: Run**

```bash
npx jest __tests__/features/workout && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/features/workout src/domain/format.ts src/features/plan __tests__
git commit -m "feat(workout): an exercise card that reads whether it is open or closed"
```

---

### Task 7: Rewrite `WorkoutScreen` as a list

**Files:**
- Modify: `src/features/workout/WorkoutScreen.tsx`
- Test: `__tests__/features/workout/WorkoutScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it('shows every exercise in the session at once', async () => {
  await renderWorkout(sessionWithFour);
  for (const name of ['Bench Press', 'Incline Press', 'Cable Fly', 'Lateral Raise']) {
    expect(screen.getByText(name)).toBeTruthy();
  }
});

it('opens the first exercise that still has a pending set', async () => {
  await renderWorkout(sessionHalfDone); // exercise one already finished
  expect(screen.getByText('Incline Press')).toBeTruthy();
  // U2: exactly one set is editable anywhere on the screen.
  expect(screen.getAllByLabelText('Weight')).toHaveLength(1);
});

it('opens a different exercise when its header is tapped', async () => {
  await renderWorkout(sessionWithFour);
  fireEvent.press(screen.getByText('Cable Fly'));
  await waitFor(() => expect(screen.getByLabelText('Complete set')).toBeTruthy());
  expect(screen.getAllByLabelText('Weight')).toHaveLength(1);
});

it('does not move the open card out from under a recorded set', async () => {
  // The bug that was found on the device once already in Phase 3. It must not
  // come back through the rewrite.
  await renderWorkout(sessionWithFour);
  fireEvent.press(screen.getByLabelText('Complete set'));
  await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());
  expect(screen.getAllByLabelText('Weight')).toHaveLength(1);
});

it('moves on when the last set of an exercise is recorded', async () => {
  await renderWorkout(sessionOneSetLeft);
  fireEvent.press(screen.getByLabelText('Complete set'));
  await waitFor(() => expect(screen.getByText('Incline Press')).toBeTruthy());
});
```

- [ ] **Step 2: Run and watch fail**

```bash
npx jest __tests__/features/workout/WorkoutScreen.test.tsx
```

- [ ] **Step 3: Implement**

Replace `const [index, setIndex] = useState(0)` with
`const [openId, setOpenId] = useState<string | null>(null)`, keyed by
`performed_exercises.id` rather than by array position — the reordering added
in Task 10 makes a position meaningless.

The alignment logic that already exists — `alignToPending`, the
`useFocusEffect` retry, the `aligned` ref — is **kept, not rewritten**. Its
comments record two device bugs that were expensive to find. They carry across
verbatim, with `setIndex(pending)` becoming `setOpenId(exercises[pending].id)`.

Auto-scroll: a `ScrollView` with a `ref` and a `Map<string, number>` of card id
to y offset, filled by `onLayoutY`. When `openId` changes, scroll to that
offset less one header height. A `ScrollView` rather than a `FlatList` because
cards vary in height, a session is six or seven exercises, and
`scrollToIndex` over variable heights is a known source of jump.

Auto-advance on finishing an exercise **no longer pushes `ExerciseSummary`**.
It expands the next pending exercise and scrolls to it. The summary screen
stays in the stack, reachable from the `⋯` menu built in Task 11 — it is a
place to go and look, not a wall to walk through. **Record this in
`docs/deferred.md` under "Design departures".**

`Next — X` goes; scrolling replaces it. `Add an exercise` and `Finish workout`
move to the foot of the list. `Add set`, `Skip set` and `Skip this exercise`
move **inside** the expanded card, where they belong to one exercise rather
than to whatever happens to be on screen.

- [ ] **Step 4: Run**

```bash
npm test && npm run typecheck && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/features/workout __tests__/features/workout
git commit -m "feat(workout): show the whole workout in one list"
```

---

### Task 8: R2 device gate

- [ ] **Step 1:** Rebuild and install the bundled APK (Task 5, Step 1).

- [ ] **Step 2: Walk it**

1. Start a workout with **at least four** exercises. All four are reachable by
   scrolling; each shows its target line while collapsed.
2. Tap the fourth. It opens, the first closes, one set is editable.
3. Record a set on exercise one. The card **stays open** — it does not jump.
4. Record its last set. The screen scrolls to exercise two and opens it.
5. Force-stop mid-workout, reopen. Right exercise, right set, nothing lost.
6. `adb logcat` is clean of React errors.

- [ ] **Step 3:** Record in `docs/deferred.md`, including the auto-advance
      departure. **Commit.**

---

# Phase R3 — Fix a workout while you are in it

Closes complaints **4**, **7** and **9**. Depends on R2.
Governed by **U3**, **U6**, **U7**, **U8**.

### Task 9: Migration 0006 — notes and substitution

**Files:**
- Modify: `src/db/schema/session.ts`, `src/repositories/sessionRepo.ts`
- Create (generated): `src/db/migrations/0006_exercise_notes.ts`
- Test: `__tests__/db/sessionSchema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('carries a note and a substitution origin on a performed exercise', async () => {
  const db = await testDb();
  const {exerciseId} = await seedOneExercise(db);
  await db.insert(performedExercises).values({
    /* …existing required fields… */
    notes: 'Rack was busy — went lighter.',
    substitutedFromExerciseId: exerciseId,
  });
  const [row] = await db.select().from(performedExercises);
  expect(row.notes).toBe('Rack was busy — went lighter.');
  expect(row.substitutedFromExerciseId).toBe(exerciseId);
});
```

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Add both columns**

In `src/db/schema/session.ts`, inside `performedExercises`:

```ts
    /**
     * What happened on this exercise today, in the user's own words. Per
     * session, not per exercise: "shoulder felt off" is about a Tuesday, not
     * about the overhead press.
     */
    notes: text('notes'),
    /**
     * U6. Set when this slot was swapped for a different movement mid-workout.
     * The plan link and the target are kept — the slot was served — and this
     * is what lets history say so, rather than silently claiming the planned
     * exercise was the one performed.
     */
    substitutedFromExerciseId: text('substituted_from_exercise_id').references(
      () => exercises.id,
    ),
```

- [ ] **Step 4: Generate**

```bash
npm run db:generate
```
Confirm `version` is `7` and that `index.ts` lists it.

- [ ] **Step 5: Widen `SessionExercise`**

Add `notes: string | null` and `substitutedFromName: string | null` to
`SessionExercise` in `src/repositories/sessionRepo.ts`. Get the name with a
second `leftJoin` on an **alias** of `exercises` inside `loadSession`'s
existing exercise query — not a query per exercise. The three-query budget in
that function's doc comment is deliberate; keep it true.

- [ ] **Step 6:** `npm test && npm run typecheck`. **Commit.**

```bash
git add src/db src/repositories/sessionRepo.ts drizzle __tests__
git commit -m "feat(session): store a per-exercise note and a substitution origin"
```

---

### Task 10: Session editing operations

**Files:**
- Modify: `src/repositories/sessionRepo.ts`, `src/features/workout/useSession.ts`
- Create: `src/features/workout/useSessionEditing.ts`
- Test: `__tests__/repositories/sessionRepo.editing.test.ts`

**Interfaces:**
- Produces:

```ts
export async function setExerciseNotes(
  db: AppDatabase, performedExerciseId: string, notes: string | null,
): Promise<void>;

/** U6/U7. Throws if any set on this exercise has been recorded. */
export async function swapExercise(
  db: AppDatabase, performedExerciseId: string, newExerciseId: string,
): Promise<void>;

/** U8. Throws unless the exercise is unplanned with nothing recorded. */
export async function removeExercise(
  db: AppDatabase, performedExerciseId: string,
): Promise<void>;

export async function moveExercise(
  db: AppDatabase, performedExerciseId: string, direction: -1 | 1,
): Promise<void>;
```

`useSessionMutation` in `useSession.ts` is **exported** so the new hooks reuse
it. Its awaited double invalidation — session branch, then history branch — is
the thing that must not be copied and allowed to drift.

- [ ] **Step 1: Write the failing tests**

```ts
describe('swapExercise', () => {
  it('keeps the plan slot and the target, and records where it came from', async () => {
    await swapExercise(db, pex.id, dumbbellPressId);
    const [row] = await db.select().from(performedExercises)
      .where(eq(performedExercises.id, pex.id));
    expect(row.exerciseId).toBe(dumbbellPressId);
    expect(row.plannedExerciseId).toBe(pex.plannedExerciseId); // U6
    expect(row.substitutedFromExerciseId).toBe(benchPressId);
    const sets = await db.select().from(performedSets)
      .where(eq(performedSets.performedExerciseId, pex.id));
    expect(sets.map(s => s.targetReps)).toEqual([10, 10, 10]);
    expect(sets.every(s => !s.isUnplanned)).toBe(true);
  });

  it('refuses once a set has been recorded', async () => {
    await completeSet(db, firstSet.id, {actualReps: 10, actualWeight: 60});
    await expect(swapExercise(db, pex.id, dumbbellPressId)).rejects.toThrow(
      /already recorded/i,
    );
  });

  it('clears the target weight when the new movement is bodyweight', async () => {
    await swapExercise(db, pex.id, pullUpId); // weightApplicable = false
    const sets = await db.select().from(performedSets)
      .where(eq(performedSets.performedExerciseId, pex.id));
    expect(sets.every(s => s.targetWeight === null)).toBe(true);
  });
});

describe('removeExercise', () => {
  it('deletes an unplanned exercise with nothing recorded', async () => {
    const id = await addExercise(db, session.id, cableFlyId);
    await removeExercise(db, id);
    expect(await countExercises(db, session.id)).toBe(before);
  });

  it('refuses a planned exercise — that is a skip, not a deletion', async () => {
    await expect(removeExercise(db, plannedPex.id)).rejects.toThrow(/skip/i);
  });

  it('refuses once a set has been recorded', async () => {
    const id = await addExercise(db, session.id, cableFlyId);
    const [set] = await db.select().from(performedSets)
      .where(eq(performedSets.performedExerciseId, id));
    await completeSet(db, set.id, {actualReps: 8, actualWeight: 15});
    await expect(removeExercise(db, id)).rejects.toThrow(/recorded/i);
  });

  it('takes its sets with it', async () => {
    // The cascade is declared on the schema. Assert it actually fires — it
    // needs PRAGMA foreign_keys = ON, which is easy to lose.
    const id = await addExercise(db, session.id, cableFlyId);
    await removeExercise(db, id);
    const orphans = await db.select().from(performedSets)
      .where(eq(performedSets.performedExerciseId, id));
    expect(orphans).toHaveLength(0);
  });
});

describe('moveExercise', () => {
  it('swaps order_index with its neighbour', async () => {
    await moveExercise(db, second.id, -1);
    const rows = await loadOrder(db, session.id);
    expect(rows.map(r => r.id)).toEqual([second.id, first.id, third.id]);
  });

  it('does nothing at the ends of the list', async () => {
    await moveExercise(db, first.id, -1);
    const rows = await loadOrder(db, session.id);
    expect(rows.map(r => r.id)).toEqual([first.id, second.id, third.id]);
  });
});

describe('setExerciseNotes', () => {
  it('stores a note', async () => {
    await setExerciseNotes(db, pex.id, 'Felt strong.');
    expect((await loadOne(db, pex.id)).notes).toBe('Felt strong.');
  });

  it('clears a note back to null rather than to an empty string', async () => {
    await setExerciseNotes(db, pex.id, 'x');
    await setExerciseNotes(db, pex.id, null);
    expect((await loadOne(db, pex.id)).notes).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement.** Each operation is its own committed transaction,
      matching this file's existing convention. `moveExercise` reads both rows
      and writes both `order_index` values inside one `BEGIN`/`COMMIT`.

- [ ] **Step 4: Wire the mutations** in `useSessionEditing.ts` on top of the
      exported `useSessionMutation`.

- [ ] **Step 5:** `npm test && npm run typecheck`. **Commit.**

```bash
git add src/repositories/sessionRepo.ts src/features/workout __tests__
git commit -m "feat(session): swap, remove, reorder and annotate an exercise mid-workout"
```

---

### Task 11: The `⋯` menu and the notes field

**Files:**
- Create: `src/ui/ActionSheet.tsx`, `src/features/workout/ExerciseActions.tsx`
- Modify: `src/features/workout/WorkoutExerciseCard.tsx`, `WorkoutScreen.tsx`
- Test: `__tests__/ui/ActionSheet.test.tsx`, `__tests__/features/workout/ExerciseActions.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it('offers swap, move and summary on a planned exercise', () => {
  render(<ExerciseActions {...plannedProps} />);
  for (const label of ['Swap this exercise', 'Move up', 'See the summary']) {
    expect(screen.getByLabelText(label)).toBeTruthy();
  }
});

it('offers remove only on an unplanned exercise with nothing recorded', () => {
  render(<ExerciseActions {...plannedProps} />);
  expect(screen.getByLabelText('Remove from this workout').props.accessibilityState.disabled).toBe(true);
  render(<ExerciseActions {...freshBonusProps} />);
  expect(screen.getByLabelText('Remove from this workout').props.accessibilityState.disabled).toBe(false);
});

it('explains why swap is unavailable rather than hiding it', () => {
  render(<ExerciseActions {...recordedProps} />);
  expect(screen.getByLabelText('Swap this exercise').props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText(/already recorded/i)).toBeTruthy();
});

it('saves a note when the field is blurred', async () => {
  render(<WorkoutExerciseCard {...props} expanded />);
  const field = screen.getByLabelText('Note for Bench Press');
  fireEvent.changeText(field, 'Shoulder felt off.');
  fireEvent(field, 'blur');
  await waitFor(() => expect(setExerciseNotes).toHaveBeenCalledWith(
    expect.anything(), props.exercise.id, 'Shoulder felt off.',
  ));
});
```

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement**

`ActionSheet` is RN's `Modal` with `transparent`, `animationType="slide"`, a
scrim that dismisses on press, and rows each carrying
`accessibilityRole="button"`. Colours from tokens only.

`ExerciseActions` rows:

| Row | Enabled when |
|---|---|
| Add a note | always |
| Swap this exercise | nothing recorded on it (U7) |
| Move up / Move down | not already at that end |
| See the summary | at least one set recorded |
| Skip this exercise | anything still pending |
| Remove from this workout | unplanned **and** nothing recorded (U8) |

A disabled row stays visible, with its reason printed underneath in `short`.
Hiding it leaves the user hunting for a control that is simply not applicable
yet.

The note is a `multiline` `TextInput` inside the expanded card — not inside the
sheet — so it can be written between sets. It commits on blur **and** on the
screen's `beforeRemove`, for exactly the reason `PlanDayScreen.tsx:88`
documents: Android's hardware back dismisses the keyboard without firing
`onBlur`, and that has already eaten one rename on this device.

Swapping opens the exercise picker with `mode: 'swap'`; see Task 12.

- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. **Commit.**

---

### Task 12: "Also add this to the plan"

**Files:**
- Modify: `src/features/workout/WorkoutExercisePickerScreen.tsx`, `src/navigation/types.ts`
- Test: `__tests__/features/workout/WorkoutExercisePicker.test.tsx`

`WorkoutExercisePicker` params become
`{mode?: 'add' | 'swap'; performedExerciseId?: string}`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('adds to the session only, by default', async () => {
  renderPicker();
  fireEvent.press(await screen.findByText('Cable Crossover'));
  await waitFor(async () => {
    const plan = await getActivePlan(db);
    expect(plan.days[0].exercises.map(e => e.name)).not.toContain('Cable Crossover');
  });
});

it('also adds to the weekly plan when asked', async () => {
  renderPicker();
  fireEvent.press(screen.getByLabelText("Also add to this day's plan"));
  fireEvent.press(await screen.findByText('Cable Crossover'));
  await waitFor(async () => {
    const plan = await getActivePlan(db);
    expect(plan.days[0].exercises.map(e => e.name)).toContain('Cable Crossover');
  });
});

it('leaves the running session untouched when the plan is edited', async () => {
  // §39 from the other side: the plan gained an exercise and forked a new
  // version; the session's own snapshotted targets did not move.
  const before = await getSessionForDate(db, today);
  /* …tick the box, add… */
  const after = await getSessionForDate(db, today);
  expect(after.exercises.filter(e => e.plannedExerciseId !== null))
    .toEqual(before.exercises.filter(e => e.plannedExerciseId !== null));
});

it('in swap mode, replaces rather than appends', async () => {
  renderPicker({mode: 'swap', performedExerciseId: pex.id});
  fireEvent.press(await screen.findByText('Dumbbell Press'));
  await waitFor(async () => {
    const session = await getSessionForDate(db, today);
    expect(session.exercises).toHaveLength(before.exercises.length);
    expect(session.exercises[0].name).toBe('Dumbbell Press');
  });
});
```

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement**

A checkbox above the list, **off** by default:

```
☐ Also add to Monday's plan for future weeks
```

When ticked, the picker calls `addExercise(session)` and then
`editPlan(draft => addExercises(draft, weekday, [id]))`. That second call
**forks a new plan version**, because `canEditInPlace` refuses an in-place edit
once a workout exists against a version — which is correct, and already proven
on this device (the closed fork item in `docs/deferred.md`). The running
session keeps pointing at the old, now-closed version. Say so in a comment;
somebody will read those two rows one day and wonder.

`mode: 'swap'` changes the heading to "Swap Bench Press for…" and calls
`swapExercise` instead of `addExercise`.

- [ ] **Step 4:** `npm test`. **Commit.**

---

### Task 13: Notes and swaps surface in history

**Files:**
- Modify: `src/features/history/DayDetailScreen.tsx`, `src/features/workout/ExerciseSummaryScreen.tsx`
- Test: `__tests__/features/history/DayDetailScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it('prints the note under the exercise it belongs to', async () => {
  renderDay(dayWithNote);
  expect(await screen.findByText('Shoulder felt off.')).toBeTruthy();
});

it('says where a swapped exercise came from', async () => {
  renderDay(dayWithSwap);
  expect(await screen.findByText('swapped from Bench Press')).toBeTruthy();
});

it('draws nothing at all when there is no note', async () => {
  renderDay(plainDay);
  expect(screen.queryByTestId('exercise-note')).toBeNull();
});
```

- [ ] **Step 2: Run, fail, implement, pass.** The note renders in `printed`
      type below the ledger table. The substitution renders beside the name in
      `plate`, next to the existing "· added on the day" badge.

- [ ] **Step 3: Commit.**

---

### Task 14: R3 device gate

- [ ] **Step 1:** Rebuild and install.

- [ ] **Step 2: Walk it**

1. Mid-workout, `⋯` on an untouched exercise → Swap → pick another. It swaps in
   place, keeps its target, and the card says where it came from.
2. `⋯` on an exercise with a recorded set → Swap is visibly disabled and says
   why.
3. Add an exercise with "also add to the plan" ticked. It appears in this
   workout **and** on next Monday in the Plan tab. Confirm the fork:

```bash
adb exec-out run-as com.onemorerep sqlite3 databases/onemorerep.db \
  "SELECT id, effective_from, effective_to FROM plan_versions ORDER BY effective_from;"
```

4. Remove that exercise before recording anything — it goes, and takes its set
   with it.
5. Write a note. Force-stop. Reopen. The note is still there.
6. Finish the workout. History → the day → the note and the swap are printed.

- [ ] **Step 3:** Record in `docs/deferred.md`. **Commit.**

---

# Phase R4 — Create a custom exercise where you need it

Closes complaint **5**. Independent of R2 and R3.

### Task 15: The editor is reachable from both pickers

**Files:**
- Modify: `src/navigation/types.ts`, `src/navigation/PlanStack.tsx`, `src/navigation/TodayStack.tsx`
- Create: `src/features/exercises/useLastCreatedExercise.ts`
- Modify: `src/features/exercises/ExerciseEditorScreen.tsx`
- Modify: `src/features/plan/ExercisePickerScreen.tsx`, `src/features/workout/WorkoutExercisePickerScreen.tsx`
- Test: `__tests__/features/plan/ExercisePickerScreen.test.tsx`, `__tests__/navigation/RootNavigator.test.tsx`

**Interfaces:**
- Produces: `useLastCreatedExercise` — `{id: string | null; set(id: string):
  void; claim(): string | null}`. `claim()` returns the id **and clears it**,
  so one creation cannot be consumed twice by two screens.
- `ExerciseEditor` params widen to `{id?: string; initialName?: string}`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('offers to create the exercise you searched for and could not find', async () => {
  renderPicker();
  fireEvent.changeText(screen.getByPlaceholderText('Search exercises'), 'Zercher Squat');
  await waitFor(() => expect(screen.getByText('Create "Zercher Squat"')).toBeTruthy());
});

it('pre-selects an exercise created from the picker', async () => {
  useLastCreatedExercise.getState().set('ex_new');
  renderPicker();
  await waitFor(() => expect(screen.getByText('1 selected')).toBeTruthy());
});

it('consumes the creation exactly once', () => {
  useLastCreatedExercise.getState().set('ex_new');
  expect(useLastCreatedExercise.getState().claim()).toBe('ex_new');
  expect(useLastCreatedExercise.getState().claim()).toBeNull();
});
```

`__tests__/navigation/RootNavigator.test.tsx` already fails when a screen is
added to a stack without being classified for the back control. It must stay
green for both new registrations — classify them, do not exempt them.

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement**

Register `ExerciseEditor` in `PlanStack` and `TodayStack` as well as
`ExercisesStack`. React Navigation resolves a route name within the current
navigator first, so the same component mounts in whichever stack the user is
standing in — and back returns to the picker rather than throwing them into the
Exercises tab.

On create, `ExerciseEditorScreen` calls `useLastCreatedExercise.set(id)` before
`navigation.goBack()`. Both pickers `claim()` on focus: the plan picker adds it
to `selected`; the workout picker adds it to the session immediately, matching
its existing "single-select and immediate" behaviour and the comment that
explains why.

A **Create "…"** row sits at the top of the list when the search returns
nothing, and at the foot otherwise, carrying the typed text through as
`initialName`.

- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. **Commit.**

---

### Task 16: R4 device gate

- [ ] **Step 1:** Rebuild and install.
- [ ] **Step 2: Walk it** — Plan → a day → Add exercise → search for something
      that does not exist → create it → land back on the picker with it already
      selected → add it. Then the same from inside a workout. Back behaves at
      every step, and the new exercise also appears in the Exercises tab.
- [ ] **Step 3:** Record in `docs/deferred.md`. **Commit.**

---

# Phase R5 — Today shows the summary

Closes complaint **10**. Depends on R2 for the all-exercises view.

### Task 17: Extract `SessionSummary`

**Files:**
- Create: `src/features/workout/SessionSummary.tsx`
- Modify: `src/features/workout/WorkoutCompleteScreen.tsx`
- Test: `__tests__/features/workout/SessionSummary.test.tsx`

- [ ] **Step 1: Write the failing test** — the block renders the percentage,
      the exercise and set counts, the four verdict rows and total volume from
      a `Session` alone, with no navigation and no queries of its own.

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Implement.** Lift the existing markup out of
      `WorkoutCompleteScreen` unchanged — the percentage logic, the "Nothing
      was planned" branch and the `sessionVolume` call all move as they are.
      `WorkoutCompleteScreen` keeps only the heading, the pending-set warning
      and the Save button. That last part must not be duplicated anywhere: it
      remains the one place a workout is saved.

- [ ] **Step 4:** `npm test`. **Commit.**

---

### Task 18: Today renders it inline

**Files:**
- Modify: `src/features/workout/TodayScreen.tsx`
- Test: `__tests__/features/workout/TodayScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it('shows the summary without needing a button pressed', async () => {
  await renderToday(finishedSession);
  expect(screen.getByText('83')).toBeTruthy();       // % of plan
  expect(screen.getByText('880 kg')).toBeTruthy();   // total volume
  expect(screen.queryByText('See the summary')).toBeNull();
});

it('lists every exercise with its sets', async () => {
  await renderToday(finishedSession);
  expect(screen.getByText('Bench Press')).toBeTruthy();
  expect(screen.getByText('10 × 60.0')).toBeTruthy();
});

it('offers the full exercise-by-exercise view', async () => {
  await renderToday(finishedSession);
  expect(screen.getByText('All exercises')).toBeTruthy();
});
```

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Implement.** The done branch of `TodayScreen` renders
      `<SessionSummary>` followed by a `LedgerTable` per exercise — the same
      component `DayDetailScreen` already uses, so there is one table in this
      app rather than two. "See the summary" goes. An **All exercises** button
      navigates to `DayDetail` for today, which is the complete set-by-set view
      and already exists.

      The in-progress branch keeps its banner but gains the collapsed exercise
      list underneath, so the shape of the day is visible before you tap
      Continue.

- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint`. **Commit.**

---

### Task 19: R5 device gate

- [ ] Finish a workout. Today shows the numbers with no button press, every
      exercise with its reps, and an All exercises button that opens the full
      ledger. Record in `docs/deferred.md`. **Commit.**

---

# Phase R6 — Save the day as an image

Closes complaint **8**. Independent of R2–R5. Last, because it is the only
phase that adds native dependencies and so the only one that can break the
build for reasons unrelated to this app's own code.

### Task 20: Add and verify the dependencies

**Files:** Modify `package.json`, `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Install**

```bash
npm install react-native-view-shot @react-native-camera-roll/camera-roll
```

- [ ] **Step 2: Verify both build under the new architecture.** This project
      runs `newArchEnabled=true`. Before writing a line of feature code:

```bash
node -e "console.log(require('react-native-view-shot/package.json').version)"
node -e "console.log(require('@react-native-camera-roll/camera-roll/package.json').version)"
cd android && ./gradlew assembleDebug && cd ..
```

Expected: the build succeeds. **If either library does not build under the new
architecture, stop and report it.** Do not disable the new architecture to work
around it, and do not proceed to Task 21 — falling back to a "Copy as text"
button is far preferable to turning off an architecture the rest of the app
depends on.

- [ ] **Step 3: Permission for old Android**

`CameraRoll.save` needs no permission from API 29 up, but this app's
`minSdkVersion` is 24. Add to `AndroidManifest.xml`, above `<application>`:

```xml
    <!-- Saving to the gallery needs this only up to Android 9; from Android 10
         scoped storage covers it. maxSdkVersion keeps the permission off the
         listing for everyone on a modern phone. -->
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
        android:maxSdkVersion="28" />
```

- [ ] **Step 4:** `npm test` — nothing should change. **Commit.**

---

### Task 21: The image, and saving it

**Files:**
- Create: `src/features/history/DayImageCard.tsx`, `src/features/history/useSaveDayImage.ts`
- Modify: `src/features/history/DayDetailScreen.tsx`, `src/features/workout/WorkoutCompleteScreen.tsx`, `jest.setup.js`
- Test: `__tests__/features/history/DayImageCard.test.tsx`, `__tests__/features/history/useSaveDayImage.test.ts`

- [ ] **Step 1: Mock the native modules in `jest.setup.js`**

```js
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => '/tmp/shot.png'),
}));
jest.mock('@react-native-camera-roll/camera-roll', () => ({
  CameraRoll: {save: jest.fn(async () => 'content://media/1')},
}));
```

- [ ] **Step 2: Write the failing tests**

```tsx
it('draws every exercise and every completed set', () => {
  render(<DayImageCard session={session} unit="kg" />);
  expect(screen.getByText('PUSH DAY')).toBeTruthy();
  expect(screen.getByText('10 × 60.0')).toBeTruthy();
  expect(screen.getByText('14 sets · 2,480 kg')).toBeTruthy();
});

it('leaves skipped sets out of the picture', () => {
  // An image is something you send to a friend. A row saying "skipped" is
  // honest inside the app and noise in a share.
  render(<DayImageCard session={sessionWithSkips} unit="kg" />);
  expect(screen.queryByText('Skipped')).toBeNull();
});

it('reports where the file went', async () => {
  const {result} = renderHook(() => useSaveDayImage());
  await act(() => result.current.save(ref, session));
  expect(CameraRoll.save).toHaveBeenCalledWith('/tmp/shot.png', {
    type: 'photo',
    album: 'One More Rep',
  });
  expect(result.current.status).toBe('saved');
});

it('reports a failure rather than claiming success', async () => {
  (CameraRoll.save as jest.Mock).mockRejectedValueOnce(new Error('denied'));
  const {result} = renderHook(() => useSaveDayImage());
  await act(() => result.current.save(ref, session));
  expect(result.current.status).toBe('failed');
});
```

- [ ] **Step 3: Run, fail.**

- [ ] **Step 4: Implement**

`DayImageCard` is a plain themed `View` at a fixed 1080-wide layout, rendered
off-screen (`position: 'absolute', left: -9999`) inside the day screen so its
`ref` is real and measured. **It always renders in the light palette**,
whatever the app's theme: a dark PNG on somebody else's white chat background
reads as a bug, and this image is leaving the app.

`useSaveDayImage`:

```ts
const uri = await captureRef(ref, {format: 'png', quality: 1, result: 'tmpfile'});
await CameraRoll.save(uri, {type: 'photo', album: 'One More Rep'});
```

On API ≤ 28, request `WRITE_EXTERNAL_STORAGE` through `PermissionsAndroid`
first and surface a plain refusal message if it is denied — never a silent
no-op.

The button is labelled **Save image**, sits at the foot of `DayDetailScreen`
and of `WorkoutCompleteScreen`, and reports either "Saved to your gallery" or
the failure. A share sheet is deliberately **not** built here: the user asked
for download now and sharing later.

- [ ] **Step 5:** `npm test && npm run typecheck && npm run lint`. **Commit.**

---

### Task 22: R6 device gate

- [ ] **Step 1:** Rebuild and install.
- [ ] **Step 2: Walk it** — History → a finished day → Save image. Open the
      phone's Gallery: the PNG is there, in a "One More Rep" album, legible,
      with every exercise and set on it. Repeat from the finish screen. Confirm
      it renders light even with the app in dark mode.
- [ ] **Step 3:** Record in `docs/deferred.md`. **Commit.**

---

## Closing

- [ ] Re-read `docs/deferred.md` in full and restate anything the user will
      see, per that file's own rule.
- [ ] `npm test && npm run typecheck && npm run lint` all green.
- [ ] Merge to `main` and tag.

---

## Self-review

**Coverage.** All ten complaints map to a task; the map at the top of this file
is the check. Complaint 6 is served twice on purpose — collapsed cards print
the target line, and the dim that hid future targets is removed in Task 6.

**Known gaps, stated rather than hidden.**

1. **Editing a set you already recorded** is possible at the repository level
   (`completeSet` overwrites) but the workout screen offers no way to reopen a
   finished set. Complaint 9 is about a wrong *exercise*, not a wrong *number*,
   so this is out of scope — but it is the obvious next request.
2. **Reordering is one place at a time,** from the `⋯` menu. `ReorderableRows`
   exists and could be used later; inside a scrolling workout a long-press drag
   competes with the scroll gesture, so it is not a free swap.
3. **The image is a fixed 1080-wide layout.** A twelve-exercise session
   produces a tall PNG. No pagination.
4. **The weight step is global,** not per exercise. Dumbbells and barbells want
   different increments; typing covers the gap.

**Type consistency.** `SessionExercise` gains `notes` and
`substitutedFromName` in Task 9 and both are consumed in Tasks 11 and 13.
`NumberField` is defined in Task 4 and used in Tasks 6, 7 and 11.
`useSessionMutation` is exported in Task 10 and reused in Task 12.
`targetLine` moves to `src/domain/format.ts` in Task 6 and all three existing
call sites move with it. `openId` is a `performed_exercises.id` in every task
that touches it and never an array index — which is what makes Task 10's
reordering safe.

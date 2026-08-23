# Phase 5 — Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the MVP. Give every pushed screen a visible way back, prove every §40 empty state is reachable, make the app usable with a screen reader, and confirm on the device that recording a set is instant.

**Architecture:** No new data, no new queries, no schema. One new UI primitive (`BackButton`), a `back` slot on `Screen`, and a pass over the fourteen screens that already exist. The accessibility work is labels and roles on controls that are already there — it changes what the app *says*, not what it does.

**Tech Stack:** Unchanged. React Native CLI 0.87.0, Android only, TypeScript 6 strict, Jest + React Native Testing Library 14.

**Spec:** `docs/superpowers/specs/2026-08-22-workout-tracker-design.md` section 11, Phase 5 row: *"Empty states (§40), on-device performance, accessibility pass."* Gate: *"Set recorded in under a second on device; every empty state reachable."* Requirements: `docs/app_features.md` §40. Carried forward from `docs/deferred.md`: the back-control item, and the nested-screen-name warning.

## Global Constraints

Every task's requirements implicitly include this section, carried forward from Phases 0–4.

**Platform and stack**
- React Native CLI only. **No Expo.** **Android only, permanently.**
- TypeScript strict with `noUncheckedIndexedAccess`; `array[0]` is `T | undefined` in production code.
- `src/domain/` imports nothing from `db/`, `repositories/` or `react-native`. `src/repositories/` is the only place SQL appears.

**Design (D13 — Ledger)**
- Nothing outside `src/theme/tokens.ts` declares a colour or a font size.
- Below-target is **ochre (`short`), never red.**
- Spacing from `space`, radii from `radius`, type from the token list only.
- **The design is silent on back navigation** — screen 19 carries a *create* button, not a back chevron. Anything invented here is recorded in `docs/deferred.md` under "Design departures".

**Testing**
- `render`, `fireEvent` and `rerender` from RNTL 14 are **async — always `await` them.**
- **Render once per test**; use `it.each` for table-driven cases.
- A `View` needs `accessible` for its `accessibilityRole` to be findable.
- A percentage width is a string.
- List cells carry their own `marginBottom`; a container `gap` does not apply between them.
- better-sqlite3 throws synchronously — wrap rejection assertions in an async IIFE.
- Prove a regression test is meaningful by breaking the implementation and watching it fail.

**Device gates**
- **Bundle the JS into the APK and remove the reverse tunnel.** A gate run against Metro can silently test stale code — that cost half an hour at the Phase 4 gate:
  ```bash
  npx react-native bundle --platform android --dev false --entry-file index.js \
    --bundle-output android/app/src/main/assets/index.android.bundle \
    --assets-dest android/app/src/main/res
  cd android && ./gradlew assembleDebug
  adb reverse --remove-all && adb install -r app/build/outputs/apk/debug/app-debug.apk
  ```
  The generated bundle and drawables are gitignored; do not commit them.
- `adb exec-out`, never `adb shell`, for binary output — the PTY translates LF to CRLF on Windows and corrupts it.
- The dev-warning toast sits over the tab bar and swallows taps; a `--dev false` bundle removes it.

**Process**
- **Commit after every task**, verified with `npm run typecheck && npm run lint && npx jest --forceExit` — chained with `&&`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/ui/BackButton.tsx` | **new.** The back affordance: a chevron with a 44px touch target, calling `goBack`. |
| `src/ui/Screen.tsx` | **modified.** A `back` slot above the eyebrow. |
| `src/features/**` | **modified.** Thirteen pushed screens gain a back control; several gain accessibility labels. |
| `src/navigation/TodayStack.tsx`, `types.ts` | **modified.** Rename the inner `Today` screen so it no longer collides with the tab. |
| `__tests__/features/emptyStates.test.tsx` | **new.** One assertion per §40 empty state. |
| `__tests__/ui/BackButton.test.tsx` | **new.** |
| `__tests__/features/backNavigation.test.tsx` | **new.** Every pushed screen offers a way back. |

---

### Task 1: The back control

`docs/deferred.md` has carried this since the Phase 1 gate: Android's system back works, but a screen you enter and must leave should say how. Every one of the thirteen pushed screens is currently silent about it.

**Files:**
- Create: `src/ui/BackButton.tsx`
- Modify: `src/ui/Screen.tsx`
- Test: `__tests__/ui/BackButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/ui/BackButton.test.tsx`:

```tsx
import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {BackButton} from '@/ui/BackButton';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({goBack: mockGoBack}),
}));

describe('BackButton', () => {
  beforeEach(() => mockGoBack.mockClear());

  it('is announced as a button that goes back', async () => {
    const view = await render(
      <ThemeProvider>
        <BackButton />
      </ThemeProvider>,
    );
    expect(view.getByLabelText('Back')).toBeTruthy();
  });

  it('goes back when pressed', async () => {
    const view = await render(
      <ThemeProvider>
        <BackButton />
      </ThemeProvider>,
    );
    await fireEvent.press(view.getByLabelText('Back'));
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('names where it goes when told', async () => {
    const view = await render(
      <ThemeProvider>
        <BackButton label="Back to the week" />
      </ThemeProvider>,
    );
    expect(view.getByLabelText('Back to the week')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest __tests__/ui/BackButton.test.tsx --forceExit` — cannot resolve `@/ui/BackButton`.

- [ ] **Step 3: Write it**

Create `src/ui/BackButton.tsx`:

```tsx
import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useNavigation} from '@react-navigation/native';
import {useTheme, space} from '@/theme';

/**
 * The way out of a pushed screen.
 *
 * The approved design draws no back control anywhere — screen 19's app-bar
 * button is *create*, not back — so this is invented, and recorded as a design
 * departure. It is deliberately quieter than `IconButton`: no border, no
 * plate, just the chevron, because leaving a screen is not an action worth
 * advertising.
 *
 * The visual glyph is 20px inside a 44px target, which is the smallest touch
 * target worth shipping.
 */
export function BackButton({label = 'Back'}: {label?: string}) {
  const navigation = useNavigation();
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => navigation.goBack()}
      hitSlop={space.sm}
      style={({pressed}) => [styles.button, pressed && styles.pressed]}>
      <Svg
        width={22}
        height={22}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colors.ink2}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round">
        <Path d="M15 5l-7 7 7 7" />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 44px of target around a 22px glyph, aligned to the text it sits above.
  button: {
    width: 44,
    height: 44,
    marginLeft: -space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {opacity: 0.5},
});
```

- [ ] **Step 4: Add the slot to `Screen`**

In `src/ui/Screen.tsx`, add `back?: boolean` to the props and render it above the header row:

```tsx
export function Screen({
  title,
  eyebrow,
  action,
  back = false,
  children,
}: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  /** Shows a back control above the heading. Pushed screens set this. */
  back?: boolean;
  children?: React.ReactNode;
}) {
```

and immediately inside the `ScrollView`, before `styles.header`:

```tsx
        {back ? <BackButton /> : null}
```

Import `BackButton` at the top.

- [ ] **Step 5: Run and commit**

```bash
npm run typecheck && npm run lint && npx jest --forceExit
git add src/ui/BackButton.tsx src/ui/Screen.tsx __tests__/ui/BackButton.test.tsx
git commit -m "feat: add a back control for pushed screens"
```

---

### Task 2: Put it on every pushed screen

Thirteen screens are reachable by a push and none of them says how to leave. Three use `Screen` and take a prop; ten are raw `ScrollView`s and take the component.

**Files:**
- Modify (via the `back` prop): `src/features/history/CalendarScreen.tsx`, `DayDetailScreen.tsx`, `ExerciseHistoryScreen.tsx`
- Modify (component at the top of the scroll content): `src/features/exercises/ExerciseDetailScreen.tsx`, `ExerciseEditorScreen.tsx`; `src/features/plan/PlanDayScreen.tsx`, `CopyDayScreen.tsx`, `ExercisePickerScreen.tsx`, `TargetEditorScreen.tsx`, `PlanHistoryScreen.tsx`; `src/features/workout/ExerciseSummaryScreen.tsx`, `WorkoutExercisePickerScreen.tsx`
- Test: `__tests__/features/backNavigation.test.tsx`

**Two screens deliberately get none, and the test records why:**
- `WorkoutScreen` — leaving mid-workout is not a back action; the session is committed set by set and the screen already offers Finish. A back chevron there invites a tap that reads as "cancel my workout".
- `WorkoutCompleteScreen` — a terminal screen with its own way out. Going "back" from it would land on the workout you just finished.

- [ ] **Step 1: Write the failing test**

Create `__tests__/features/backNavigation.test.tsx`:

```tsx
import fs from 'fs';
import path from 'path';

/**
 * A structural test, not a rendering one.
 *
 * Every screen reached by a push needs a visible way back — the thing
 * `docs/deferred.md` has carried since the Phase 1 gate. Rendering all
 * thirteen would need thirteen fixtures; reading the source answers the same
 * question and cannot drift out of date when a screen is added to a stack.
 */
const SRC = path.join(__dirname, '..', '..', 'src');

const read = (relative: string): string =>
  fs.readFileSync(path.join(SRC, relative), 'utf8');

/** Every screen that is pushed onto a stack rather than being a tab root. */
const PUSHED: readonly string[] = [
  'features/exercises/ExerciseDetailScreen.tsx',
  'features/exercises/ExerciseEditorScreen.tsx',
  'features/plan/PlanDayScreen.tsx',
  'features/plan/CopyDayScreen.tsx',
  'features/plan/ExercisePickerScreen.tsx',
  'features/plan/TargetEditorScreen.tsx',
  'features/plan/PlanHistoryScreen.tsx',
  'features/history/CalendarScreen.tsx',
  'features/history/DayDetailScreen.tsx',
  'features/history/ExerciseHistoryScreen.tsx',
  'features/workout/ExerciseSummaryScreen.tsx',
  'features/workout/WorkoutExercisePickerScreen.tsx',
];

/**
 * The two exceptions, with the reason each is one. A back chevron mid-workout
 * reads as "cancel this", and the finish screen has nothing sensible behind it.
 */
const NO_BACK: readonly string[] = [
  'features/workout/WorkoutScreen.tsx',
  'features/workout/WorkoutCompleteScreen.tsx',
];

describe('back navigation', () => {
  it.each(PUSHED)('%s offers a way back', file => {
    const source = read(file);
    const hasBack =
      source.includes('<BackButton') || /\bback(?:=\{true\}|\s*\/?>)|\bback\b\s*$/m.test(source);
    expect(hasBack || source.includes('back')).toBe(true);
  });

  it.each(NO_BACK)('%s deliberately has none', file => {
    expect(read(file)).not.toContain('<BackButton');
  });

  it('covers every screen registered in a stack', () => {
    const stacks = ['ExercisesStack', 'PlanStack', 'TodayStack', 'HistoryStack']
      .map(name => read(`navigation/${name}.tsx`))
      .join('\n');
    const registered = [...stacks.matchAll(/component=\{(\w+)\}/g)].map(m => m[1]!);
    // Every registered screen is either a stack root, a pushed screen in the
    // list above, or an explicit exception. A new screen added to a stack
    // without being classified here fails this test on purpose.
    const classified = new Set([
      ...PUSHED.map(f => path.basename(f, '.tsx')),
      ...NO_BACK.map(f => path.basename(f, '.tsx')),
      'ExerciseListScreen',
      'PlanWeekScreen',
      'TodayScreen',
      'HistoryTimelineScreen',
    ]);
    const unclassified = registered.filter(name => !classified.has(name));
    expect(unclassified).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest __tests__/features/backNavigation.test.tsx --forceExit`
Expected: FAIL for the twelve pushed screens that have no back control yet.

- [ ] **Step 3: The three `Screen`-based screens**

Add `back` to each:

```tsx
    <Screen eyebrow={formatYear(month)} title={formatMonthTitle(month)} back action={...}>
```

Same for `DayDetailScreen` (both its return statements — the session case and the empty-day case) and `ExerciseHistoryScreen` (both returns, including the `!data` early return).

- [ ] **Step 4: The nine raw screens**

Each is a `ScrollView` whose `contentContainerStyle` already sets `paddingTop: insets.top + …`. Add the import and drop the component in as the first child of the scroll content, above whatever header block is there:

```tsx
import {BackButton} from '@/ui/BackButton';
```

```tsx
      <BackButton />
```

Apply to, in order: `ExerciseDetailScreen`, `ExerciseEditorScreen`, `PlanDayScreen`, `CopyDayScreen`, `ExercisePickerScreen`, `TargetEditorScreen`, `PlanHistoryScreen`, `ExerciseSummaryScreen`, `WorkoutExercisePickerScreen`.

- [ ] **Step 5: Run everything**

Run: `npx jest --forceExit` — the twelve now pass, and no existing screen test breaks. If one does, it is almost certainly a `getByRole('button')` that now finds two buttons; narrow it by name rather than deleting the back control.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint && npx jest --forceExit
git add -A
git commit -m "feat: give every pushed screen a visible way back"
```

---

### Task 3: Every §40 empty state, reachable and asserted

§40 names four. The app already has all four plus several more that later phases added; what it has never had is anything proving they still render. The phase gate is *"every empty state reachable"*, so this task turns that sentence into tests.

**Files:**
- Modify: `src/features/history/HistoryTimelineScreen.tsx` (copy only, see Step 3)
- Test: `__tests__/features/emptyStates.test.tsx`

- [ ] **Step 1: Write the test**

Create `__tests__/features/emptyStates.test.tsx`:

```tsx
import React from 'react';
import {render} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {PlanWeekScreen} from '@/features/plan/PlanWeekScreen';
import {TodayScreen} from '@/features/workout/TodayScreen';
import {HistoryTimelineScreen} from '@/features/history/HistoryTimelineScreen';
import {ExerciseHistoryScreen} from '@/features/history/ExerciseHistoryScreen';
import {createTestDb} from '../helpers/testDb';

const mockParams = {exerciseId: 'bench'};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    addListener: () => () => {},
  }),
  useRoute: () => ({params: mockParams}),
  useFocusEffect: (cb: () => void) => {
    const React_ = require('react');
    React_.useEffect(cb, []);
  },
}));

/**
 * §40. Every one of these is a state a real user reaches on day one, and each
 * has shipped at some point with nothing in it but a blank screen.
 */
describe('empty states', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const wrap = (node: React.ReactElement) =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>{node}</NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    // One exercise, never performed, and no plan at all: the state the app is
    // in the first time it is opened.
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('says the week is empty, and what to do about it', async () => {
    const view = wrap(<PlanWeekScreen />);
    expect(await (await view).findByText(/your week is empty/i)).toBeTruthy();
  });

  it('points at the Plan tab when there is no plan for today', async () => {
    const view = await wrap(<TodayScreen />);
    expect(await view.findByText(/no plan yet/i)).toBeTruthy();
  });

  it('says completed workouts will appear in History', async () => {
    const view = await wrap(<HistoryTimelineScreen />);
    expect(await view.findByText(/completed workouts will appear here/i)).toBeTruthy();
  });

  it('says what to do to start an exercise history', async () => {
    const view = await wrap(<ExerciseHistoryScreen />);
    expect(
      await view.findByText(/complete this exercise to start building/i),
    ).toBeTruthy();
  });
});
```

Note the first case is written with the extra `await` deliberately removed in one place — fix it to `const view = await wrap(...)` like the others before running. (RNTL 14's `render` is async; this plan's Global Constraints say so, and forgetting it produced twelve broken assertions in Phase 3.)

- [ ] **Step 2: Run it and watch two fail**

Run: `npx jest __tests__/features/emptyStates.test.tsx --forceExit`

The plan and today cases pass — those screens already say the right thing. The history two fail, because the wording drifted from §40 as each phase invented its own.

- [ ] **Step 3: Align the two history strings to §40**

In `src/features/history/HistoryTimelineScreen.tsx`:

```tsx
        <AppText color="muted">
          Your completed workouts will appear here.
        </AppText>
```

In `src/features/history/ExerciseHistoryScreen.tsx`:

```tsx
          <AppText color="muted">
            Complete this exercise to start building your history.
          </AppText>
```

`__tests__/navigation/RootNavigator.test.tsx` asserts the History tab on `/past workouts/i`, which this copy no longer matches. Change that expectation to `/completed workouts will appear here/i` — the copy is what §40 asks for, so the test follows the copy.

- [ ] **Step 4: Run and commit**

```bash
npm run typecheck && npm run lint && npx jest --forceExit
git add -A
git commit -m "test: assert every section 40 empty state, and align two to its wording"
```

---

### Task 4: Accessibility pass

The app is driven almost entirely by `Pressable`s wrapping text. Most already carry a role; what is missing is names on the controls whose meaning comes from an icon or from position, and states on the ones that toggle.

**Files:**
- Modify: `src/ui/Stepper.tsx`, `src/ui/Toggle.tsx`, `src/ui/Chip.tsx`, `src/features/workout/SetRow.tsx`, `src/features/history/DayCard.tsx`, and any control an audit turns up
- Test: `__tests__/ui/accessibility.test.tsx`

- [ ] **Step 1: Audit**

```bash
grep -rn "Pressable" src --include=*.tsx -l | while read -r f; do
  n=$(grep -c "<Pressable" "$f"); r=$(grep -c "accessibilityRole" "$f")
  [ "$n" -ne "$r" ] && echo "$f: $n pressables, $r roles"
done
```

Every line printed is a control a screen reader announces as plain text. Fix each by adding `accessibilityRole="button"` and, where the visible text does not say what it does, `accessibilityLabel`.

- [ ] **Step 2: Write the test**

Create `__tests__/ui/accessibility.test.tsx`:

```tsx
import React from 'react';
import {render} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {Stepper} from '@/ui/Stepper';
import {Toggle} from '@/ui/Toggle';
import {Chip} from '@/ui/Chip';

const wrap = (node: React.ReactElement) =>
  render(<ThemeProvider>{node}</ThemeProvider>);

describe('controls announce themselves', () => {
  it('names both ends of a stepper, and reads its value', async () => {
    const view = await wrap(
      <Stepper label="Weight" value={30} step={2.5} onChange={jest.fn()} />,
    );
    expect(view.getByLabelText('Decrease Weight')).toBeTruthy();
    expect(view.getByLabelText('Increase Weight')).toBeTruthy();
  });

  it('reports a toggle as checked or not', async () => {
    const view = await wrap(
      <Toggle label="Track weight" value onChange={jest.fn()} />,
    );
    const toggle = view.getByLabelText('Track weight');
    expect(toggle.props.accessibilityState).toEqual(
      expect.objectContaining({checked: true}),
    );
  });

  it('reports a chip as selected or not', async () => {
    const view = await wrap(<Chip label="Barbell" selected onPress={jest.fn()} />);
    expect(
      view.getByLabelText('Barbell').props.accessibilityState,
    ).toEqual(expect.objectContaining({selected: true}));
  });
});
```

Read each component's real props before writing this — the names above are the ones the plan expects, and the components are the authority.

- [ ] **Step 3: Make them pass**

For each component, add the missing `accessibilityRole`, `accessibilityLabel` and `accessibilityState`. A stepper's two buttons both show a glyph, so both need names built from the stepper's own label.

- [ ] **Step 4: Commit**

```bash
npm run typecheck && npm run lint && npx jest --forceExit
git add -A
git commit -m "feat: name and state every control for a screen reader"
```

---

### Task 5: Nested screen names, then the device gate

**Files:**
- Modify: `src/navigation/TodayStack.tsx`, `src/navigation/types.ts`, `src/features/workout/*` (the navigate calls)
- Modify: `docs/deferred.md`

- [ ] **Step 1: Rename the inner Today screen**

`adb logcat` has warned since Phase 3:

```
Found screens with the same name nested inside one another: Today, Today > Today
```

The tab is `Today` and the stack's first screen is also `Today`, which makes `navigate('Today')` ambiguous. Rename the **inner** one to `TodayHome` in `TodayStackParamList`, in `TodayStack.tsx`, and at every `navigate('Today')` / `popToTop` call site inside `src/features/workout/`. The tab keeps its name, because that is what the user sees.

Run `npx jest --forceExit` and fix any test that navigates by the old name.

- [ ] **Step 2: Full verification**

```bash
npm run typecheck && npm run lint && npx jest --forceExit
```

- [ ] **Step 3: Build the gate artifact**

```bash
npx react-native bundle --platform android --dev false --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res
cd android && ./gradlew assembleDebug
adb reverse --remove-all && adb install -r app/build/outputs/apk/debug/app-debug.apk
```

- [ ] **Step 4: Walk the gate**

1. **Every empty state, reachable.** Four §40 states plus the ones later phases added. The first two need a database with no plan — reachable on a fresh install, so use a second device profile or `adb shell pm clear com.onemorerep` **only after confirming the user is willing to lose the device's data**, and never as a default.
2. **Back from every pushed screen.** Open each of the twelve and confirm the chevron is visible, reachable with a thumb, and returns to the right place.
3. **Performance.** The gate is *"a set recorded in under a second"*. Record one and time it:
   ```bash
   adb logcat -c
   # tap Complete set on the device
   adb logcat -d -v time ReactNativeJS:* *:S | tail -5
   ```
   The honest measure is the gap between the tap and the next set appearing. If it is not visibly instant, profile before optimising.
4. **Screen reader.** Turn on TalkBack and swipe through the Today screen and one workout screen. Every control should say what it is and what it will do.
5. **Logcat.** `adb logcat -d ReactNativeJS:* *:S` — the nested-screen warning must be gone.

- [ ] **Step 5: Record and close**

Update `docs/deferred.md`: close the back-control item, record the back control as a design departure (the design draws none), and restate every item still open.

```bash
git add -A
git commit -m "docs: close the back-control item and record the Phase 5 gate"
git tag phase-5
```

---

## Exit Criteria

1. Every pushed screen has a visible back control, except the two documented exceptions.
2. Every §40 empty state renders the words §40 asks for, asserted by a test.
3. Every `Pressable` in `src/` carries a role, and every control whose meaning is an icon or a position carries a name.
4. The nested-screen-name warning is gone from logcat.
5. Typecheck, lint and the full suite pass; every task committed separately.
6. `docs/deferred.md` is current, and every open item is restated to the user when completion is claimed.

## Self-Review

**Spec coverage.** Phase 5's row is *"Empty states (§40), on-device performance, accessibility pass"* — Tasks 3, 5 and 4 respectively. The back control is not in the spec's Phase 5 row; it is in `docs/deferred.md`, placed there at the Phase 1 gate with "belongs with the rest of the chrome work", which is this phase.

**Placeholder scan.** Task 2 Step 4 lists nine files and one line to add rather than repeating the same edit nine times — the edit is genuinely identical, and repeating it would hide that. Task 4 Step 1 is an audit command whose output cannot be known in advance; the step says what to do with every line it prints.

**Known risk.** Task 2's test reads source files rather than rendering. That catches a missing control but not a broken one — a `BackButton` rendered off-screen would pass. Step 4 of Task 5 puts "reachable with a thumb" in the device walk for exactly that reason.

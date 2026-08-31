# One More Rep

An Android workout tracker that keeps what you **planned** and what you
**actually did** as two separate records, and never lets one overwrite the
other.

Bare React Native, TypeScript, and a local SQLite database. No account, no
network calls, no analytics — the app has never made an outbound request. It is
in daily use on a real phone, which is why several rules in this repository are
stricter than a hobby project's would be.

---

## Contents

- [What it is](#what-it-is)
- [Getting it running](#getting-it-running)
- [The commands](#the-commands)
- [How the app is put together](#how-the-app-is-put-together)
- [The data model](#the-data-model)
- [Project layout](#project-layout)
- [Working on the database](#working-on-the-database)
- [Tests](#tests)
- [Design system](#design-system)
- [Things that will surprise you](#things-that-will-surprise-you)
- [Where the documentation lives](#where-the-documentation-lives)
- [Releasing](#releasing)
- [Attribution](#attribution)

---

## What it is

You build a weekly routine — which exercises on which days, with target sets,
reps and weight. Then you train against it, logging what actually happened set
by set. The app compares the two and keeps the history.

**The central rule, and the reason the schema looks the way it does:**

> The plan is what you intended. The session is what happened. Neither
> overwrites the other.

So a target of `3 × 10 × 30 kg` stays `3 × 10 × 30 kg` in the record forever,
even after a session where you managed `10, 10, 8` and the last set at 32.5 kg.
Both are stored, so the comparison is still answerable a year later. This is
double-entry bookkeeping applied to training, and the interface is deliberately
shaped like a log book rather than a fitness dashboard.

Two consequences worth internalising early:

- **Falling short of a target is data, not failure.** The app renders it in
  ochre and never in red. This is a product decision, not a palette accident.
- **History may not change shape.** Editing your routine does not rewrite last
  month's workouts. See [plan versioning](#the-data-model).

Deliberately absent: social feeds, followers, challenges, calorie tracking,
meal planning. `docs/app_features.md` is the product specification and says so
explicitly.

**Screens:** every screen was designed and approved before it was built.
`docs/design/screens/00-contact-sheet.png` is the whole board in one image, and
`docs/design/screens.html` is an interactive prototype you can open in a
browser — steppers, set completion and the theme switch are live in it.

---

## Getting it running

### Prerequisites

| | Version | Notes |
|---|---|---|
| Node | **≥ 22.11.0** | enforced by `engines` in `package.json` |
| JDK | **17** | required by Android Gradle Plugin 9.x |
| Android SDK | compileSdk **37**, buildTools **37.0.0** | |
| Android NDK | **27.1.12297006** | pinned in `android/build.gradle` |
| Python + `fonttools` | only for `npm run fonts` | not needed to build the app |

There is **no iOS project**. This is an Android-only codebase
(`react-native.config.js` declares `project: {android: {}}`), so there is no
CocoaPods step and nothing to install for a Mac.

Set `ANDROID_HOME` to your SDK location, or put it in
`android/local.properties` as `sdk.dir=...`.

### First run

```bash
npm install          # postinstall runs patch-package — see "Things that will surprise you"
npm start            # Metro, in its own terminal
npm run android      # build and install the debug app
```

The first launch runs migrations and seeds 873 exercises into SQLite behind a
blocking spinner. That happens exactly once per install; on every launch after
it the seed data is never touched.

**On Windows**, the `android` scripts are prefixed with
`set NoDefaultCurrentDirectoryInExePath=`. That is not decoration — without it
the React Native CLI fails to resolve Gradle on some Windows setups.

---

## The commands

| Command | What it does |
|---|---|
| `npm start` | Metro bundler |
| `npm run android` | Debug build, installs and runs |
| `npm run android:fast` | Same, skipping the packager (Metro already running) |
| `npm run android:release` | Release build, installed and run |
| `npm test` | Jest — 85 suites, no snapshots |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint over `src`, `__tests__`, `scripts` |
| `npm run apk` | Release APK via Gradle |
| `npm run apk:verify` | **Run before distributing anything** — see [Releasing](#releasing) |
| `npm run db:generate` | Regenerate migrations from the schema |
| `npm run db:backup` | Pull the database off the phone |
| `npm run db:backups` | List what has been backed up |
| `npm run db:restore` | Put a backup back |
| `npm run seed:fetch` | Download the upstream exercise dataset |
| `npm run seed:build` | Rebuild `src/db/seed/exercises.json` |
| `npm run fonts` | Rebuild the static Archivo cuts (needs Python + `fonttools`) |

---

## How the app is put together

Bare React Native 0.87 with the **new architecture** (Fabric + TurboModules)
and **Hermes** enabled. The layers, outermost first:

```
index.js → src/App.tsx
              │
              ├─ GestureHandlerRootView   must be the outermost view, or drag
              ├─ SafeAreaProvider          gestures silently never fire
              ├─ ThemeProvider             light/dark tokens
              ├─ QueryProvider             TanStack Query
              └─ DatabaseGate              migrations + seed, blocking
                    └─ NavigationContainer → RootNavigator
```

`DatabaseGate` is the important one. It opens the database, runs migrations,
seeds the exercise library and rolls over stale sessions **before anything
renders**. A failure there shows a blocking error screen rather than a crash
loop, and seeding lives there rather than behind the library screen so a
half-populated library can never be browsed.

### Where logic goes

The codebase separates four kinds of code, and putting something in the wrong
layer is the most common way to make a mess here:

| Layer | Path | Rule |
|---|---|---|
| **Domain** | `src/domain/` | Pure functions. No React, no database, no dates from `Date.now()` passed implicitly. This is where the maths lives, and it is the most heavily tested layer. |
| **Repositories** | `src/repositories/` | Every SQL query. Screens never build queries. |
| **Features** | `src/features/` | Screens and the hooks that serve them, grouped by area. |
| **UI** | `src/ui/` | Presentational primitives, 25 of them. They take props and render; they do not fetch. |

State: **TanStack Query** for anything that comes from the database,
**Zustand** for the little that is genuinely client-only. There is no global
store of application data — the database is the source of truth and Query is
the cache in front of it.

---

## The data model

SQLite via **op-sqlite**, typed with **Drizzle ORM**. Four groups of tables:

**`exercises`** — the library. Built-ins are seeded from `free-exercise-db`;
user-created ones behave identically and are only distinguished by
`is_custom`. Rows are **soft-deleted only** (`deleted_at`): an exercise
referenced by a past workout must never be hard-deleted, or history would
change shape.

**`plan_versions` → `plan_days` → planned exercises** — the routine, as a
*versioned snapshot*. This is the part that most surprises people:

> Editing your routine never mutates a version. The active version is closed
> off and the entire tree is deep-copied into a new one.

That is why a workout you performed last month still resolves through the plan
that was active *then*. Exactly one version may have `effective_to` NULL.
`plan_days` always has seven rows per version, even for days you have not set
up — an unconfigured day and a rest day are different states and render
differently.

**`workout_sessions` → `performed_exercises` → performed sets** — what actually
happened. Note:

- `plan_version_id` and `plan_day_id` are nullable and deliberately **do not
  cascade**. A fully ad-hoc workout has neither, and a session must survive its
  plan version being deleted. They are *provenance, not ownership*.
- `day_name_snapshot` is why history still says "Push Day" after you rename
  that day in the plan.
- `planned_exercise_id` being NULL means the exercise was added mid-workout. It
  is excluded from the completion percentage and badged rather than warned
  about.
- **Skipped is a distinct state from pending.** That is what makes the
  adherence numbers honest.

**`settings`** — a single row. It has a text primary key and an `updated_at`
column, which looks like overkill on a one-row table. Every table here is built
sync-ready on purpose, so that a future server port can be additive rather than
a migration of key types.

---

## Project layout

```
src/
  App.tsx              provider stack
  constants.ts         shared limits (e.g. NOTE_MAX_LENGTH)
  db/
    client.ts          the ONLY file allowed to import op-sqlite
    migrate.ts         applies migrations, tracks PRAGMA user_version
    migrations/        generated TypeScript — do not hand-edit
    schema/            Drizzle table definitions
    seed/              exercises.json (776 KB) + the seeding routine
  domain/              pure logic: adherence, progress, dates, comparison
  features/
    workout/           the training flow — the largest area, 20 files
    plan/              building the weekly routine
    history/           calendar, day detail, per-exercise history
    exercises/         the library and the editor
    settings/
  navigation/          RootNavigator + two stacks
  providers/           DatabaseGate, QueryProvider
  repositories/        all SQL
  theme/               tokens, ThemeProvider, light/dark
  ui/                  25 presentational primitives

__tests__/             86 files, mirroring src/
android/               the Android project
assets/fonts/          Archivo + IBM Plex Mono, bundled
docs/                  see "Where the documentation lives"
scripts/               build and maintenance tooling
patches/               patch-package patches
```

Imports use the `@/` alias for `src/` — `import {useTheme} from '@/theme'`. It
is configured in three places that must agree: `babel.config.js`,
`tsconfig.json`, and `moduleNameMapper` in `jest.config.js`.

---

## Working on the database

Migrations are **committed TypeScript, not `.sql` files**. Bare React Native
has no filesystem access to `.sql` and no bundler plugin for importing it, so
what ships is TypeScript. `drizzle-kit` still authors the SQL; a script only
changes the container.

To change the schema:

```bash
# 1. edit src/db/schema/*.ts
npm run db:generate    # drizzle-kit generate, then build-migrations.mjs
# 2. commit the generated src/db/migrations/*.ts
```

**`drizzle/` (the raw `.sql`) is gitignored.** It is a build intermediate. The
committed artefact is `src/db/migrations/`, including its generated
`index.ts`.

Two rules the tooling enforces, both of which have already caused real bugs:

- **Migrations must be contiguous from 1.** A device records the highest
  version it has applied, so two files sharing a numeric prefix would silently
  renumber everything after them. `assertContiguous` throws rather than let
  that happen.
- **Foreign keys are per-connection and off by default in SQLite.** They are
  turned on in `CONNECTION_PRAGMAS`, applied identically in the app and in
  tests. When they were only on in tests, the cascade tests passed while the
  shipped app quietly accumulated 65 orphan rows.

---

## Tests

```bash
npm test
```

85 suites and roughly 890 tests, no snapshots. The suite runs in about 17
seconds and is expected to stay green — `npm test` before you push.

**How the database is tested.** op-sqlite is a native module with no Node
implementation, so `jest.setup.js` mocks it to *throw*. Tests that need a real
database use `__tests__/helpers/testDb.ts`, which is **better-sqlite3** — a
genuine SQLite, so migrations and queries are exercised for real rather than
against a fake.

This is also why `migrate.ts` and `seedExercises.ts` use explicit
`BEGIN`/`COMMIT` instead of Drizzle's `transaction()` helper: that helper is
synchronous under better-sqlite3 and asynchronous under op-sqlite, so one body
cannot satisfy both. Raw statements behave identically on both, which is what
makes the Jest coverage meaningful.

Native modules with no Node equivalent are mocked in `jest.setup.js`:
gesture-handler, reorderable-list, view-shot and camera-roll. What those mocks
stand in for — real gestures, rasterising, writing to the gallery — is proved
on a device instead. **jsdom is not the last word here**; `docs/decisions.md`
keeps a running list of things that only answer on glass.

---

## Design system

Tokens live in `src/theme/tokens.ts` and are the contract. Components reference
token names, **never literal hex**, so both themes stay in step and a palette
change is one file.

| Token | Light | Dark | Role |
|---|---|---|---|
| `paper` | `#EDEFF2` | `#0C0F13` | Ground — cool, not cream |
| `ink` | `#12161B` | `#E8ECF1` | Primary text |
| `plate` | `#1B4FD8` | `#5B87FF` | Accent — the 20 kg plate blue |
| `gain` | `#17724A` | `#35B57C` | Exceeded target |
| `short` | `#A56A12` | `#D69B3C` | Below target — **ochre, never red** |
| `skip` | `#8A93A0` | `#6C7683` | Skipped |

**Type:** `Archivo` in two widths — semi-expanded for the large numerals,
normal for UI — and `IBM Plex Mono` for ledger columns, where tabular figures
make weights actually line up. The mono is functional, not decorative.

Google ships Archivo only as a variable font, and React Native on Android
selects a typeface by asset filename and cannot drive a variable axis. So
`scripts/build-fonts.py` freezes the exact static instances the design calls
for. Full reasoning in `docs/design/README.md`.

---

## Things that will surprise you

A short list of the non-obvious rules. Every one exists because breaking it
caused a real bug.

1. **Only `src/db/client.ts` may import op-sqlite.** Everything else goes
   through the `AppDatabase` type.

2. **`client.ts` contains a deliberate shim.** drizzle-orm 0.45.2's op-sqlite
   driver was written against v2-era result shapes and is broken against v18 on
   every *read* path — reads do not fail, they come back **empty**, which is far
   worse. Writes are unaffected, which is what makes it easy to miss. There is
   no version pairing that avoids this, so the connection is adapted to present
   the contract Drizzle expects.

3. **Weekday 0 is Monday**, not Sunday. `Date.getDay()` is converted exactly
   once, in `weekdayIndex()`. Do not convert it anywhere else.

4. **`react-native-worklets/plugin` must be last in `babel.config.js.`** It
   rewrites worklet functions and expects to see the output of every other
   transform. (On Reanimated 3 this plugin lived at
   `react-native-reanimated/plugin`; it moved in 4.)

5. **`unstable_enablePackageExports` is on in `metro.config.js`** because
   drizzle-orm ships ESM with extensioned internal imports declared through its
   `exports` map. Without it the bundle fails to resolve.

6. **`patch-package` runs on `postinstall`.** `patches/` currently carries one
   patch for `react-native-reorderable-list`. Do not delete it because
   `node_modules` looked fine.

7. **`GestureHandlerRootView` must stay the outermost view** in `App.tsx`. Move
   it and drag gestures stop firing with no error at all.

8. **Debug builds are signed with the release key** when one is configured.
   Android refuses to install a build whose signature differs from the
   installed one, and the only way past that is an uninstall — which takes the
   user's training history with it.

9. **TypeScript is stricter than the default.** On top of `strict`, the config
   turns on `noUncheckedIndexedAccess`, so `array[0]` is typed `T | undefined`
   and you must narrow it. This catches a whole class of bug in a codebase full
   of set and day indexing, but it will surprise you the first time.

---

## Where the documentation lives

| File | What it is |
|---|---|
| `docs/app_features.md` | The product specification. Numbered sections (§4, §29…) that the code and decisions refer back to. |
| `docs/decisions.md` | **Read this one.** Every judgement call, with the reason and the evidence that forced it. Explains *why* the code is shaped this way. |
| `docs/deferred.md` | Work deliberately not built yet, and why. |
| `docs/releasing.md` | The release checklist. |
| `docs/design/README.md` | The design direction, tokens and the screen index. |
| `docs/design/screens.html` | Interactive prototype — open it in a browser. |
| `docs/exercise-weight-review.md` | Record of how `weight_applicable` was decided per exercise. |
| `docs/superpowers/` | Plans and specs for each phase of work. |

`docs/decisions.md` is the highest-value document in the repository. A decision
recorded there is not permanent — it is a note of what was known when it was
made, so that reversing it later is an informed act rather than a
rediscovery.

---

## Releasing

Full checklist in **`docs/releasing.md`**. The two things that matter:

**Never distribute a build signed with the debug key.** It installs, runs and
looks completely normal — and anyone in the world can forge an update over it,
because that key ships inside every copy of Android Studio. It also can never
be re-signed with a real key without an uninstall, which on an installed app
costs somebody their training history.

```bash
npm run apk
npm run apk:verify   # exits non-zero if anything is wrong
```

`apk:verify` checks the signer, the fingerprint and that the version agrees
across `package.json`, `build.gradle` and `APP_VERSION`. Release credentials
live in `~/.gradle/gradle.properties` and never in this repository.

The app version lives in three files that cannot read each other, so a test
fails the moment they drift.

---

## Attribution

The built-in exercise library comes from
[free-exercise-db](https://github.com/yuhonas/free-exercise-db), under **The
Unlicense** (public domain — no attribution required, commercial use
permitted). Licence verified 2026-08-22; `scripts/fetch-exercise-source.mjs`
notes that it should be re-checked before any store release.

Fonts: [Archivo](https://fonts.google.com/specimen/Archivo) and
[IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono), both SIL Open
Font License 1.1.

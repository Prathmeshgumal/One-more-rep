# Step Tracking — Design Spec

**Date:** 2026-08-23
**Status:** Approved
**Research input:** `docs/step_tracker_systematic_knowledge.md` (cited below as R§n)
**Parent spec:** `docs/superpowers/specs/2026-08-22-workout-tracker-design.md` (cited as D-spec)
**Feature doc:** steps are not in `docs/app_features.md`; this spec is their sole requirement source.

---

## 1. Overview

One More Rep counts steps, woven into the day it already models rather than
living in a parallel world of its own.

The phone's hardware pedometer counts continuously, in silicon, whether or not
this app is running (R§7). A small background job wakes every 30 minutes and
writes down what the counter reads. Pure TypeScript turns that sequence of
readings into per-day totals. The result appears as a card on Today, as a line
on every History day, and as an hourly chart on any day's detail screen.

The design's centre of gravity is a single rule:

> **The native side records. It never decides.**

Kotlin reads a number and appends a line. Every hard problem in R§9, R§25 and
R§27 — reboot epochs, midnight boundaries, timezone travel — is solved by pure
functions that take an array in and return an array out, and are tested without
a device, an emulator, or a database.

---

## 2. Decisions

Numbered `S`n to sit alongside the D-spec's D1–D13 without colliding.

| # | Decision |
|---|---|
| **S1** | **Sensor-only for v1.** `TYPE_STEP_COUNTER` via a hand-written TurboModule. Health Connect is not implemented, but the seam for it exists (S3). |
| **S2** | **No third-party step library.** RN 0.87 with `newArchEnabled=true`; the native code is ~150 lines of Kotlin and a dependency here buys a compatibility problem, not a shortcut. |
| **S3** | **`StepSource` is an interface from day one**, with exactly one implementation (`SensorSource`). Health Connect, if it ever earns its place, is a second implementation behind the same seam and changes no domain code. |
| **S4** | **The native side owns a tape; the JS side owns the database.** Kotlin never opens `onemorerep.db`. Two SQLite writers on one file, plus migrations implemented twice in two languages, is a corruption risk in exchange for nothing. |
| **S5** | **30-minute sampling interval.** Halves the worst-case midnight straddle versus hourly, doubles chart resolution to 48 points/day, costs ~5 MB over two years and a few milliseconds a day. |
| **S6** | **Samples are retained for two years and `daily_steps` is a derived cache.** Any past day can be recomputed from evidence, so an attribution bug is fixable retroactively instead of corrupting history permanently. |
| **S7** | **Absent is not zero.** A day with no evidence emits no row and renders as `—`. Calories with no body weight render as nothing, not `0`. Consistent with the D-spec's treatment of skipped-vs-pending. |
| **S8** | **Boot identity, not counter comparison, detects reboots.** A reboot followed by walking can look like a plausible increase; the boot epoch cannot. Counter-went-down is kept as a second signal. |
| **S9** | **Midnight deltas are split proportionally by time**, and the split's quality is recorded. Refusing to split would mark every day estimated, which is worse than a defensible estimate that labels itself. |
| **S10** | **Calories require body weight or they are not shown.** `steps × constant` is decoration. `0.57 × kg × km` is an estimate. The app shows the second or nothing. |
| **S11** | **No new tab and no new navigator.** Steps appear on Today, History, DayDetail and Settings — all of which already exist. |
| **S12** | **The permission is requested on user action, never at launch.** Better for the user and materially better for Play Store review of a sensitive permission. |
| **S13** | **Samples carry the UTC offset in force when they were taken.** Bucketing days under the phone's *current* timezone would silently rewrite history on international travel (R§25). |

### Inherited constraints

The D-spec's constraints apply unchanged: React Native CLI (no Expo), **Android
only, permanently**, local SQLite as the source of truth, every phase
independently testable end-to-end on a physical device including its UI, designs
before code, commit after every task.

---

## 3. Scope

### In scope

Today's step count, a configurable daily goal, per-day history, an hourly chart
for any retained day, estimated distance, estimated calories, current streak,
best day, and body weight / height / stride in Settings.

### Out of scope

| | why |
|---|---|
| Health Connect | R§10–15. Device is Android 13, where Health Connect is a separately installable app with no data of its own. Deferred behind the S3 seam. |
| iOS / HealthKit (R§18–19) | The project is Android-only, permanently. |
| Floors, pace, cadence | The device exposes `step_counter` and `step_detector` and nothing else. There is no data to show. |
| Cloud sync of step data (R§23) | Follows the D-spec's Supabase timeline, not this feature's. |
| Smartwatch / multi-source dedup (R§14) | Requires Health Connect. Deferred with it. |
| A dedicated Steps tab | Considered and rejected. Revisit only if day-level integration proves insufficient in real use. |

---

## 4. Data Model

Migration **0005**. Three new tables' worth of storage: one file the native side
owns, and two SQLite tables.

### 4.1 The tape — native-owned

`filesDir/step_tape.jsonl`, append-only, one JSON object per line, guarded by a
process-level lock shared by the worker and the module.

```json
{"at":1756000800000,"counter":51204,"boot":1755900000000,"tz":330,"src":"worker"}
```

| field | meaning |
|---|---|
| `at` | wall-clock epoch milliseconds |
| `counter` | the cumulative `TYPE_STEP_COUNTER` value |
| `boot` | boot epoch identity, rounded to 10 s (§5.2) |
| `tz` | UTC offset in minutes at the moment of sampling (S13) |
| `src` | `worker` \| `boot` \| `foreground` |

JavaScript never opens this file; it reaches the tape only through the module's
`drain` and `truncate`. Kotlin never opens `onemorerep.db` (S4). At 48 samples a
day of roughly 80 bytes each the tape grows about 4 KB per day, and is truncated
on every app foreground.

### 4.2 `step_samples`

The drained tape, in the app database.

```ts
export const stepSamples = sqliteTable(
  'step_samples',
  {
    id: text('id').primaryKey(),
    recordedAt: integer('recorded_at').notNull(),
    counter: integer('counter').notNull(),
    bootEpoch: integer('boot_epoch').notNull(),
    tzOffset: integer('tz_offset').notNull(),
    source: text('source', {enum: ['worker', 'boot', 'foreground']}).notNull(),
  },
  table => [
    index('step_samples_recorded_at_idx').on(table.recordedAt),
    uniqueIndex('step_samples_recorded_at_unique').on(table.recordedAt),
  ],
);
```

The unique index on `recorded_at` is load-bearing. Draining is
`INSERT OR IGNORE`, so a crash between "read the tape" and "truncate the tape"
re-inserts the same rows harmlessly rather than double-counting.

A `text` primary key on a table that could have used a composite is deliberate,
for the same reason the D-spec gives for `settings`: every table in this app is
built sync-ready, and the Supabase port must be additive, never a migration of
key types.

**Retention: 730 days.** Roughly 5 MB. The cap exists so the table cannot grow
without limit on a phone owned for five years, not because the space matters.
A sample is never pruned before the day it belongs to has been rolled up.

### 4.3 `daily_steps`

```ts
export const dailySteps = sqliteTable(
  'daily_steps',
  {
    id: text('id').primaryKey(),
    date: integer('date').notNull(),
    steps: integer('steps').notNull(),
    quality: text('quality', {
      enum: ['exact', 'estimated', 'partial'],
    }).notNull(),
    source: text('source', {enum: ['sensor']}).notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  table => [uniqueIndex('daily_steps_date_unique').on(table.date)],
);
```

`date` is local midnight as epoch milliseconds — the identical encoding to
`workout_sessions.date` — so History joins steps onto the day timeline with no
conversion.

`quality`:

| value | meaning |
|---|---|
| `exact` | both midnights bounding this day were straddled by a sample gap ≤ 2 h |
| `estimated` | a longer gap crossed a midnight; the split is proportional guesswork |
| `partial` | today, still accumulating |
| *(no row)* | **unknown.** The app was not watching. Not zero. (S7) |

This table is a **cache, not a record** (S6). Nothing in it is load-bearing:
while the underlying samples survive, any day can be recomputed. A bug in the
midnight-splitting logic — exactly the kind of thing that ships with a bug — is
fixed by correcting the pure function, dropping the table, and rebuilding.

### 4.4 `settings` — five new columns

```ts
stepGoal:      integer('step_goal').notNull(),       // default 8000
stepsEnabled:  integer('steps_enabled').notNull(),   // default 1
bodyWeightKg:  real('body_weight_kg'),               // NULLABLE
heightCm:      real('height_cm'),                    // NULLABLE
strideMeters:  real('stride_meters'),                // NULLABLE
```

The three nullable columns are nullable on purpose: `NULL` means *not told*, and
is distinct from a value of zero (S7). Calories stay hidden while
`bodyWeightKg` is `NULL` rather than everyone silently receiving a default body.

Storage is canonical — kilograms, centimetres, metres — and display follows the
existing `unit` setting, so `lb` yields pounds and miles.

### 4.5 Indexes

| index | serves |
|---|---|
| `step_samples_recorded_at_idx` | the hourly chart's range scan, and the rollup |
| `step_samples_recorded_at_unique` | idempotent draining |
| `daily_steps_date_unique` | one row per day; the History join |

---

## 5. The Native Edge

Three Kotlin pieces, each as stupid as it can be made.

### 5.1 The TurboModule

```ts
// src/native/NativeStepCounter.ts — the codegen spec
export type Sample = {
  at: number;
  counter: number;
  boot: number;
  tz: number;
  src: string;
};

export interface Spec extends TurboModule {
  isSupported(): Promise<boolean>;
  hasPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;

  readNow(): Promise<Sample | null>;
  drain(): Promise<Sample[]>;
  truncate(upTo: number): Promise<void>;

  startSampling(): Promise<void>;
  stopSampling(): Promise<void>;
}
```

No state machine, no business logic, no persistence beyond the tape.

`readNow` registers a listener on `TYPE_STEP_COUNTER`, takes the first value,
unregisters, and resolves. **It resolves `null` after a 5-second timeout rather
than hanging** — a sensor that never reports is a real behaviour on inexpensive
hardware, and the UI must treat `null` as "not yet", never as zero.

`isSupported` returns `false` when
`SensorManager.getDefaultSensor(TYPE_STEP_COUNTER)` is `null`.

### 5.2 Boot identity

```kotlin
val bootEpoch = System.currentTimeMillis() - SystemClock.elapsedRealtime()
```

Two readings from the same boot agree to within a few milliseconds of clock
drift; readings from different boots differ by however long the phone was off.
The value is rounded to the nearest 10 seconds and that rounded value **is** the
epoch's identity.

This beats inferring a reboot from the counter decreasing (S8): a reboot
followed by 500 steps before the next sample presents as a plausible increase if
only values are compared. The counter-went-down check is retained as a second
signal, because some devices reset the counter without rebooting.

### 5.3 The worker

```kotlin
PeriodicWorkRequestBuilder<StepSampleWorker>(30, TimeUnit.MINUTES)
```

Reads the sensor, appends one line, exits. **No network or battery constraints**
— it must be permitted to run while the phone is idle, because that is when
midnight happens. WorkManager reschedules itself across reboots.

Enqueued with `ExistingPeriodicWorkPolicy.KEEP` under a fixed unique name, so
repeated `startSampling()` calls from app foregrounds do not reset the schedule.

### 5.4 The boot receiver

`RECEIVE_BOOT_COMPLETED` → append one sample immediately, `src: "boot"`. This
anchors the new epoch at a known instant rather than discovering it up to 30
minutes later.

### 5.5 Manifest

```xml
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-feature
    android:name="android.hardware.sensor.stepcounter"
    android:required="false" />
```

`required="false"` is essential: otherwise Play hides the entire app from every
phone without a pedometer, which is an absurd price for an optional feature in a
lifting app.

### 5.6 The device this was designed against

Verified by `adb` on 2026-08-23:

```
model     2201116SI          Android 13 (SDK 33)
sensor    0x010000bf  pedometer  android.sensor.step_counter(19)
                      Non-wakeup  perm: ACTIVITY_RECOGNITION
```

`Non-wakeup` is the desired variant: the sensor accumulates in hardware without
waking the CPU. Health Connect (`com.google.android.apps.healthdata`) and Google
Fit are both installed, but on SDK 33 Health Connect is a removable app with no
data of its own — which is the evidence behind S1.

---

## 6. Core Rules — attribution

`src/domain/stepAttribution.ts`, pure:

```ts
export type StepSample = {
  /** Wall-clock epoch milliseconds. */
  at: number;
  /** The cumulative TYPE_STEP_COUNTER value. */
  counter: number;
  /** Boot epoch identity, rounded to 10 s. */
  boot: number;
  /** UTC offset in minutes when this sample was taken. */
  tzOffset: number;
};

export type DayQuality = 'exact' | 'estimated' | 'partial';

export type AttributedDay = {
  /** Local midnight, epoch ms — same encoding as workout_sessions.date. */
  date: number;
  steps: number;
  quality: DayQuality;
};

attribute(samples: readonly StepSample[], now: number): AttributedDay[]
```

`now` is passed rather than read from the clock, for the same reason the D-spec's
day resolver takes a `today` in its context: a pure function with a hidden clock
cannot be tested against a fixture, and every case in §12.1 is a fixture.

### 6.1 Cut the samples into epochs

Samples are sorted ascending by `at`. A new epoch starts whenever either signal
fires:

- `boot` differs from the previous sample's `boot`
- `counter` is lower than the previous sample's `counter`

**Deltas are computed only within an epoch.** Across an epoch boundary nothing
is computed, because the numbers on either side measure different things.

### 6.2 Pair consecutive samples into deltas

Each consecutive pair `(a, b)` within an epoch yields `delta = b.counter -
a.counter` attributed to the interval `[a.at, b.at]`.

### 6.3 Split each interval at every local midnight it crosses

The interval is cut at each local midnight, and the delta divided among the
pieces **in proportion to their duration** (S9).

Pieces are reconciled by **largest remainder**, so they sum to exactly `delta`.
Naive rounding loses a step per boundary, which over a year is a visible
downward drift.

Local midnights are computed with the existing `startOfLocalDay` /
`addLocalDays` helpers, **never by arithmetic on 86,400,000** — a local day is
23 or 25 hours across a DST transition.

Each sample's own `tzOffset` governs its bucketing (S13). When an interval's two
samples carry different offsets, the earlier sample's offset is used and both
touched days are marked `estimated`.

### 6.4 Record the quality of each split

```
gap ≤ 2 h crossing a midnight   →  exact
gap  > 2 h crossing a midnight  →  estimated, for BOTH adjacent days
```

At 30-minute sampling, a healthy night's boundary is a 30-minute straddle at 3am
containing zero steps, so a normal day resolves `exact`. A day whose worker was
killed through midnight resolves `estimated`, and says so on screen.

### 6.5 Emit nothing where there is no evidence

A day covered by no interval produces **no row** (S7).

The day containing `now` is marked `partial`, and **`partial` takes precedence
over `estimated`** — a day still in progress is described by the fact that it is
unfinished, not by the quality of a boundary it has not reached yet. Its quality
is resolved to `exact` or `estimated` when a later sync recomputes it as a past
day.

### 6.6 The rollup is incremental

```
drain  →  which local days do the new samples touch?
       →  recompute only those days, plus always today
       →  upsert into daily_steps
```

Recomputing the whole retention window on every sync would be absurd at 730
days. Only touched days are recomputed — in practice, today and occasionally
yesterday.

---

## 7. Derived Numbers

`src/domain/stepDerived.ts`, pure.

### 7.1 Stride and distance

```ts
stride   = strideMeters ?? (heightCm != null ? (heightCm / 100) * 0.414 : 0.72)
distance = steps * stride            // metres
```

The stride is pre-filled from height and remains editable, because generic
stride formulas are wrong for plenty of people.

### 7.2 Calories

```ts
calories = weightKg == null ? null : 0.57 * weightKg * (distance / 1000)
```

Returns `null`, never `0`, when weight is unknown (S10). A `null` renders as
nothing at all.

Age and sex are deliberately not collected: they inform basal metabolic rate,
which is not something the user *did*, and this feature reports activity
expenditure only.

Both distance and calories are marked estimated wherever they appear.

### 7.3 Streak

Consecutive days at or over `stepGoal`, ending today or yesterday. **An unknown
day breaks the streak** — the app will not award a run that includes days it was
not watching. Today counts only once it is already over goal.

### 7.4 Best day

The maximum over a range, ignoring unknown days.

---

## 8. Application Layer

### 8.1 The wrapper

`src/native/stepCounter.ts` wraps the codegen spec and is the single place that
answers "is there a step counter here at all". It answers **no** rather than
throwing when the native module is absent, which is what allows the existing 535
tests to keep running under Jest without a mock in every file.

### 8.2 Sync

`useStepSync()` runs on app foreground (`AppState` → `active`) and on Today
focus:

```
drain()                 pull the tape out of the native module
readNow()               one live reading for this instant
INSERT OR IGNORE        into step_samples
truncate(upTo)          tell the module to drop what was taken
roll up                 the touched days into daily_steps
invalidate              the step queries
```

Every step is idempotent. A sync that dies halfway is resumed by the next
foreground with no double counting and no loss.

### 8.3 Queries

Following the D-spec's invalidation-on-write convention (D8), and its rule that
a mutation's `onSuccess` must **return or await** its invalidation promise.

| key | returns |
|---|---|
| `steps.today` | today's `AttributedDay` plus derived numbers |
| `steps.range(from, to)` | `daily_steps` rows for the History timeline |
| `steps.day(date)` | one day's samples, for the hourly chart |
| `steps.status` | supported / permitted / enabled / staleness |

---

## 9. Screens

No new tab, no new stack, no new navigator (S11).

### 9.1 Today

A steps card **below** the workout block, never above it. This is a lifting app
that also counts steps, and the ordering on the most-visited screen is the
clearest statement of that.

```
┌──────────────────────────────────┐
│  STEPS                           │
│                                  │
│  6,412        of 8,000           │
│  ██████████████░░░░░             │
│                                  │
│  Distance    4.6 km *            │
│  Calories    189 kcal *          │
│  Streak      6 days              │
│                                  │
│  * estimated                     │
└──────────────────────────────────┘
```

Progress bar in `gain` when over goal, `plate` while working toward it. **Never
`short`/ochre** — being under 8,000 steps is not a failure, and the Ledger
system reserves ochre for falling short of a commitment actually made (D13).

### 9.2 History

One line added to the `DayCard` meta row, so steps sit beside the workout:

```
SAT 22    Pull Day                       ✓ Complete
          5 exercises · 18 of 18 sets · 9,120 steps

FRI 21    Rest                                    —
          4,388 steps

THU 20    Push Day                       1 skipped
          5 exercises · 17 of 18 sets · 11,204 steps ~

                                         ~ estimated
```

A rest day currently renders nothing in that row; now it has something honest to
say, which is a small real improvement to an existing screen.

### 9.3 Calendar — deliberately unchanged

The calendar's one job is "did you train", read at a glance across a month.
Overlaying step intensity turns a two-state grid into a heatmap fighting a
status grid. Recorded as a departure, easy to add later.

### 9.4 Day detail — the hourly chart

`StepsChart` on the existing `DayDetailScreen`, working for **any** retained
day:

```
STEPS                             9,120

▁▁▁▁▁▂▅█▆▃▂▂▃▄▃▂▂▃▇█▅▃▂▁▁
00    06    12    18    24
```

This is also the best available diagnostic: a flat dead patch from 14:00 to
22:00 is MIUI having killed the worker, and it is visible instantly.

### 9.5 Settings — a "You" section

```
YOU
Weight            72 kg      ›
Height           175 cm      ›
Stride          0.72 m       ›    from your height
Daily step goal   8,000      ›

Step counting            [ on ]
    Counted by your phone's sensor. Your total
    won't match other apps exactly.
```

That last sentence is deliberate copy, not a placeholder. The user will compare
against MIUI's own counter on day one and find a discrepancy; the app should say
so rather than let an evening be spent hunting a bug that is not one.

---

## 10. States and Degradation

| state | behaviour |
|---|---|
| no step sensor (`isSupported() === false`) | nothing on Today or History. One line in Settings: this phone has no pedometer. |
| permission not granted | a card reading "Count your steps" with a button that requests it. |
| `stepsEnabled = 0` | nothing on Today or History; the Settings toggle is the way back. |
| worker stale (> 3 h since the newest sample, while enabled) | the card keeps its number and adds "last updated 6 hours ago". |
| `readNow()` returned `null` | treated as "not yet", never as zero. |
| permission revoked while installed | falls back to the not-granted state; existing history is retained. |

**The permission is requested on user action, never at launch** (S12).

### Error handling

Consistent with the D-spec §10: a failed sync is not fatal and not modal. The
last known numbers stay on screen, staleness is surfaced, and the next
foreground retries. Nothing about step tracking may ever block the app from
starting or a workout from being recorded.

---

## 11. Project Structure

```
src/native/
  NativeStepCounter.ts     codegen spec
  stepCounter.ts           safe wrapper; degrades to unsupported

src/domain/
  stepAttribution.ts       samples → days           (§6)
  stepDerived.ts           distance, calories, streak, best day  (§7)

src/repositories/
  stepsRepo.ts             drain · roll up · query

src/features/steps/
  useSteps.ts              queries + the sync mutation
  StepsCard.tsx            the Today card
  StepsChart.tsx           the hourly bars

android/app/src/main/java/com/onemorerep/steps/
  StepCounterModule.kt     the TurboModule
  StepTape.kt              the append-only file, and its lock
  StepSampleWorker.kt      the 30-minute worker
  BootReceiver.kt          the boot sample
```

---

## 12. Testing Strategy

```
device gate      4 walks, 1 overnight, 1 reboot      ← cannot be faked
screens (RNTL)   card states, permission states, History rows
repository       drizzle over better-sqlite3, as the D-spec already does
domain (pure)    ~40 tests
```

Per the D-spec, RNTL 14's `render` / `fireEvent` / `rerender` are async and must
be awaited.

### 12.1 Domain cases that must have tests

| case | expected |
|---|---|
| no samples, or one sample | `[]` — two are needed to make a delta |
| two samples, same day | one day, `exact` |
| 30-minute interval across midnight | two days, both `exact` |
| 5-hour interval across midnight | two days, both `estimated` |
| app dead three days | four days, all `estimated` |
| reboot mid-day | delta dropped; no phantom steps |
| counter drops within one boot | treated as a reset |
| `delta = 7` over three equal pieces | `3 + 2 + 2 = 7`; nothing lost |
| DST transition | a 23-hour and a 25-hour day, both correct |
| `tzOffset` changes between samples | earlier offset used; both days `estimated` |
| a day with no covering interval | no row emitted — **not** a zero row |
| today, reached by a 5-hour gap | `partial`, not `estimated` (§6.5 precedence) |
| `weightKg == null` | `calories === null`, not `0` |
| streak spanning an unknown day | the streak breaks |

### 12.2 The native fake

`__mocks__` provides a scripted `NativeStepCounter` returning sample arrays on
demand. This is what allows the sync mutation and every card state to be tested
end to end in Jest against a **real** database, with no device.

### 12.3 Device gates

Per the D-spec's standing rule, every gate runs against a **bundled APK**
(`--dev false`, `adb reverse --remove-all`), never Metro. Binary pulls use
`adb exec-out`, never `adb shell`.

---

## 13. Phases

Each phase ships something visible on a physical device.

### S1 — Foundation and today's number

Migration 0005. The **entire** `stepAttribution` domain with its full test suite
— it is pure, so building it in one go costs nothing extra and leaves S2 as
purely native work. TurboModule with `isSupported` / permission / `readNow`.
Foreground-only sampling. The Today card.

*Gate:* grant the permission, note the number, walk 100 steps, reopen — it went
up. Deny the permission — the card asks rather than breaking. Airplane mode —
unaffected, which demonstrates R§5 rather than asserting it.

### S2 — Background

The tape, the worker, the boot receiver, `drain` / `truncate`, the staleness
warning, and the History steps line.

*Gate:* **the first phase in this project that cannot be verified in one
sitting.** It needs a real overnight to prove a midnight boundary landed, plus a
deliberate mid-day reboot to prove no phantom steps appear.

### S3 — Body data and derived numbers

The Settings "You" section, distance, calories, streak, best day.

*Gate:* enter weight → calories appear. Clear it → they vanish rather than
becoming zero.

### S4 — The hourly chart

`StepsChart` on the day detail screen.

*Gate:* walk at a known hour; confirm the bar lands in that hour.

---

## 14. Risks

| risk | mitigation |
|---|---|
| **MIUI kills the worker.** The most likely failure. | The user grants Autostart and unrestricted battery; the app detects its own staleness and says so; and because the counter is cumulative, a killed worker costs *day attribution*, never the steps themselves. |
| **Steps lost across a reboot.** | Inherent to sensor-only tracking; bounded to ≤ 30 minutes of walking per reboot. Nothing recovers these. Health Connect would — the strongest argument for eventually adding it behind the S3 seam. |
| **Play Store review.** `ACTIVITY_RECOGNITION` is sensitive and needs a declaration at submission. | Known now rather than at release. |
| **Non-wakeup sensor latency.** | `readNow` resolves `null` after 5 s rather than hanging; the UI treats `null` as "not yet". |
| **The user's total will not match MIUI or Fit.** | Stated in Settings copy as expected behaviour, not hidden. |
| **A bug in midnight splitting corrupts history.** | `daily_steps` is derived (S6); fix the pure function, drop the table, rebuild from samples. |

---

## 15. Deferred

| item | why |
|---|---|
| Health Connect as a second `StepSource` | R§10–15. Revisit if reboot-window loss or missing pre-install history proves annoying in real use. |
| Step intensity on the calendar | §9.3. Would fight the existing status grid. |
| Steps on the weekly adherence card | Adherence is about training commitments; steps are not a commitment the plan made. |
| Cloud sync of step data | Follows the D-spec's Supabase timeline. |
| A dedicated Steps tab | Only if day-level integration proves insufficient. |
| Personalised stride from GPS | Requires location permission for a marginal gain over a height-derived stride. |

---

## 16. Success Criteria

1. Today's count is correct after the app has been closed for hours, with no
   background job having run — proving the R§7 premise on real hardware.
2. A midnight boundary lands correctly with the app never opened, across a real
   overnight.
3. A deliberate reboot produces no phantom steps and no negative deltas.
4. A day the app was not watching renders `—`, never `0`.
5. A day whose boundary was missed renders as estimated, and says so.
6. The whole feature is invisible — not broken — on a phone with no pedometer,
   with the permission denied, or with the switch off.
7. History for a past day can be rebuilt from `step_samples` after dropping
   `daily_steps`.
8. Nothing about step tracking can prevent the app from starting or a workout
   from being recorded.

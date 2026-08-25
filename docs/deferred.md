# Deferred work

Things deliberately not built yet, with the phase they belong to and why they
were deferred. This file exists because a deferral recorded only inside an old
plan is a deferral everyone forgets — the tab bar shipped without its icons for
exactly that reason.

**Rule:** when declaring a phase complete, re-read this file and restate
anything on it that the user will see. A deferral is only honest if it is
visible at the moment completion is claimed.

---

## Deferred verification

### ~~The fork is proven in tests but not yet on the device~~ — CLOSED
**Added:** 2026-08-23, at the Phase 2 gate. **Closed:** 2026-08-23, at the
Phase 4 gate, without needing the clock change it was waiting on.

Renaming Sunday while a session existed against the active version forked a
second plan version on the spot — no date change required, because
`canEditInPlace` refuses to edit in place once a workout has been performed
against a version. The device showed exactly two rows afterwards:

```
pv_mt5c5fln...  10:27:17 -> 16:00:38   (closed)
pv_mt5o24sd...  16:00:38 -> active
```

And the point of the fork held: the session still read "Push Day" while the
live plan read "Chest Day V2", and the day detail was byte-identical before and
after. Renaming back then compacted **in place** rather than forking a third
version, because no session belongs to the new one — the same rule, seen from
the other side.

### ~~Four workout paths were never walked on the device~~ — CLOSED
**Added:** 2026-08-23, at the Phase 3 gate. **Closed:** 2026-08-24, on a
Monday reached by moving the device clock forward one day.

All five gaps were walked, each checked against the device database:

1. **Skip a set** — `skipped` with both actuals still NULL. Spec 6.2's rule
   that status is the sole source of truth, holding on hardware.
2. **A bonus set** — `is_unplanned = 1` with NULL targets, labelled BONUS SET.
3. **An unplanned exercise** — `planned_exercise_id IS NULL`, badged "added".
4. **Force-kill and resume** — twice over, in fact: a force-stop and then a
   full APK reinstall mid-workout. Both came back "IN PROGRESS · 4 of 7 sets"
   at the right set, with nothing lost.
5. **The mixed verdict** — 10.0 kg x 8 against a 12 x 7.5 target read
   **"−10 kg vol" in ochre**. Volume overruled the heavier weight, which is
   the case the earlier gate never produced.

The finish summary then reported **83% of plan, 5 of 6 sets, 880 kg** — both
bonus sets excluded from the ratio and included in the volume, exactly as
spec 5.5 requires.

### ~~The Phase 4 device gate is walked except for two steps~~ — CLOSED
**Added:** 2026-08-23. **Mostly closed the same day.**

Walked on a Redmi 2201116SI against a **self-contained APK** (JS bundled with
`--dev false`, `adb reverse` removed), not against Metro — see the note below
about why that matters.

**Verified on hardware:**

- Timeline: adherence card at 100%, one day card, correct counts.
- Day detail: `1 MIN · 772.5 KG TOTAL VOLUME`, matching the domain functions
  exactly. Below-target rendered as **ochre `−1 rep`** with a true minus sign;
  the volume-decided verdict rendered as `+40 kg vol`.
- Exercise history: working weight 17.5, best set `17.5 × 12` (210 volume,
  correctly beating `10.0 × 14`), best volume 470 kg, session line right.
- **Calendar: seven cells per row.** The thing Jest structurally cannot see.
  Also correct: five greyed pad cells from July, Wednesday faint as a rest day,
  Mondays and Sundays dashed as training days still ahead, everything else
  plain. Month navigation works both directions (July, September checked).
- Tapping a non-workout date opens the day with the right words rather than an
  empty ledger.
- The invariant: editing the plan left the past day untouched — see the closed
  fork item above.
- `user_version` still 5, no orphans, no set carrying actuals without being
  completed, and `adb logcat` clean of errors.

**Still not walked, because both need a day that has no session yet** — one
session per date is a unique index, and today already has one:

1. **Live update after finishing a workout.** The plan-edit path was seen to
   refresh History without a restart; the session path was not.
2. The four Phase 3 workout paths below, which would also give the timeline and
   the calendar more than a single day to draw.

**Closed on 2026-08-24:** saving a workout and switching straight to History
without a restart showed the new day immediately, and the timeline now draws
two days — Monday with an ochre "1 skipped" chip, Sunday with "Complete".

## Design departures

### The workout screen has an "Add an exercise" control the design does not draw
**Added:** 2026-08-23, during Phase 3.

Design 09 shows Add set, Skip set, Next and Skip this exercise, and no way to
add an exercise mid-workout. Spec 6.5 and §21 both require one, and Phase 3's
gate explicitly asks for "an unplanned exercise", so it is built as a quiet
ghost button below the set controls.

It is deliberately understated because it is rare, and unplanned work is badged
rather than warned about (D3). If the design is ever revisited, this is the
control to place properly rather than the one to remove.

Affects: `src/features/workout/WorkoutScreen.tsx`.

### Finishing an exercise no longer pushes the summary screen
**Added:** 2026-08-24, during R2.

Spec 6.3 auto-advances when the last set of an exercise is recorded, and Phase
3 implemented that by pushing `ExerciseSummary` over the workout. With the
workout now a single list (U1), a forced screen push between exercises is a
wall to walk through rather than a place to go and look — and it fights the
whole point of being able to see the session at once.

The advance is kept: the next exercise with work left opens and the list
scrolls to it. `ExerciseSummaryScreen` stays in the stack and keeps its tests;
R3 puts it behind the exercise's own menu, so it is reached deliberately.

If this turns out to be wrong, the thing to restore is the push, not the
screen — the screen never went anywhere.

Affects: `src/features/workout/WorkoutScreen.tsx`.

### Four small additions the history designs do not draw
**Added:** 2026-08-23, during Phase 4.

1. **A calendar button in the History heading.** Design 12 draws no way to
   reach design 13. One `IconButton` in the timeline's app bar is the smallest
   honest addition.
2. **A previous-month button.** Design 13 draws only a next chevron. A month
   view you cannot go back in is not usable.
3. **"Bonus" rather than "unplanned" in the result column.** Design 14 writes
   "unplanned"; Phase 3's finish summary already ships "Bonus", from the shared
   `describeComparison`. Two words for one thing across two screens is worse
   than one deviation from one mock, so the shared function wins.
4. **A "View history" control on the exercise detail screen.** Design 19 does
   not draw one, but §24 says an exercise's history is reached by selecting the
   exercise, and the library is where you do that.

Affects: `src/features/history/`, `src/features/exercises/ExerciseDetailScreen.tsx`.

### The back control is invented — the design draws none
**Added:** 2026-08-23, during Phase 5.

The Phase 1 note said "the design's screen 19 is drawn with a back chevron".
It is not: screen 19's app-bar button is **create**. No figure in
`docs/design/screens.html` draws a back control at all.

So `BackButton` is designed rather than transcribed. It is deliberately
quieter than `IconButton` — no border, no plate, just a chevron in a 44px
target — because leaving a screen is not an action worth advertising. If the
design is ever revisited, this is a control to place properly rather than one
to remove.

Affects: `src/ui/BackButton.tsx`, and the twelve screens that use it.

## Observations from the Phase 4 device gate

### The debug APK cannot be trusted to be running your code
**Added:** 2026-08-23.

Half an hour was lost concluding a fix "did not work" when the device was in
fact running stale JS from a Metro instance that had been left running. The
symptom is indistinguishable from a real defect.

**Rule for every future gate:** bundle the JS into the APK and remove the
reverse tunnel, so what is on the phone is what is in the repository:

```bash
npx react-native bundle --platform android --dev false --entry-file index.js   --bundle-output android/app/src/main/assets/index.android.bundle   --assets-dest android/app/src/main/res
cd android && ./gradlew assembleDebug
adb reverse --remove-all && adb install -r app/build/outputs/apk/debug/app-debug.apk
```

This also removes the dev-warning toast, which sits over the tab bar and
silently swallows taps — worth knowing when driving the UI with `adb`.

### Wednesday's plan day carries the custom name "Tr"
**Added:** 2026-08-23, seen in the device database.

`plan_days.custom_name` is `'Tr'` on the rest day. `setRestDay` clears a day's
exercises but deliberately does not clear its name, so a half-typed name
survives being turned into a rest day. Nothing renders it today — every screen
special-cases rest days — so this is cosmetic, and it is flagged rather than
changed because it may well be intentional.

### ~~The Today tab warns about nested screens with the same name~~ — CLOSED
**Added:** 2026-08-23, from `adb logcat`. **Closed:** 2026-08-23, in Phase 5.

The inner screen is now `TodayHome`; the tab keeps the name the user sees.
Nothing navigated to it by name — only `popToTop()` — so the rename touched
two files. Confirmed gone from logcat on the bundled build.

### ~~Resume lands on the first exercise, not the first pending set~~ — CLOSED
### ~~The exercise summary's "Next" button does not advance~~ — CLOSED
### ~~An all-bonus exercise reads "0 of 0 sets recorded"~~ — CLOSED
**Added:** 2026-08-24, at the Phase 3 re-gate. **Closed:** 2026-08-24.

The first two had one cause: the workout screen's exercise index was local
state starting at zero and never re-synced. Gaining focus now realigns to the
first exercise with a pending set, and the alignment is retried once the
session arrives, because on a cold open the query has not resolved when focus
fires. It runs once per focus, so recording a set never moves the screen out
from under someone still working on that exercise — asserted directly, and
both tests were checked by disabling the alignment and watching them fail.

The third was copy: an exercise added on the day has nothing planned, so
"0 of 0 sets recorded · 1 bonus" was accurate and read like a bug. It now says
"1 bonus set".

**Not re-verified on the device.** All three live on the workout screen, which
needs an in-progress session, and both dates on this device already have a
finished one. Closing them would mean another clock change.

## Deferred verification — Phase 5

### Two Phase 5 gate steps were not walked
**Added:** 2026-08-23, at the Phase 5 gate.

**Walked:** the back control on both kinds of screen; the nested-screen-name
warning is gone from logcat; the calendar still lays out seven cells per row
after the chrome change.

**Not walked, and why:**

1. ~~**"A set recorded in under a second."**~~ **Closed 2026-08-24.** Tap to
   the next set becoming active, including roughly 280ms of `adb` dispatch
   latency that a finger does not pay, was comfortably inside a second.
2. ~~**Every empty state, on the device.**~~ **CLOSED 2026-08-24**, at the R1
   gate. The blocker was that reaching them needed a database with no plan, and
   the only way there was `adb shell pm clear com.onemorerep`, which would have
   destroyed real training data. It resolved itself: the app was uninstalled
   and reinstalled, so the R1 build opened on a genuinely empty database and
   all four §40 states were simply *there*.

   Walked, in this order, on a Redmi 2201116SI against a bundled APK:

   - **Today** — "No plan yet / Build a weekly routine on the Plan tab, and
     today's workout will appear here."
   - **Plan** — "Your week is empty", with the seven dashed day placeholders
     above it and Create plan below.
   - **History** — the adherence card reading `— / 0 OF 0 WORKOUTS / 0 OF 0
     SETS`, over "Your completed workouts will appear here."
   - **Exercise history** — "Complete this exercise to start building your
     history."

   The lesson worth keeping: this sat open for a month because closing it
   looked like it required a destructive command. It did not — it required
   waiting for a reinstall. When a deferral is blocked on something dangerous,
   the question to ask is what *else* produces the same state.
3. **TalkBack.** The accessibility work is asserted in tests — roles, names,
   states, and 44px targets — but nobody has actually listened to the app.
   Turning TalkBack on changes every gesture, so it is a hands-on pass rather
   than something to drive over `adb`.

## The R1 gate — settings, theme, typing numbers

**Added:** 2026-08-24, at the R1 gate of the usability-fixes plan
(`docs/superpowers/plans/2026-08-24-usability-fixes.md`).

Walked against a bundled APK on a Redmi 2201116SI, JS built with `--dev false`
and `adb reverse --remove-all`, on a database left empty by the reinstall.

**Verified on hardware:**

- Migration 0005 applied: `user_version` 6, `settings.theme_mode` present.
- A fresh install writes its settings row at `default_increment = 0.5` and
  `theme_mode = 'system'` — the new defaults reach a real first launch, not
  just Jest.
- **Dark** and **Light** each write to the database and repaint on the tap, not
  on the next launch. The choice survives a force-stop: the app opens **light
  while the phone itself is dark**, which is the whole point of the override.
- **System** follows the phone's own light/dark setting — checked by the user
  changing it, since driving another app's system settings is not something to
  do on somebody's behalf.
- Weight step: the **+** moves 0.0 → 0.5, the new default.
- Typing, in both places it matters. `62.5` typed into a plan target landed in
  `planned_sets` on all three sets; `57.5` typed during a workout landed as
  `actual_weight` on set 1 with sets 2 and 3 still `pending` and both actuals
  NULL — spec 6.2 holding under a keyboard.
- The counts print as `3` and `10`, not `3.0` and `10.0`.

**Two real bugs, found only because this ran on hardware:**

1. **Plan edits never refreshed the Today tab** — fixed in `9e23d2a`. Creating
   a plan and adding an exercise left Today saying "No plan yet" until the app
   was restarted. `useTodayPlanQuery` lives under the `session` cache key with
   `staleTime: Infinity`, and the plan mutations invalidated `plan` and
   `history` only. This is half of complaint 4, and it fires before a workout
   has even been started — so complaint 4 was never purely the §39 invariant.
2. **`NumberField` renormalised its own draft mid-word** — fixed in `5ec7415`'s
   follow-up. A controlled parent feeds every keystroke back, so `5` returned
   as `5.0` and the next character appended to *that*. On the phone it turned
   `57.5` into `7.5`. The unit test missed it because its parent was a
   `jest.fn()` that never echoed the value back; the test that catches it now
   uses a real `useState` parent **and** appends each character to whatever the
   field is actually showing, rather than dictating the whole string.

**Honest caveats, not swept up:**

- **The launch frame is still dark.** At ~1.2s after a cold start the screen is
  Android's own `windowBackground` from the native theme, before React renders
  at all. Hydrating the theme inside `DatabaseGate` removes the *React* flash —
  the app never paints one palette and corrects to the other — but it cannot
  touch the native splash. Making that follow the chosen theme means writing it
  from native on launch, which is a separate piece of work and was not done.
- **`adb shell input text` is not a thumb.** It outruns the JS bridge and drops
  characters into a controlled `TextInput`; at 350–400ms spacing every
  character landed. Two apparent "bugs" during this gate were that artifact.
  The keyboard also reflows the screen between a `uiautomator dump` and a tap,
  which silently lands the tap on whatever moved into that spot — it cost a
  wrong "Save target" press that hit *Decrease Sets* instead. **Rule for future
  gates: dismiss the keyboard, re-dump, then tap — and never trust a dump taken
  before the keyboard state changed.**

## R2–R6 are written but only half walked

**Added:** 2026-08-26, at the end of the usability-fixes plan.

Everything in `docs/superpowers/plans/2026-08-24-usability-fixes.md` is
implemented, 681 tests pass, and the whole thing is installed on the device.
What follows is the honest split between what a thumb has actually touched and
what has only been asserted in Jest.

**Walked on the device:**

- R1 in full — see the R1 gate above.
- R2's list layout, by the user: all exercises visible at once, tapping a
  header opens one and closes the others, recording a set does not move the
  open card. This is also where U10 and U11 were reported.
- The app launches with both R6 native libraries loaded. `SoLoader` initialises,
  `ReactNativeJS: Running "OneMoreRep"`, no FATAL and no AndroidRuntime entry
  in logcat. That rules out the failure mode that would have mattered most:
  a native module bringing the app down on startup.

**Not walked, and each is a real gap:**

1. **R3 — reopening a decided set (U10), Finish vs Skip (U11), the `⋯` menu,
   swap, remove, reorder, and notes.** The largest untested surface. The
   repository rules are covered by 25 tests, but nothing has proved the sheet
   opens over a scrolling list on a real screen, or that the note field
   survives the keyboard the way `PlanDayScreen`'s rename did not.
2. **R4 — creating a custom exercise from either picker.** Specifically: that
   back from the editor returns to the *picker* rather than the Exercises tab,
   which is the whole reason the screen is registered in three stacks. Jest
   renders one screen at a time and cannot see it.
3. **R5 — Today's inline summary**, and the cross-tab jump to History.
   `getParent()` is mocked in the tests; on the device it is a real tab
   navigator.
4. **R6 — the image itself.** Every part that matters is mocked in Jest:
   `captureRef` returns a fixed path and `CameraRoll.save` returns a fixed
   URI. Nothing has produced an actual PNG, or checked it is legible, or
   confirmed it lands in the gallery. The one-shot capture — mount, wait for
   `onLayout`, rasterise, unmount — is exactly the kind of timing that works in
   a test renderer and fails on hardware.

**Why this is written down rather than assumed fine:** the R1 gate found two
bugs that ~600 tests had missed — `NumberField` renormalising its own draft
mid-word, and the Today tab never refreshing after a plan edit. Neither was
visible from Jest. The same is likely true of something above.

## Design departures — R6

### The day image ignores the theme

**Added:** 2026-08-26.

`DayImageCard` always renders the light palette, and is the only place in the
app that reaches past `useTheme` to `palettes.light` directly.

The image leaves the app. A dark PNG dropped onto somebody else's white chat
background reads as a bug rather than as a style, and the person receiving it
has no idea the sender's app was in dark mode. If this is ever revisited, the
thing to add is a choice, not a switch to following the theme.

Affects: `src/features/history/DayImageCard.tsx`.

### Skipped sets are left out of the image

**Added:** 2026-08-26.

Inside the app a skipped set is load-bearing: it is the difference between a
workout done and a workout claimed, and §21 exists to keep it visible. In an
image you send to a friend it is noise, and an exercise with nothing recorded
on it drops out of the picture entirely.

This is a deliberate divergence between what history says and what the picture
says, and it is only defensible because the picture is not a record — the
ledger behind it still holds every skip.

Affects: `src/features/history/DayImageCard.tsx`.

## Phase 5 — Polish

### ~~No visible back control on pushed screens~~ — CLOSED
**Added:** 2026-08-22, at the Phase 1 gate. **Closed:** 2026-08-23, in Phase 5.

Twelve pushed screens gained a chevron; `WorkoutScreen` and
`WorkoutCompleteScreen` deliberately did not, and the test records why. A
structural test fails when a screen is added to a stack without being
classified either way, so the decision cannot be skipped in future.

Verified on device on both kinds of screen — the raw `ScrollView` ones and the
`Screen`-based ones — as visible, thumb-reachable, and returning to the right
place.

### Secondary muscles are not editable on custom exercises
**Added:** 2026-08-22, written into the Phase 1 plan's self-review.

Screen 19 shows an "Also works" chip row. Making it multi-select adds state for
a field the MVP never reads. Seeded exercises keep their secondary muscles;
custom ones start empty and stay that way.

Affects: `src/features/exercises/ExerciseEditorScreen.tsx`.

### Exercise images
**Added:** Phase 0, per §41.

~1,600 photos would dominate APK size. Out of scope by the spec, not an
oversight.

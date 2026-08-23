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

### Resume lands on the first exercise, not the first pending set
**Added:** 2026-08-24, at the Phase 3 re-gate.

Spec 6.4 says an in-progress session resumes "at the first pending set". The
Today screen gets this right — it said "Barbell Incline Bench Press · SET 2 OF
3" — but tapping **Continue workout** opens the workout screen on exercise 1,
which was already finished, so you have to tap "Next" to get where you were.

Cosmetic today, because both exercises are one tap apart. On a six-exercise
day it would be four.

Affects: `src/features/workout/WorkoutScreen.tsx`.

### The exercise summary's "Next" button does not advance
**Added:** 2026-08-24.

"Next — Ab Crunch Machine" on the exercise summary returns to the workout
screen still showing the finished exercise, where the same label has to be
tapped again. The button names the destination it does not go to.

Affects: `src/features/workout/ExerciseSummaryScreen.tsx`.

### An all-bonus exercise reads "0 of 0 sets recorded · 1 bonus"
**Added:** 2026-08-24.

Accurate — nothing was planned and one bonus set was done — but "0 of 0" is an
odd thing to read. When `plannedSets` is zero the line could simply say
"1 bonus set".

Affects: `src/features/workout/ExerciseSummaryScreen.tsx`.

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
2. **Every empty state, on the device.** All four §40 states are asserted in
   `__tests__/features/emptyStates.test.tsx`, but reaching the no-plan ones on
   hardware needs a database with no plan — i.e. `adb shell pm clear
   com.onemorerep`, which would destroy the real data on the device. Not done,
   and not to be done without the user asking for it.
3. **TalkBack.** The accessibility work is asserted in tests — roles, names,
   states, and 44px targets — but nobody has actually listened to the app.
   Turning TalkBack on changes every gesture, so it is a hands-on pass rather
   than something to drive over `adb`.

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

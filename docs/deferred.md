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

### Four workout paths were never walked on the device
**Added:** 2026-08-23, at the Phase 3 gate. **Deferred by the user's explicit
decision.**

The gate session went start — record all six sets — finish — save, cleanly. All
four critical invariants were verified against the device database: no set
carries actuals without being completed, every planned set kept its target
snapshot, no orphans, `user_version` 5. The recorded verdicts matched the
domain functions exactly (2 achieved / 3 exceeded / 1 below, 772.5 kg, 100%).

**What that session did not touch:**

1. **Skipping a set or an exercise.** Every set came back `completed`, so the
   skip path has only ever run under Jest. This is the one where a silent bug
   corrupts history rather than just looking wrong — a skipped set counts
   towards the denominator of adherence and nothing else.
2. **A bonus set.** `is_unplanned` is 0 on every row.
3. **An unplanned exercise.** `planned_exercise_id` is set on both exercises,
   so Task 13's feature is entirely unverified on hardware.
4. **Force-kill and resume (§20).** The session ran start to finish in one go,
   so crash safety was never tested where it actually matters.

Separately, the **genuinely mixed verdict** — one dimension up, the other down —
did not occur. Both volume-decided sets went up on both dimensions. The volume
code path ran; the case where volume has to *overrule an apparent improvement*
did not.

**How to close it:** one short session. Skip a set, add a bonus set, add an
exercise, force-kill mid-workout and resume, and on one set go heavier with
fewer reps (e.g. target 12 x 10, do 8 x 12.5 — volume 100 against 120, so it
must read below in ochre despite the heavier weight).

Affects: `src/repositories/sessionRepo.ts`, `src/features/workout/`.

### The Phase 4 device gate is walked except for two steps
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

**How to close:** move the device date forward one day, then work through the
next item. Settings — Additional settings — Date & time — turn off "Set time
automatically".

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

## Deferred verification — Phase 5

### Three Phase 5 gate steps were not walked
**Added:** 2026-08-23, at the Phase 5 gate.

**Walked:** the back control on both kinds of screen; the nested-screen-name
warning is gone from logcat; the calendar still lays out seven cells per row
after the chrome change.

**Not walked, and why:**

1. **"A set recorded in under a second."** The spec's performance gate needs an
   in-progress workout, and the only session on the device is finished. One
   session per date is a unique index, so this is blocked on the same date
   change as the workout paths above. Record a set and time the gap between the
   tap and the next set appearing.
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

# Focus Workout Flow — Implementation Plan

**Approved design:** Option C, drawn in full at
<https://claude.ai/code/artifact/de73ed33-ec8f-4cb4-913d-6f1c3b7ff964>
(audit: `.../34c155f0`, alternatives: `.../e9389770`).

**Goal:** replace the vertical expanding-card workout screen with a full-screen
focus flow — one set at a time, a grouped session rail, a pinned action bar —
and make a workout editable after it has been saved.

**Also in scope:** the Today screen is renamed **Workout** throughout, as asked.

**Branch:** `focus-workout-flow`. Commit after every task.

---

## Naming

`Workout` is currently the route of the active-session screen, and the tab is
`Today`. Both cannot be called Workout, so:

| Was | Becomes | Why |
| --- | --- | --- |
| Tab `Today` | Tab `Workout` | what the user asked for |
| Route `TodayHome` | `WorkoutHome` | the tab's landing screen |
| `TodayScreen.tsx` | `WorkoutHomeScreen.tsx` | file follows the route |
| Route `Workout` | `Session` | the thing you are *inside* |
| `WorkoutScreen.tsx` | `SessionScreen.tsx` | rewritten, not moved |
| `TodayStack` | `WorkoutStack` | follows the tab |

`useTodaySessionQuery` and the `session` query keys keep their names — they are
about the *data*, which has not changed.

---

## Measurements that drive the layout

All dp, on the 1080 × 2400 / 2.75 device = **393 × 873 dp**.

- session rail tick: 4 dp (live 6 dp), group gap 9 dp
- focus numeral: 120 px, weighted-set stepper 40 dp, rep stepper 64 dp
- record button 76 dp, skip 96 × 76 dp
- ledger row 44 dp, exercise line 32 dp
- undo window: 4 s

---

## Phase 0 — Rename and branch scaffolding

### Task 0.1 — Rename Today to Workout
- `src/navigation/types.ts`: `RootTabParamList.Today` → `Workout`;
  `TodayStackParamList` → `WorkoutStackParamList` (keep `TodayStackParamList`
  as a deprecated alias so history/plan screens compile untouched);
  `TodayHome` → `WorkoutHome`; `Workout` → `Session`.
- `src/navigation/TodayStack.tsx` → `WorkoutStack.tsx`, component renamed.
- `src/navigation/RootNavigator.tsx`: `<Tab.Screen name="Workout" …>`.
- `src/ui/TabIcon.tsx`: `PATHS.Today` → `PATHS.Workout` (same glyph).
- `src/features/workout/TodayScreen.tsx` → `WorkoutHomeScreen.tsx`.
- Every `navigate('TodayHome')` / `navigate('Workout')` call site updated.
- Tests renamed and updated in step.

**Verify:** `npx tsc --noEmit`, full Jest run green, app boots on device with
the tab reading “Workout”.

---

## Phase 1 — The shared ledger (common to every option)

These are the components the audit found are shared by all three candidate
flows. Nothing here is a bet on Option C.

### Task 1.1 — `SetLine`
`src/ui/SetLine.tsx`. 44 dp. Index, value, ghosted target, verdict dot, and a
2 dp status edge. States: `ok | under | skipped | pending | live | amending`.
Optional `onPress`. Weight shown as `12 · 20 kg` when the exercise takes one.

### Task 1.2 — `ExerciseLine`
`src/ui/ExerciseLine.tsx`. 32 dp. Name, `done / total`, optional `⋯`.

### Task 1.3 — `SessionLedger`
`src/features/workout/SessionLedger.tsx`. Maps a `Session` to lines. Used by
the peek, by Workout-after-save, and by the day detail. `onSelectSet` optional.

**Verify:** unit tests per component; snapshot of a real session's line heights.

---

## Phase 2 — The focus screen

### Task 2.1 — `SetRail`
`src/features/workout/SetRail.tsx`. One tick per set, grouped by exercise with
a 9 dp gap. Verdict colours. Live tick taller. Tap a tick to jump.

### Task 2.2 — `SessionScreen` shell
`src/features/workout/SessionScreen.tsx`. Header (✕, title, ⋯), rail, focus
body, swipe hints, action bar. Holds `focusIndex` over a flattened list of
every set in the session. No horizontal gesture yet — buttons first.

### Task 2.3 — `FocusSet` body
`src/features/workout/FocusSet.tsx`. Eyebrow, exercise name, weight stepper
(only when `weightApplicable`), 120 px rep numeral, target + last-time line,
− / + at 64 dp. Reads and writes `useActiveSet`.

**Verify:** on device — start a workout, see set 1 of exercise 1, step reps.

---

## Phase 3 — Record, advance, undo, skip

### Task 3.1 — `restoreSet` in the repository
`src/repositories/sessionRepo.ts`. Takes a snapshot `{status, actualReps,
actualWeight, completedAt}` and writes it back, then refreshes exercise
status. This is what Undo restores — the flow records into a screen that then
leaves, so an un-reversible tap is not acceptable here.

### Task 3.2 — Record and advance
Complete the set, advance `focusIndex` to the next pending set (wrapping to the
next exercise), show the confirmation banner.

### Task 3.3 — Undo banner
4 s window, `restoreSet` on tap, focus returns to the set it came from.

### Task 3.4 — Skip in place
Skip turns the body grey with “not counted against you”, the primary button
becomes “Go to set n”, and Undo skip is offered at full size.

**Verify:** device — record, undo, skip, undo skip; check the rail after each.

---

## Phase 4 — Peek, actions, amend

### Task 4.1 — `SessionPeek`
Bottom sheet over the focus screen, `SessionLedger` inside, tap a row to jump.
Swipe up to open, scrim/drag-down to close. Not a navigation push.

### Task 4.2 — Exercise actions sheet
Reuse `ui/ActionSheet`. Add a set, finish this exercise, swap, note, remove.
Wired to the hooks that already exist in `useSessionEditing`.

### Task 4.3 — Amend mode
Landing on a decided set switches the screen to ochre: numeral in `short`,
“recorded as n” in the caption, primary button “Save change”, secondary
“Cancel”. Saving returns focus to the live set.

**Verify:** device — peek, jump, amend a set two exercises back, cancel.

---

## Phase 5 — Finishing

### Task 5.1 — `FinishSheet`
Replaces `WorkoutCompleteScreen`. “That was the last set.”, counts, volume,
elapsed, the unrecorded-sets warning, `Save workout` / `Go back in`. Opens
automatically after the last set, or from `⋯ → Finish`.

### Task 5.2 — Delete the finish screen and the exercise summary
Remove `WorkoutCompleteScreen.tsx`, `ExerciseSummaryScreen.tsx` and their
routes. Keep `SessionSummary` — it moves to the finished day.

**Verify:** device — finish a workout with unrecorded sets; check the warning
is honest and the day lands right.

---

## Phase 6 — Editing after it is saved

The repository already permits this: `completeSet` overwrites regardless of
session status. Only the UI declined to offer it.

### Task 6.1 — Amend from a finished day
`SetLine.onPress` on Workout-after-save and on `DayDetailScreen` opens an
amend sheet over the current screen. The session stays `completed` — no
reopening, so adherence, the calendar and the resolver are untouched.

### Task 6.2 — `Edit workout` / `Edit this day`
Secondary 44 dp button. Reopens the focus screen at the first unrecorded or
skipped set for the bigger jobs.

**Verify:** save a workout, correct a set from Workout and from the calendar,
confirm the day's adherence figure moves with it.

---

## Phase 7 — Cleanup and the device walk

### Task 7.1 — Hide the tab bar during a session
`SessionScreen` sets `tabBarStyle: {display: 'none'}` on focus.

### Task 7.2 — Delete what the flow replaced
`WorkoutExerciseCard.tsx`, `SetRow.tsx`, `ExerciseCloser`, and their tests.

### Task 7.3 — Migration-safety and regression run
Full Jest run, `npm run db:backup` first, then a real session on the phone
start → save → correct.

---

## Constraints carried in from the project

- React Native CLI, Android only. No Expo, no iOS, no web.
- Local SQLite is the source of truth.
- **No schema migration is required by this plan.** If one becomes necessary it
  must be additive, and `__tests__/db/migrationSafety.test.ts` must still pass.
- `adb shell pm clear` is never run. Back up before touching the device.
- Nothing outside `src/theme/tokens.ts` declares a colour or a font size.
- Commit after every task.

---

## Regression checklist — carried over from the old workout screen

`SessionScreen.legacy.test.tsx` covered 34 behaviours of the expanding-card
screen. The screen is gone but almost none of the *behaviours* are: they have
to reappear through the focus flow's controls. The legacy file is kept, failing
and skipped, purely as this checklist, and is deleted in Task 7.2 once every
line below is ticked.

| Behaviour | Restored in |
| --- | --- |
| opens on the first exercise with its progress | 2.2 ✅ |
| pre-fills the active set with the target | 2.3 ✅ |
| records nothing until the set is completed | 2.3 ✅ |
| steps weight by the increment, reps by one | 2.3 ✅ |
| will not step reps below one or weight below zero | 2.3 ✅ |
| shows what was lifted last time | 2.3 ✅ |
| opens on the first exercise that still has a pending set | 2.2 ✅ |
| realigns when the screen is focused again | 2.2 ✅ |
| leaves the workout when closed | 2.2 ✅ |
| writes the actuals when the set is completed | 3.2 ✅ |
| advances to the next set once one is recorded | 3.2 ✅ |
| shows a recorded set with its verdict | 4.1 ✅ |
| does not move focus out from under a recorded set | 3.2 ✅ |
| skips a set without recording anything | 3.4 ✅ |
| reopens a skipped set when it is tapped | 3.4 ✅ |
| adds a bonus set with no target | 4.2 ✅ |
| removes a bonus set added by mistake | 4.2 ✅ |
| offers no way to remove a planned set | 4.2 ✅ |
| skips the whole exercise and moves on | 4.2 ✅ |
| offers to finish rather than skip once something is recorded | 4.2 ✅ |
| finishing a part-done exercise records it as completed | 4.2 ✅ |
| opens the next exercise when one is finished | 4.2 ✅ |
| opens the menu for the exercise whose control was pressed | 4.2 ✅ |
| reorders the session from the menu | 4.2 ✅ |
| writes a note to the database when the field is left | 4.2 ✅ — a sheet with Save |
| sends a swap to the picker rather than doing it blind | 4.2 ✅ |
| shows every exercise in the session at once | 4.1 ✅ |
| opens a different exercise when its header is tapped | 4.1 ✅ |
| closes the open card when its own header is tapped | dropped — nothing expands |
| reopens a recorded set so a wrong number can be corrected | 4.3 ✅ |
| goes back to the first pending set once the correction is saved | 4.3 ✅ |
| offers no edit on a set that has not happened yet | n/a — every set is reachable now |
| stops offering to finish once there is nothing left | 5.1 ✅ — the sheet arrives on its own |

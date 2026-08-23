# Deferred work

Things deliberately not built yet, with the phase they belong to and why they
were deferred. This file exists because a deferral recorded only inside an old
plan is a deferral everyone forgets — the tab bar shipped without its icons for
exactly that reason.

**Rule:** when declaring a phase complete, re-read this file and restate
anything on it that the user will see. A deferral is only honest if it is
visible at the moment completion is claimed.

---

## Unresolved observations

### A single test has failed twice, unreproducibly
**Added:** 2026-08-23, during Phase 2 Tasks 7 and 9.

Twice, `npm test` reported `1 failed, N passed` on the first full run
immediately after a batch of new files was written. Both times the very next
run was clean, and the failing test's name was not captured before it
vanished.

Investigated and **not** explained: 22 consecutive full runs pass, including
three with `--clearCache` (12s cold vs 5s warm, so it is not cold-transform
timing), and five runs of the suite that had just been touched. No hypothesis
survives the evidence.

**What to do:** always redirect `npm test` output to a file so the next
occurrence captures the test name — `npx jest --forceExit > run.txt 2>&1`.
Do not treat this as resolved until a failure is captured and explained, or
until the phase gate passes without recurrence.

Affects: unknown.

## Phase 3 — Today & Workout

### `canEditInPlace` is always told there are zero sessions
**Added:** 2026-08-23, during Phase 2.

`planRepo.savePlanDraft` passes `sessionCount: 0` to `canEditInPlace`, because
`workout_sessions` does not exist yet. The domain rule handles a non-zero count
correctly and is tested for it — only the query is missing.

**Phase 3 must replace that literal** with a count of sessions referencing the
active version. Until it does, editing the plan later on a day you have already
trained rewrites that version in place instead of forking, and the workout you
already did will appear to have been performed against the new targets. That is
exactly the corruption section 32 forbids.

Affects: `src/repositories/planRepo.ts`.

## Phase 5 — Polish

### No visible back control on pushed screens
**Added:** 2026-08-22, during the Phase 1 device gate.

`ExerciseDetailScreen` and `ExerciseEditorScreen` are pushed onto
`ExercisesStack`, which sets `headerShown: false`. Android's system back and
back-gesture both work, so nothing is broken — but a screen you enter and must
leave should say how, and the design's screen 19 is drawn with a back chevron.

Deferred by the user's explicit decision. Needs a header treatment rather than
a one-line fix, which is why it belongs with the rest of the chrome work.

Affects: `src/navigation/ExercisesStack.tsx`, and every stack added in later
phases — Phase 2's plan editor and Phase 3's workout screens will inherit the
same gap unless this is fixed first.

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

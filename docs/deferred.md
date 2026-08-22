# Deferred work

Things deliberately not built yet, with the phase they belong to and why they
were deferred. This file exists because a deferral recorded only inside an old
plan is a deferral everyone forgets — the tab bar shipped without its icons for
exactly that reason.

**Rule:** when declaring a phase complete, re-read this file and restate
anything on it that the user will see. A deferral is only honest if it is
visible at the moment completion is claimed.

---

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

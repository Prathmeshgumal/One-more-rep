# Decisions

Every judgement call made while rebuilding the workout flow, with the reason
and — where one exists — the evidence that forced it. Newest phase last.

The plan is `superpowers/plans/2026-08-30-focus-workout-flow.md`. The designs
are the three artifacts linked at the top of it. This file is the *why*; the
plan is the *what*.

A decision recorded here is not permanent. It is a note of what was known when
it was made, so that reversing it later is an informed act rather than a
rediscovery.

---

## D1 · Option C, the focus flow, was chosen — but the shared half was built first

**Decided:** the workout becomes one set at a time, full screen.

**Why:** the user picked it after seeing all four options drawn to scale. My own
recommendation was B (horizontal set tiles); the 112px numeral is the argument
that beat it, and legibility from a bench at arm's length is a real advantage no
density analysis answers.

**The hedge that made it safe:** screens 01, 06, 08, 09 and 10 of the design are
the *same components* in all three candidate flows — the ledger row, the
exercise sheet, the finish sheet, the amend state. Phase 1 built those first, so
the first third of the work was not a bet. If C turns out wrong in the gym, B is
a container swap over the same parts, not a rewrite.

---

## D2 · `Today` became `Workout`, which forced `Workout` to become `Session`

**Decided:** tab `Workout`, landing screen `WorkoutHome`, active session
`Session`.

**Why:** the user asked for the tab to be called Workout. The active-session
route was *already* called `Workout`, and two things cannot share a name in one
navigator — `navigate('Workout')` would have been ambiguous between the tab and
the screen inside it.

**Not renamed:** `useTodaySessionQuery`, the `session` query keys,
`getSessionForDate`. Those are about today's *date*, which has not changed. A
rename there would have been churn dressed as consistency.

---

## D3 · The set row is 44dp, not the 56px I first published

**Decided:** `SET_LINE_HEIGHT = 44`.

**Why:** the audit artifact quoted 56 **px**, which at this device's 2.75
density is 20dp — well under a touchable target. Corrected to 44dp (121 device
px), the standard minimum, and the audit was republished with the diagram
redrawn.

**The case survived the correction comfortably:** one exercise with five sets is
591dp today against a 720dp viewport; the whole eleven-set session redrawn is
624dp. The space that currently holds five sets of one exercise now holds the
whole day.

---

## D4 · `toneForSet` keeps *pending* and *skipped* apart

**Decided:** a new function rather than reusing `compareSet` directly.

**Why:** `compareSet` collapses both into `'skipped'`. That is correct for
arithmetic — neither contributes actuals — and wrong for a ledger, where one is
a set you have not reached and the other is a decision you made. A row that
reads "skipped" for a set you simply have not got to yet is a lie.

---

## D5 · The tally counts every set on both sides

**Decided:** `done / exercise.sets.length`, bonus sets included in both halves.

**Why:** excluding bonus work from the denominator printed **4 / 4** on an
exercise whose fifth set was still pending — a tally reading finished over a
ledger plainly saying otherwise. Caught by a test written against the real
Sunday session, where the mockup said 4 / 5.

---

## D6 · `.prettierrc.js` was missing two keys

**Decided:** restored `bracketSameLine: true` and `bracketSpacing: false`.

**Why:** every file in the repo is written to them, but the config did not
declare them — so running Prettier reformatted the *entire codebase* instead of
the file you had touched. Which is presumably why nobody ran it. The config now
describes the code that actually exists.

---

## D7 · The rail's groups flex by set count, not equally

**Decided:** `flex: group.length` per exercise group.

**Why:** `flex: 1` drew five ticks in the width another group spent on three,
so the same set looked bigger or smaller depending on which exercise it was in.
Every set is one set.

---

## D8 · `type.focus` (112px) went into `tokens.ts`

**Decided:** a new type token rather than an inline font size.

**Why:** nothing outside `src/theme/tokens.ts` may declare a colour or a font
size — the rule the whole design system rests on. The headline feature of this
redesign is not the place to break it.

**112, not the 120 the design drew:** two digits at 112px are ~190px wide, which
clears a 393dp screen inside its padding with room for a third digit. 120 did
not leave that margin.

---

## D9 · Stepping goes through the store, not through rendered values

**Decided:** `stepReps(delta)` / `stepWeight(delta)` on `useActiveSet`.

**Why:** a bug I introduced and caught. `setReps(active.reps + 1)` reads a
snapshot from the render that drew the button, so two presses inside one frame
both resolve against the same stale number and the second silently undoes the
first. The stepper shoulders are the fastest-tapped controls in the app, so this
would have shown up in the gym and not in tests.

---

## D10 · Focus alignment waits for the query to settle

**Decided:** the focus callback sets a flag; an effect performs the alignment
once `!isFetching`.

**Why:** aligning inside the focus callback looked simpler and was wrong. On a
cold open the session has not arrived; on a return the refetch is still in
flight. So it aligned against stale data and then never corrected — you came
back to a workout sitting on a set you had already recorded.

**Inherited, not introduced:** the old screen had the same flaw, hidden because
it aligned to an *exercise*, which was coarse enough to mask it.

---

## D11 · Undo is structural here, not a nicety

**Decided:** `snapshotSet` / `restoreSet` in the repository, and a four-second
banner built alongside the write rather than after it.

**Why:** on a list the row you touched stays in front of you, so a wrong number
is visible and fixable at leisure. This screen *replaces itself* the instant you
record — the evidence leaves with it. An unreversible tap is not acceptable
under those conditions.

**The snapshot is the whole mutable half of the row**, not a delta: restoring
"the previous reps" would leave a set that had been skipped and then recorded
sitting `completed` with no numbers, which is an impossible state. Exercise
status is derived, so restoring walks that back too.

**Undo returns to the set it came from**, not to wherever the advance landed.
Otherwise undoing a bench set leaves you looking at Cable Fly.

---

## D12 · The primary button states its consequence

**Decided:** "Record 10 × 30 kg" and "then Cable Fly", never a bare ✓.

**Why:** same reasoning as D11. The screen the button was pressed on is about to
be gone, so the button is the last chance to say what it wrote. Crossing an
exercise boundary names the exercise; staying inside one names the set number —
"then set 1" would be true and useless.

---

## D13 · Skipping stays on the set; recording advances

**Decided:** asymmetric on purpose.

**Why:** a skip is a decision worth seeing land, and the one tap people most
often want back. Staying put makes it visible and one tap from undone.
Recording is the flow's whole rhythm and should not need a second tap to
continue.

---

## D14 · The peek gets a visible control, not only a gesture

**Decided:** a `▲ the whole session` strip above the action bar.

**Why:** the design showed swipe-up. The peek is the *only* route to the shape
of your session in this flow — it cannot depend on a gesture nobody is told
about. The swipe can be added later as an accelerant; the strip is the
guarantee.

**And the peek is not optional at all:** a focus screen cannot show you your
day, and the rail cannot tell you that you were three reps short on set two. It
is honest to record that this gesture stands in for information that could
simply have been on screen the whole time — the cost C pays for the numeral.

---

## D15 · Everything an exercise can do lives behind one `⋯`

**Decided:** add set, remove set, finish/skip, swap, note, move, remove.

**Why:** a focus flow has nowhere else to put any of it. In the list this
replaced, "Add a set" and "Finish this exercise" were 56dp full-width buttons
*inside every expanded card*, on a screen whose whole problem was vertical
space.

**The cost, stated plainly:** this is the one control a new user has to find,
which is exactly why it is a plain `⋯` and not something clever.

**Disabled rows stay on the sheet with their reason printed.** Hiding a control
that was there a minute ago leaves somebody hunting for it; "not yet, because"
answers the question hiding it would raise.

---

## D16 · `Remove set n` follows the repository's asymmetry

**Decided:** a planned set is skipped, never erased; a bonus set can go in any
state; the last set on an exercise cannot go at all.

**Why:** this closes the complaint that started this work — "if I have added a
set by mistake and I want to delete it there is no way to do that". Erasing a
*planned* set shrinks the denominator and flatters the workout. Erasing a
*bonus* set only ever reduces the credit being claimed. The two are not the same
act.

---

## D17 · Amending returns to the live set, not forward

**Decided:** a separate `onSaveAmendment`, not a reuse of `onRecord`.

**Why:** `onRecord` advances to the next *pending* set. After correcting set 1
of exercise 1, that is set 2 — walking you backwards through a workout you had
already reached the end of. An amendment ends where it started.

---

## D18 · The note is a sheet with a Save button

**Decided:** `NoteSheet`, replacing the inline debounced field.

**Why:** the old field committed on a debounce, *and* on blur, *and* on unmount
— three mechanisms, because on a full screen it was usually below the fold and
there was no reliable moment when the user had finished with it. A sheet has
exactly that moment. Three ways to lose what you typed, removed.

**An empty field stores `null`, not `''`** — otherwise a blank note renders as a
stray line under the exercise.

---

## D19 · The legacy test file is kept, skipped, as a checklist

**Decided:** `SessionScreen.legacy.test.tsx`, `describe.skip`, deleted in 7.2.

**Why:** the old screen's 34 tests describe behaviours, and almost none of those
behaviours are gone — they have to reappear through different controls. The
plan carries a table of which task restores each one. A deleted test is a
behaviour nobody remembers losing.

**Status:** 30 restored, 1 dropped (nothing expands any more), 1 moot (every set
is reachable now), 1 waiting on the finish sheet.

---

## D20 · Test-harness lessons worth not relearning

**An un-awaited `act()` leaks its scope into the next test.** `act` is async in
this version of RNTL. One un-awaited call made the following six tests fail ~1s
apart, looking exactly like a data problem.

**`findBy*` polls on timers, so a fake-timer test that also renders a screen
deadlocks rather than fails.** It hung a whole jest run. The undo-expiry test
was moved down to `UndoBanner`, where the question can be asked without
rendering the workout. Ask a question at the level that can answer it.

**`ui/Button` sets no `accessibilityLabel`** — query it by text.

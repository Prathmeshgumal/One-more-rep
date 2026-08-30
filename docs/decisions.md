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

---

## D21 · Finishing is a sheet, and it arrives on its own

**Decided:** `FinishSheet` over the workout; `WorkoutCompleteScreen` deleted.

**Why:** the screen it replaces pushed a whole view carrying a 56px percentage,
a completion bar, four verdict counts, volume, a warning and a Save button — and
then Today showed the same summary again the moment you landed. Two screens and
two taps to end a session, for information nobody acts on at that moment.

**It opens itself after the last set** because a focus flow has no list to fall
back to; there is no other natural end. It is also always reachable from the
header, which stands out only once everything is decided.

**The wording follows the trigger:** "That was the last set." when it arrived on
its own, "Finish this workout?" when you opened it early. A question you did not
ask is not a question.

**The warning names the exercises**, not just a count: "3 sets on Cable Fly were
never recorded" can be acted on; "3 sets were never recorded" sends you hunting.

**Volume is omitted rather than printed as zero** on a bodyweight-only session —
`0 kg lifted` reads as a failure rather than an inapplicable number.

---

## D22 · `ExerciseSummaryScreen` was deleted outright

**Decided:** removed, with no replacement.

**Why:** it lost its automatic push in an earlier round and has since been
reachable only from a `⋯` menu, so almost nobody would ever open it. With the
whole session visible in the peek, a per-exercise screen has nothing left to
add.

**Checked before deleting:** the image export it shared with the finish screen
also lives on `DayDetailScreen`, so nothing was lost with them.

---

## D23 · A saved workout is corrected in place, not reopened

**Decided:** tapping a set row on a finished day opens `AmendSetSheet`. The
session stays `completed` throughout.

**Why:** this is the feature asked for at the start — "the user must also be
able to edit the workout even after saving it". Nothing in the data model was
ever stopping it: `completeSet` overwrites regardless of session status, and
always has. Only the screens declined to offer it.

**Reopening was the alternative and was rejected as the *first* step.** It is
more powerful — you could undo a skip, add an exercise — but it introduces a day
that is finished and then is not, which the adherence figures, the calendar and
the day resolver all read. Correction in place covers the real case (a wrong
number) and costs no new states.

**The bigger jobs are still reachable:** `Edit workout` opens the focus screen
on the saved session, where every set is already in amend mode because every set
is `completed`. That fell out of the design rather than needing to be built.

**"Mark as skipped" rather than a delete**, for a set recorded that should not
have been: deleting it would shrink the denominator and flatter the workout,
which is the same asymmetry as D16.

**Both screens, not one.** The day detail matters more than the workout home
here — a mistake is noticed days later, looking back, not with your heart rate
at 150.

---

## D24 · `LedgerTable` rows take a caption

**Decided:** an optional `caption` folded into each row's accessibility label.

**Why:** the day-detail screen draws one table per exercise, so making rows
pressable produced several identical "Correct set 1" buttons with nothing to
tell them apart. Found by a test that could not disambiguate them either — the
test failure and the accessibility flaw were the same bug.

---

## D25 · The tab bar is hidden during a workout, from the tab navigator

**Decided:** `tabBarStyle: {display: 'none'}` when the focused child route is
`Session`.

**Why:** the bar is 65dp of the one third of the screen a thumb reaches
comfortably, and nothing on it can be used mid-set. All it offered during a
workout was a way to fall out of one by mis-tapping. The ✕ in the session header
is the way out.

**Read off the focused route rather than declared on the stack screen:**
`tabBarStyle` belongs to the tab navigator, and a nested native-stack screen
cannot set it — TypeScript refused the first attempt, correctly.

---

## D26 · What was deleted, and what was checked first

**Deleted:** `WorkoutExerciseCard.tsx`, `SetRow.tsx`, `WorkoutCompleteScreen.tsx`,
`ExerciseSummaryScreen.tsx`, and the two test files that covered them.

**Checked before deleting:** the image export the finish screen carried also
lives on `DayDetailScreen`; every one of the legacy suite's 33 behaviours was
ticked off the plan's table first. 30 were restored through the new controls,
one was dropped because nothing expands any more, one became moot because every
set is now reachable, and one moved to the finish sheet.

**The legacy test file was kept skipped for four phases** precisely so this
could be checked rather than assumed. A deleted test is a behaviour nobody
remembers losing.

---

## D27 · The set has the casting vote over the catalogue

`exercises.json` ships `3/4 Sit-Up` with `weightApplicable: false`, and it is
right about the movement. But `TargetEditorScreen` never consulted that flag,
so the 0.5 kg plate held on the chest went into the plan quite happily — and
`FocusSet` gated its stepper on the flag, so the screen printed
`TARGET 11 × 0.5 KG` above no way to change it. The set knew about a weight the
exercise denied existed.

`weightInPlay(exercise, set)` resolves it in the set's favour: a weight is in
play when the catalogue says the movement takes one **or** this set already
carries a target or a recorded weight — which is the only route by which a
body-only exercise gets a number on it at all.

**Not** used for the value the screen opens holding. A bodyweight set with no
weight anywhere still arrives at `null`, not at a zero that reads like a
measurement (§26 stands).

The two tests that encoded the old rule cleared the catalogue flag and left a
30 kg target sitting on the sets. That is a weighted set by any honest reading,
so the fixture now clears both.

---

## D28 · A pad, not the system keyboard

The steppers are right for a rep either side of the target and wrong for
everything else: 20 kg to 60 is sixteen presses, and the last eight are done
without looking. So both numbers are pressable and open `NumberPad`.

A `TextInput` with `keyboardType="numeric"` was the smaller change and the
wrong one. Android's keyboard takes the bottom third of the screen — exactly
where Record lives — so the field being filled in pushes away the button that
commits it. It also brings a suggestion strip, a return key with opinions and a
layout shift, onto a screen whose entire argument is that nothing moves. Twelve
keys have none of that and can afford 64dp targets at 393dp wide, which the
system keyboard cannot.

**The first key press replaces the incoming value.** Typing 6 into a field
reading 42.5 has to give 6; accumulating gives 42.56, which is not a weight
anyone meant. A backspace on an untouched field clears it rather than editing
it, for the same reason.

---

## D29 · Three buttons that did one thing

The strip under the set was a single `Pressable` laid out as
`← set 2 · ▲ the whole session · set 1 →`. The arrows were labels describing
what the rail already does; they rendered as controls and lied. Reported from
the bench before any test caught it, because no test can assert that something
*looks* like a button.

`FocusUtility` replaces it: one session button naming its own progress, the
note button, and the "then Cable Fly" line. Moving that line out of the Record
button is what pays for the action bar dropping 76 → 56 — with padding the old
bar was 92dp, a tenth of the screen, for two controls.

The pills are 32dp inside a 36dp row, below the 44 floor, so they carry
`hitSlop` to 52. Growing the target rather than the pill is the point: the row
exists because the action bar gave up two lines to make space for it.

The note button names its exercise. The ⋯ menu still offers the same act, and
two controls answering to one name is a maze with a screen reader — the
duplicate-label collision showed up as a test failure and an accessibility
defect at the same moment, which is the second time on this branch.

---

## D30 · §39, narrowed rather than dropped

`startWorkout` copies targets into `performed_sets` and the session never looks
at the plan again. That is §39, and what it protects is real: a set recorded on
Tuesday keeps the number it was judged against, so history cannot be rewritten
by editing the plan.

It protected one thing too many. A 3.5 kg target set on Ab Roller *while the
workout was running* reached nothing at all — the session had already
snapshotted `target_weight = NULL` — and nothing on screen said the plan and
the workout had diverged. Reported from the phone.

`syncActiveSessionFromPlan` splits the rule along the line §39 actually cared
about:

- **Pending sets follow the plan.** Targets rewritten, sets added when the plan
  gains them, trailing ones dropped when it loses them.
- **Decided sets never move.** Completed or skipped, the target is evidence.
- **A recorded set the plan no longer has is kept.** Deleting it would shrink
  the denominator and flatter the workout.
- **Exercises are not touched at all.** The session has its own menu for
  adding, swapping and skipping them; a plan edit that undid a deliberate
  session edit would be worse than the bug.
- **Bonus sets survive and are renumbered behind the planned ones**, or a
  session that loses a set reads "set 4 of 3".

Matching is **positional by exercise, not by `plannedExerciseId`**. Every plan
write rewrites the tree — in place, or as a fork once a session exists against
the version — so those ids do not survive the edit that triggers the sync. This
was the trap: the obvious join is the one that silently matches nothing.

It runs inside `useEditPlan`'s `mutationFn`, not its `onSuccess`, so the
session query is invalidated against a database that has already caught up.
The other order refetches the old targets and leaves nothing to trigger a
second read.

**Consequence:** the set list can now shrink underneath the focus screen, and
the focus is an index. `SessionScreen` clamps it, or the screen renders blank
on a workout that just lost its last set.

---

## D31 · A plate you can pick up mid-set

The catalogue's flag describes the movement and the plan's target was fixed
when the workout began; neither knows you have just picked a plate up off the
rack. A set with no weight now offers **＋ add weight**, which opens the pad.

The next set of that exercise inherits it through `active.load`'s
`lastRecorded` fallback — you have not put the plate down in between.

`weightToWrite` keeps §26 intact through the escape hatch: a weight added and
then stepped back to zero records `NULL`, not `0`. You took the plate off; the
ledger says so by staying empty rather than by claiming you lifted nought.

---

## D32 · Time, measured from the sets rather than the buttons

The only duration in the app was `completedAt - startedAt`: from pressing
Start to pressing Save. That measures the wrong thing at both ends — changing,
warming up, and however long it took to remember to close the app — and it
showed **nothing at all** for a session abandoned overnight, because an
abandoned session never gets a `completedAt`.

Every recorded set already carried its own timestamp, and nothing read the
column. `sessionTiming` reads it:

- **working** — first recorded set to last. Immune to both ends, and it
  survives a session that was never saved. It understates by roughly one set,
  because a set is stamped when you press Record, which is after you did it;
  nothing recovers that without a timer nobody starts mid-set.
- **medianRest** — the middle gap. Median, not mean: one trip to the water
  fountain drags a mean anywhere it likes.
- **longestRest** — so that trip stays visible rather than being smoothed away.
- **total** — kept, as the wider figure beside the span.

**Timestamps are sorted, not taken in row order.** Set 3 can be recorded before
set 2 — the rail, the peek and the edge taps all allow it — and a span taken
from the first and last rows comes out negative.

**No threshold.** Discarding rests over some cutoff would give a tidier
"active time" and would require inventing a number for what counts as leaving
the floor; fifteen minutes is a long rest for one person and a normal one for
someone doing heavy singles. A visible twenty-minute gap is more honest than a
tidy figure that deleted it.

`formatRest` keeps seconds under two minutes. 92 s and 148 s are both "2 min"
to `formatDuration`, and the difference between them is the entire reason to
look.

---

## D33 · A correction must not move when the work happened

`completeSet` wrote `completedAt: Date.now()` on every call, amendments
included — so correcting Tuesday's set 2 on Thursday stamped Thursday onto
Tuesday's workout. The act of fixing a typo destroyed the only evidence of
when the set was performed.

It keeps whatever is already there. A set recorded for the first time, or one
returning from skipped, has nothing to keep and takes `now`.

Found while designing D32, which is the point: nothing read the column, so
nothing caught it. A field written by one path and read by none has no
feedback loop at all, and this one had been wrong since it was added.

---

## D34 · Skipping moves on

Skip left you standing on the set you had just skipped, with the primary
button offering "Go to Cable Fly". Leaving a set behind took two taps, and the
second asked a question the first had answered. Reported from the phone.

It now advances on the same rule as recording — forward to the next undecided
set, the finish sheet when there is none. The four-second Undo is the way
back, and the skipped set stays reachable from the rail, the peek and the edge
taps, where it still offers the full `Undo skip`.

---

## D35 · The top fade only appears once something is under it

The gradient covering the cut edge of a scrolling list was drawn
unconditionally, so a list sitting at rest had its first 28dp washed out too.
On the workout screen that band is exactly the date line, and `SUNDAY, 30
AUGUST` came out half-erased on a screen nobody had scrolled. Reported from
the phone.

A fade is a way of saying "there is more above this"; when there is not, it
should not be there. `useScrollFade` tracks the offset and crossfades the
gradient in past 2dp — a threshold rather than zero, because an overscroll
bounce is not a scroll — and both `Screen` and the workout home screen drive
it.

---

## D36 · The exercise menu is a grid, not a list

Reported as "too confusing, random colours, don't know what happens when we
use what thing", and three separate faults were behind it.

Ochre meant two opposite things on one sheet: `Finish this exercise` was ochre
because it *ends* something, and the three disabled rows' explanations were
ochre because they are *refusals*. The loudest colour marked both what you can
do and what you cannot.

The dead rows shouted louder than the live ones. A disabled row got two lines
and a colour; an available row got one line of plain white. Four fifths of the
ink was spent on things you cannot press.

And eight peers with no grouping: adding a set, reordering the exercise and
deleting it from the workout are three kinds of act at three stakes, drawn
identically.

Twelve arrangements were drawn at 393dp and the tile grid was chosen. Nine
tiles at 111 × 88 — over five times the area of the 44dp row they replace,
which is a target designed for a cursor — each with a glyph you can find
without reading, in an order fixed regardless of state, because a tile that
moves between openings is a tile you have to read again every time.

The trade the grid makes is that a tile has nowhere to print a reason, which
is the one thing the list did well. So an unavailable tile stays pressable and
spends the press explaining itself into a reserved line under the grid, and
the ninth tile collects every reason at once. Only refusals are ochre now, and
only once you have asked for one. `ActionSheet` had no other caller and went
with it.

---

## D37 · Settings is sections behind a pinned index

Reported as looking "like a page to select different options and not really
like app settings", which was exactly right: everything on it *was* a chooser.
The exercise library — the only place on the page you actually go — was drawn
as the same bordered box as a radio button for "kg", and nine option cards
spent 1100dp to answer four questions.

Eight layouts were drawn and the jump index was chosen. Lifting, Appearance
and About, each a bounded group; the title and a chip row pinned outside the
`ScrollView`, the way `WorkoutHomeScreen` already pins its calendar and plan
buttons — an index that scrolls away is an index you scroll back up to use.
This is why Settings no longer uses `Screen`, whose header scrolls by design.

The chips both drive the scroll and follow it, so the index cannot lie once
you scroll by hand. Every option card becomes a `Segmented` on the row it
belongs to: four settings do not justify a chooser you have to open to read.

Three sections do not need an index, and the study said so. It was built
anyway because the fourth section is the one about your data — 28 sessions
living in one file on one phone, which this page ought to be saying something
about and currently says nothing. Backup and restore were drawn in the study
and are **not** built; they are real work, not a redraw.

---

## D38 · Adding an exercise mid-workout, back from the dead

Reported from the phone: there was no way to add an exercise during a
workout. There had been — a ghost button at the bottom of the scrolling
`WorkoutScreen` (`14894da`). The focus flow replaced that screen with one set
at a time, and the button had nowhere to live, so it went. The picker it
opened, `useAddExercise`, and the "also add it to the plan" toggle were all
still there and all still working; only the door was lost. D36's grid
inherited the same eight actions the sheet had, so it did not bring it back
either.

It is now the ninth tile in the `⋯` grid, and it lands **directly behind the
exercise you added it from** rather than at the end of the day. That is the
request as actually made: you decide to add a movement standing in front of
it, part way down the workout. Appending it behind four exercises you have not
reached yet means walking away from the rack to come back, and the rail would
show it at the far right while you did it next. `addExercise` takes an
optional `after`, shifts everything at or past that position down one inside a
transaction, and still appends when no anchor is given or the anchor is not in
this session.

It took the slot `Why?` had. That tile listed every reason at once; the line
under the grid already invites you to ask for them one at a time, and a tenth
tile would have bought a fourth row holding one. The grid stays 3 × 3.

It is the only action on that sheet that is about the day rather than about
the exercise the sheet is named after. The peek would be the tidier home by
scope, but the `⋯` is where a hand goes looking for "what else can I do", and
one correct-by-taxonomy door nobody opens is worth less than a slightly
impure one that gets used.

---

## D39 · Creating an exercise, from where you needed one

Reported from the phone: "I don't see an option to add a custom exercise
either in any of the screens apart from the exercise library."

It was in both pickers already, and had been since complaint 5 — as the
`ListFooterComponent`. Under four hundred exercises. Reaching it meant
scrolling the entire library past every movement you had just failed to find,
which is the same as it not being there, and the report is the correct verdict
on it.

One `CreateExerciseRow`, shared by both pickers, pinned in the header under
the filter chips and above the results. It is a dashed row rather than the
`Card` it was: at the top of a list of cards another card reads as the first
result, and the one thing this must not look like is an exercise named
"Create a new exercise".

It still names what you typed — `Create "Zercher Squat"` — because the moment
you need it is the moment a search came back empty, and retyping the name into
the editor is a tax on having already said it once. The plan's picker used to
move the card between header and footer depending on whether the search found
anything; one fixed position is better than a control that relocates.

---

## Outstanding

**The device walk for v4.** D35–D39 are verified against 868 tests and
jsdom. A fade that appears at the right moment, nine tiles at 111 × 88 and a
pinned chip row are all things that only answer on glass.

**The device walk for v3.** D30's sync is verified against 14 repository tests
and jsdom. Editing a target mid-workout and watching it land is a phone test.

**The device walk for v2.** D27–D29 are verified against jsdom only. The pad's
key sizes, the shortened bar and the 44dp weight shoulders are things that
answer on glass.

**The device walk.** Everything above is verified against jsdom and a release
bundle that builds. The 112px numeral, the rail's tick widths and every sheet
height are things that only really answer on glass, and the last time this app
changed shape six bugs were found by running it on hardware that ~700 tests had
missed. Nothing is finished until a real session has been walked start → save →
correct on the phone.

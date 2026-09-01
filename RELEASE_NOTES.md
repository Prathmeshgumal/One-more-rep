# 1.1.0 — the focus workout flow

The workout screen was a scrolling list of every exercise in the day, and the
set you were actually on was a row in it. This release makes the set the
screen.

Forty-six commits since 1.0.0, roughly half of them fixes for things found by
using the app in a gym rather than by reading it.

## One set at a time

- **The set fills the screen.** A 112px rep count you can read at arm's length
  mid-set, the weight above it, and the exercise and set number as a single
  line of context.
- **A rail across the top** shows the whole session as story segments — green
  for recorded, grey for pending — and any of them takes you there.
- **Tap the left or right edge** to move a set, the way a story moves a frame.
- **Type any number.** Tap the reps or the weight and a 64dp keypad opens.
  Twelve taps of a `+` button to get from 20 to 45 was the old way.
- **Record, skip, undo.** Skipping now moves you on, because deciding to skip
  a set already answered the question the second tap was asking.
- **A corner cluster** holds the session, the note, skip and the `⋯` menu in
  one thumb arc, instead of four controls in three shapes spread across the
  screen.
- **Peek at the whole session** without leaving the set you are on.
- **Finishing is a sheet**, not another screen.

## Changing the day while you are in it

- **Add an exercise mid-workout**, and it lands directly behind the one you
  added it from rather than at the end of a day you have not reached yet.
- **Create an exercise that is not in the library** from either picker — the
  workout's and the plan's. The row sits above the results now; it used to be
  the list's footer, under four hundred movements.
- **Record a workout that was never planned.**
- **Plan edits reach a running session again.** Set a target mid-workout and
  the sets you have not reached yet follow it; sets you have already decided
  never move.
- **Correct a saved day.** Tap any recorded set on a finished workout and fix
  the number. A set recorded that should not have been can be marked skipped —
  never deleted, because that would shrink the denominator and flatter the
  workout.

## Reading it back

- **Time measured from the sets, not the buttons.** A finished day now leads
  with `24 min lifting · 24 min in the gym · 12 s typical rest`. The old
  figure was start-to-save, which counted the drive home.
- **One history screen** instead of two.
- **Two tabs** instead of five.

## Settings

- **Sections behind a pinned index** — Lifting, Appearance, About — instead of
  nine identical bordered boxes answering four questions.
- Every choice is a control on its own row. Nothing hides behind a sheet.

## Fixes

- The amend sheet's weight and reps controls drew as two empty outlines. A
  primitive was claiming `flex` on its parent's behalf.
- A plate planned onto a body-only movement is still a plate — an Ab Roller
  with a 3.5 kg target had nowhere to show it.
- Correcting Tuesday's set on Thursday no longer restamps it Thursday.
- The top fade waits until there is something under it, instead of washing out
  the date on a screen nobody has scrolled.
- Screen fragments must never be restored — a real crash on relaunch.
- Seven smaller things found on the phone: the undo banner over the progress
  bar, the header's proportions, a note you could not see while typing it, and
  the calendar and plan buttons scrolling away.

## Notes

- A note on an exercise is now capped at 1000 characters. There was no ceiling
  before, and five screens render notes in full without truncating.

## Install

`one-more-rep-1.1.0.apk`, signed with the same key as 1.0.0, so it upgrades in
place and your training history survives. Android 7.0 (API 24) and up.

Everything stays on your phone. There is still no account, no sync and no
network call.

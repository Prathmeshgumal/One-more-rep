# Screen designs

Eighteen screens for the workout tracker, designed and approved before implementation (D11 in the [design spec](../superpowers/specs/2026-08-22-workout-tracker-design.md)).

- **Interactive prototype:** `screens.html` — open it in a browser. Steppers, set completion, toggles, and the theme switch are live.
- **Images:** `screens/*.png` (light) and `screens/dark/*.png` (dark), rendered at 2× — 390 × 844 logical, 780 × 1690 actual.
- **Contact sheet:** `screens/00-contact-sheet.png` — the whole board in one image.

## Direction

The app is designed as a **training ledger**, not a fitness dashboard. §2's rule — the plan is what you intended, the session is what happened, and neither overwrites the other — is double-entry bookkeeping applied to training, so the interface borrows the form of a log book.

**The signature is the overprint.** Targets render as if pre-printed on the form; actual performance is written over them in ink. It appears on Today, Workout, History, and Exercise History, and it means a screen states its own status through type treatment before you read a single number.

Deliberately avoided: the near-black + acid-lime + rounded-cards look shared by most fitness apps, which §42 also warns against.

| Token | Light | Dark | Role |
|---|---|---|---|
| `paper` | `#EDEFF2` | `#0C0F13` | Ground — cool, not cream |
| `ink` | `#12161B` | `#E8ECF1` | Primary text |
| `plate` | `#1B4FD8` | `#5B87FF` | Accent — the 20 kg plate blue |
| `gain` | `#17724A` | `#35B57C` | Exceeded target |
| `short` | `#A56A12` | `#D69B3C` | Below target — **ochre, never red** |
| `skip` | `#8A93A0` | `#6C7683` | Skipped |

Falling short of a target is data, not failure. The app never uses red for it.

**Type:** `Archivo` across two widths — expanded for the large numerals, normal for UI. `IBM Plex Mono` for ledger columns, where tabular figures make weights actually align. The mono is functional, not decorative.

## Screens by phase

| # | Screen | Spec | Phase |
|---|---|---|---|
| 01 | First run — no plan yet | §4, §40 | 2 |
| 02 | Plan — week overview | §5, §6 | 2 |
| 03 | Plan — new day, nothing set up | §5, §6, §40 | 2 |
| 04 | Plan — day setup | §5, §6, §8, §10 | 2 |
| 05 | Plan — exercise picker (multi-select) | §7, §29 | 2 |
| 06 | Plan — target editor | §9 | 2 |
| 07 | Plan — copy a day | §31, §32 | 2 |
| 08 | Today — workout day | §12 | 3 |
| 09 | Today — rest day | §6, §33 | 3 |
| 10 | Today — resume | §20 | 3 |
| 11 | **Workout — recording a set** | §13, §14, §18, §35, §36 | 3 |
| 12 | Workout — exercise summary | §17, §26 | 3 |
| 13 | Workout — complete | §19 | 3 |
| 14 | History — timeline | §22, §27 | 4 |
| 15 | History — calendar | §23 | 4 |
| 16 | History — day detail | §16, §21 | 4 |
| 17 | Exercise history | §24, §26 | 4 |
| 18 | Exercise library | §29, §30 | 1 |
| 19 | Exercise — create custom | §30 | 1 |
| 20 | Settings | §38, D2 | 5 |

Screen 11 is the one to get right. Everything else is navigation around it.

## Plan setup flow

Screens 02 → 03 → 05 → 06 → 04 are one journey:

1. **02** — tap an unconfigured day on the week overview
2. **03** — the day opens empty. Name it, or declare it a rest day. Rest day is a full-width button *here only*, because the day is still undecided
3. **05** — select several exercises at once; each lands on a 3 × 10 default so the day is immediately valid
4. **06** — tune the real targets
5. **04** — back on day setup, now populated. Rest day has demoted to a quiet line at the bottom, since the decision is made

The rule: **rest day is prominent while a day is undecided, quiet once it has exercises.**

### Planning a whole week

Setting up five training days means adding roughly twenty-five exercises, so two screens exist specifically to stop that being miserable:

- **05 is multi-select.** Check off everything for the day in one pass rather than one round trip per exercise.
- **07 copies a day.** Configure Push once, copy it to Thursday and Sunday. Days that already hold exercises are outlined in ochre and warn that copying overwrites them.

Copying forks a new plan version rather than editing the current one, so history keeps the targets it was performed at (§32, §39).

## Regenerating the images

`screens.html` is the source of truth; the PNGs are rendered from it. To re-render after editing, screenshot each `figure.device .phone` element at `deviceScaleFactor: 2` in both themes, writing light to `screens/` and dark to `screens/dark/`.

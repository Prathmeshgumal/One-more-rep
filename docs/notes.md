1. One thing I'd flag ahead of Task 8: src/db/seed/exercises.json is 776 KB and gets bundled into the JS. That's startup parse time on every launch, not just the first. Worth watching when the device gate runs.

---

# 2026-08-24 — Ten complaints from the first week of real use

Recorded verbatim. The plan that answers them is
`docs/superpowers/plans/2026-08-24-usability-fixes.md`.

> 1) When we add excercise to a plan and in the excercise we change weight
> values right now we can only change it in multiples of 2.5 i want you to
> change it to 0.5 also if the user wants to change the weight to any value he
> must be able to do it by simply tapping on the weight number and tying the
> number. This applies everywhere while creating plan and also while marking
> the excercise as done.
>
> 2) There is no option to change the theme between dark, light, system modes.
> This feature should be added to the settings page.
>
> 3) Suppose you created a plan and lets say it Monday and i am workingout now
> during the excercise i only see one excercise at a time and next one after
> marking it as done or skipping i should be able to see all the excercies in a
> single view. user must be able to edit or move to any excercises.
>
> 4) When i workout is happening in a planned schedule it may happen i want to
> add, remove or change a excercise i dont see that happening i had 6
> excercises on Monday and while doing the excercise i wanted to add one more
> so i went to plan section and added one more excercise the excercise never
> appeared in Today.
>
> 5) everytime i have to add a excercise i have to add it to excercise section
> and then add it to the plan new excercise should be addable while creating
> the plan also. I am talking about custom excercises.
>
> 6) For a excercise suppose im in set 1 i dint see the weight and reps target
> for the next sets we should see everything whenever we want to. The user must
> be able to toggle between excercises.
>
> 7) i should be able to add notes to each excercise while performing them
>
> 8) when i see the day done in history i should be able to share the image of
> all the excercise and reps done for now we can only have the download button.
> later we should add options to share
>
> 9) Suppose i have added a wrong excercise and while working out i realise it
> so i should be able to edit it then and there. whiel editing if the excercise
> exists in our list good else he should be able to create a custom excercise
> there itself.
>
> 10) On the today page why do i need to click on see summary to see the
> summary it should be readily visible even without clicking the button and
> there should be a button that gives all the excercises view. remove the extra
> layer of see the summary and in the summary show all the reps and sets data.

## Two findings from reading the code before planning

**Complaint 4 is not a bug.** `startWorkout` copies the plan's targets into
`performed_sets` at session start and never joins back to `planned_sets`. That
is §39 made structural — it is the reason last month's workout does not change
when this month's plan does. A plan edit genuinely cannot reach a running
session, and the fix has to be somewhere else.

**Complaint 6 was half a rendering problem.** The targets for later sets were
already on screen, printed in each set's head strip. `SetRow` draws every
not-yet-active row at `opacity: 0.55`, which on a phone at arm's length reads
as absent.

## Four forks, and how the user settled them

| Fork | Options offered | Chosen |
|---|---|---|
| Workout layout | one scrolling list of expandable cards / keep the focused screen and add a jump list | **one scrolling list** |
| Plan edited mid-workout | banner offering to pull it in / no banner, full editing inside the workout / pull in automatically | **full editing inside the workout** |
| Weight step | a setting with a 0.5 default / hard-code 0.5 | **a setting, default 0.5** |
| Share image | save to the phone gallery / save plus a share sheet now / no new libraries, copy as text | **save to the phone gallery** |

Typing a number directly was never in question — it happens everywhere
regardless of the step size.

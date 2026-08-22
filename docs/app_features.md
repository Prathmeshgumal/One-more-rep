# Gym Exercise Recording & Workout Tracking App

## 1. Product Overview

Build a clean, modern gym workout planning and exercise tracking application.

The primary purpose of the application is to allow a user to:

1. Create a weekly workout routine.
2. Assign exercises to specific days.
3. Define target sets, reps, and optionally target weight for every exercise.
4. Follow the planned workout while actually training.
5. Record the actual reps, sets, and weight completed for every individual set.
6. Compare actual performance against the planned target.
7. Track workout adherence and exercise performance over time.
8. View historical performance at exercise, workout, and set level.

The application should feel like a **personal workout execution and logging tool**, not a social fitness platform.

Do not add unnecessary features such as social feeds, followers, challenges, calorie tracking, meal planning, or community functionality in the initial version.

---

# 2. Core Product Principle

The application must distinguish between:

### Workout Plan

What the user intended to do.

Example:

Machine Chest Press
Target: 3 sets × 10 reps × 30 kg

### Workout Performance

What the user actually did.

Example:

Set 1: 30 kg × 10 reps
Set 2: 30 kg × 10 reps
Set 3: 32.5 kg × 8 reps

The original target must never be overwritten by actual performance.

The application must store both independently so that historical comparison is possible.

---

# 3. Main Navigation

The application should have a simple primary navigation:

* Today
* Plan
* History
* Exercises
* Settings

The most important screen is **Today**.

When the user opens the application, they should immediately understand:

* What workout they are supposed to do today.
* Whether today is a rest day.
* What exercises they need to perform.
* What their target is.
* How much of the workout they have completed.

---

# 4. First-Time User Experience

If the user has no workout plan yet, the application should show an onboarding state.

Example:

"Create your workout plan"

Supporting text:

"Set up your weekly routine and start tracking your workouts."

Primary button:

"Create Plan"

After clicking Create Plan, show the seven days of the week:

* Monday
* Tuesday
* Wednesday
* Thursday
* Friday
* Saturday
* Sunday

Each day should initially be unconfigured.

The user can configure each day independently.

---

# 5. Weekly Workout Plan

## Day Configuration

When the user selects a day, show a configuration screen.

Example:

Monday

Day name:
"Push Day"

The default day name can be "Monday", but the user should be able to customize it.

Examples:

* Push Day
* Pull Day
* Leg Day
* Chest + Triceps
* Back + Biceps
* Upper Body
* Lower Body

The custom name is optional.

---

# 6. Rest Day

Every day must have a "Rest Day" option.

If a day is marked as Rest Day:

* No exercises can be added.
* The day should clearly display "Rest Day".
* The Today screen should show that today is a rest day.
* The user should not be presented with an empty workout.

Example:

Wednesday

REST DAY

"Recovery day. No workout planned."

The user should be able to change a Rest Day back into a workout day at any time.

---

# 7. Adding Exercises

For a workout day, provide:

"Add Exercise"

The user should be able to search/select an exercise.

Example exercise:

Machine Chest Press

Other examples:

* Lat Pulldown
* Leg Press
* Hack Squat
* Cable Row
* Dumbbell Bench Press
* Lateral Raise
* Bicep Curl
* Tricep Pushdown
* Calf Raise

Exercises should come from an Exercise Library.

The initial exercise library can contain common gym exercises.

The user should also eventually be able to create custom exercises.

---

# 8. Exercise Plan Card

Once an exercise is added to a day, display it as a card/row.

Example:

Machine Chest Press

3 sets
10 reps
30 kg

Actions:

* Edit
* Delete
* Reorder

The card should clearly communicate the target without requiring the user to open it.

---

# 9. Exercise Target Configuration

When creating or editing an exercise, allow the user to configure:

### Sets

Required.

Example:

3 sets

### Reps

Required.

Example:

10 reps

### Weight

Optional.

Example:

30 kg

Weight must be optional because some exercises may be:

* Bodyweight exercises
* Exercises where the user does not want to specify a target weight
* Exercises where weight varies between sets

The user should be able to specify:

* Same weight for every set
* Different target weights per set

For example:

Bench Press

Set 1 → 20 kg × 12
Set 2 → 25 kg × 10
Set 3 → 30 kg × 8

The application should support this eventually, even if the initial UI defaults to the same target for all sets.

---

# 10. Exercise Ordering

The user must be able to reorder exercises within a workout.

Example:

1. Machine Chest Press
2. Incline Dumbbell Press
3. Cable Fly
4. Lateral Raise
5. Tricep Pushdown

Use drag-and-drop or an equivalent simple interaction.

The order should determine the order in which exercises appear during the workout.

---

# 11. Saving the Weekly Plan

After configuring the week, the user can save the workout plan.

The plan becomes the user's active routine.

The user should be able to edit the plan later.

Editing the future plan must not modify historical workouts that have already been completed.

This is important.

For example:

Week 1:

Machine Chest Press → 30 kg

Week 2:

Machine Chest Press → 35 kg

Changing the plan for Week 2 must not change Week 1's historical record.

---

# 12. Today Screen

The Today screen is the primary screen.

If today is Monday and the user created:

Push Day

The screen should display:

## Push Day

5 exercises

### 1. Machine Chest Press

Target:

3 × 10 @ 30 kg

### 2. Incline Dumbbell Press

Target:

3 × 10 @ 15 kg

### 3. Cable Fly

Target:

3 × 12 @ 10 kg

etc.

There should be a prominent:

"Start Workout"

button.

---

# 13. Workout Execution

When the user taps Start Workout, enter workout mode.

The UI should be optimized for use inside a gym.

The user should not have to navigate through multiple screens unnecessarily.

For every exercise, display the target prominently.

Example:

## Machine Chest Press

Target

3 sets × 10 reps × 30 kg

Then display the individual sets.

Set 1

Target:
10 reps × 30 kg

Actual:
Weight: [30]
Reps: [10]

[Complete Set]

Set 2

Target:
10 reps × 30 kg

Actual:
Weight: [30]
Reps: [10]

[Complete Set]

Set 3

Target:
10 reps × 30 kg

Actual:
Weight: [32.5]
Reps: [8]

[Complete Set]

---

# 14. Actual Performance Must Be Editable

The user must be able to record actual values independently of the target.

For every set, record:

* Actual weight
* Actual reps
* Completion status

The actual value may be higher or lower than the target.

Examples:

Target:

10 reps @ 30 kg

Actual:

12 reps @ 30 kg

Result:

Exceeded target

Another example:

Target:

10 reps @ 30 kg

Actual:

8 reps @ 30 kg

Result:

2 reps short

Another:

Target:

10 reps @ 30 kg

Actual:

10 reps @ 32.5 kg

Result:

Exceeded target weight

---

# 15. Target Comparison Logic

The application should compare target and actual performance.

At minimum, support these states:

### Achieved

Actual performance exactly matches the target.

Example:

Target: 10 reps @ 30 kg
Actual: 10 reps @ 30 kg

Result:

"Target achieved"

---

### Exceeded

Actual performance is greater than the target.

Examples:

Target: 10 reps @ 30 kg
Actual: 12 reps @ 30 kg

Result:

"2 reps above target"

Or:

Target: 10 reps @ 30 kg
Actual: 10 reps @ 32.5 kg

Result:

"2.5 kg above target"

---

### Below Target

Actual performance is below target.

Example:

Target: 10 reps @ 30 kg
Actual: 8 reps @ 30 kg

Result:

"2 reps short"

If weight is lower:

Target: 30 kg
Actual: 25 kg

Result:

"5 kg below target"

---

# 16. Set-Level Results

Every individual set should have its own status.

Example:

Machine Chest Press

| Set | Target     | Actual     | Result   |
| --- | ---------- | ---------- | -------- |
| 1   | 10 × 30 kg | 10 × 30 kg | Achieved |
| 2   | 10 × 30 kg | 12 × 30 kg | +2 reps  |
| 3   | 10 × 30 kg | 8 × 30 kg  | -2 reps  |

This information must be stored historically.

---

# 17. Exercise-Level Summary

After completing an exercise, show a compact summary.

Example:

Machine Chest Press

3/3 sets completed

Target:
30 kg × 10

Actual:
30 kg × 10
30 kg × 12
30 kg × 8

Summary:

"Target achieved overall"

or:

"2 reps short overall"

The exact aggregation logic should be consistent and clearly defined.

---

# 18. Workout Progress

During the workout, show overall progress.

Example:

Workout Progress

3 / 15 sets completed

20%

As sets are completed, update this dynamically.

Also show:

Exercises:
2 / 5 completed

Sets:
6 / 15 completed

This gives the user a clear sense of progress.

---

# 19. Completing the Workout

At the end, show a workout summary.

Example:

## Workout Complete

Push Day

5 / 5 exercises completed

15 / 15 sets completed

Target performance:

12 sets achieved
2 sets exceeded
1 set below target

Workout completion:

93%

The user should be able to finish/save the workout.

---

# 20. Incomplete Workouts

If the user exits the workout before finishing, the workout should not be automatically marked as completed.

Save the current workout as:

"In Progress"

When the user opens the app again, show:

"Continue Workout"

The user should be able to resume from where they stopped.

---

# 21. Skipping Exercises or Sets

The user should be able to skip an exercise or set.

Example:

"Skip Set"

The application should record that the set was skipped rather than pretending that it was completed.

Similarly:

"Skip Exercise"

should record the exercise as skipped.

This is important for accurate adherence tracking.

---

# 22. History

Create a dedicated History section.

The user should be able to view previous workout sessions chronologically.

Example:

August 21, 2026

Push Day

5 exercises
15 sets
14 completed
1 skipped

August 20, 2026

Rest Day

August 19, 2026

Pull Day

4 exercises
12 sets
12 completed

---

# 23. Calendar View

The History section should eventually provide a calendar.

Each day can show a simple status:

* Completed workout
* Partially completed
* Rest day
* Missed workout
* No plan

Selecting a date opens that day's workout details.

---

# 24. Exercise History

The user should be able to select an individual exercise and see its historical performance.

Example:

Machine Chest Press

Previous workouts:

August 22

Set 1: 30 kg × 10
Set 2: 30 kg × 10
Set 3: 32.5 kg × 8

August 15

Set 1: 30 kg × 10
Set 2: 30 kg × 9
Set 3: 30 kg × 8

August 8

Set 1: 25 kg × 10
Set 2: 25 kg × 10
Set 3: 25 kg × 10

This should make progression immediately visible.

---

# 25. Exercise Progress Visualization

For each exercise, eventually provide graphs for:

* Weight progression
* Reps progression
* Total volume
* Best set
* Estimated 1RM where applicable

Example:

Machine Chest Press

Weight progression:

25 kg → 27.5 kg → 30 kg → 32.5 kg

The goal is to make long-term improvement easy to understand.

---

# 26. Volume Tracking

Calculate training volume where applicable.

Basic volume:

Weight × Reps

For example:

30 kg × 10 = 300 kg volume

For an exercise:

Set 1: 30 × 10 = 300
Set 2: 30 × 10 = 300
Set 3: 32.5 × 8 = 260

Total:

860 kg

Display this in the exercise history.

For bodyweight exercises where weight is not recorded, volume calculations can be omitted or handled separately.

---

# 27. Workout Adherence

The application should track whether the user is actually following the plan.

Useful metrics:

* Planned workouts
* Completed workouts
* Missed workouts
* Partial workouts
* Rest days
* Workout completion percentage
* Planned sets vs completed sets
* Planned reps vs completed reps

Example:

Weekly adherence:

4 / 5 workouts completed

80%

---

# 28. Planned vs Actual Dashboard

A useful future dashboard should show:

### This Week

Workouts:
4 / 5

Sets:
42 / 45

Exercises:
18 / 20

Average workout completion:
93%

This gives the user a simple measure of whether they are actually following their routine.

---

# 29. Exercise Library

Create a structured exercise database.

Each exercise should have:

* Name
* Primary muscle group
* Secondary muscle groups
* Equipment
* Exercise type
* Instructions
* Optional image/video
* Whether weight is applicable

Examples:

Machine Chest Press

Primary muscle:
Chest

Secondary:
Triceps, Front Delts

Equipment:
Machine

The exercise library should be searchable.

---

# 30. Custom Exercises

Allow users to create their own exercises.

Example:

"Custom Cable Variation"

The user should be able to specify:

* Name
* Muscle group
* Equipment
* Optional instructions

Custom exercises should behave exactly like built-in exercises when added to workouts.

---

# 31. Plan Editing

The user must be able to modify their weekly plan.

Actions:

* Add exercise
* Remove exercise
* Edit targets
* Reorder exercises
* Rename day
* Convert workout day to rest day
* Convert rest day to workout day
* Duplicate a day
* Duplicate an exercise

Plan modifications should apply to future workouts without corrupting historical workout records.

---

# 32. Future Plan Versions

The data model should support changes to the workout plan over time.

For example:

Week 1:

Leg Press → 80 kg

Week 5:

Leg Press → 100 kg

Historical Week 1 should still display 80 kg as its target.

Do not simply store one mutable workout template and use it to reconstruct historical workouts.

Historical workouts should preserve the plan/targets that existed when the workout was performed.

---

# 33. Rest Day Behavior

If today is a planned rest day, the Today screen should be extremely simple.

Example:

## Rest Day

No workout planned today.

Recovery day.

Tomorrow:

Pull Day

The user can optionally see tomorrow's planned workout.

---

# 34. Gym-Friendly UX

The application is primarily intended to be used while exercising.

Therefore:

* Large touch targets
* Large numbers
* Minimal typing
* High contrast
* Clear visual hierarchy
* Quick set completion
* Easy weight/reps editing
* Minimal navigation
* Persistent workout state
* Fast interactions

The user should be able to record a set in a few seconds.

Avoid overly complicated forms.

---

# 35. Automatic Defaults

When starting a new workout, the application can pre-fill actual values using the planned target.

Example:

Target:

10 reps
30 kg

Actual input initially displays:

30 kg
10 reps

The user can quickly change them if needed.

This significantly reduces typing.

---

# 36. Previous Performance

When performing an exercise, show the user's previous performance.

Example:

Machine Chest Press

Target:
30 kg × 10

Last workout:
30 kg × 10
30 kg × 10
30 kg × 8

This allows the user to understand what they previously achieved before starting the exercise.

Eventually, show:

"Last time: 30 kg × 10"

This should be visible without requiring the user to open History.

---

# 37. Personal Records

A future feature should detect personal records.

Examples:

* Highest weight
* Highest reps at a given weight
* Highest total volume
* Most reps
* Best estimated 1RM

Example:

"New PR"

32.5 kg × 10

The initial version does not need an advanced PR system, but the underlying data model should make this possible.

---

# 38. Data Model

The application should conceptually separate these entities:

### User

* id
* settings

### Exercise

* id
* name
* muscle_group
* equipment
* type
* is_custom

### WorkoutPlan

* id
* name
* active
* created_at
* updated_at

### PlanDay

* id
* workout_plan_id
* weekday
* custom_name
* is_rest_day
* order

### PlannedExercise

* id
* plan_day_id
* exercise_id
* order

### PlannedSet

* id
* planned_exercise_id
* set_number
* target_reps
* target_weight

### WorkoutSession

* id
* plan_day_id
* date
* status
* started_at
* completed_at

### PerformedExercise

* id
* workout_session_id
* exercise_id
* order

### PerformedSet

* id
* performed_exercise_id
* set_number
* actual_reps
* actual_weight
* status
* completed_at

The exact database technology can be chosen later.

---

# 39. Important Historical Data Rule

Never derive historical workout data exclusively from the current workout plan.

When a workout starts, create a workout-session record containing the targets that were applicable at that time.

This ensures that changing the plan later does not alter historical records.

Example:

Current plan:

Machine Chest Press → 40 kg

Historical workout:

Machine Chest Press → 30 kg

History must continue to show 30 kg.

---

# 40. Empty States

Design useful empty states.

No plan:

"Your week is empty."

"Create your workout plan to get started."

No workout today:

"Rest Day"

No history:

"Your completed workouts will appear here."

No exercise history:

"Complete this exercise to start building your history."

---

# 41. Initial MVP

The first version should NOT attempt to implement every possible feature.

The MVP should contain:

### Plan

* Weekly plan
* Custom day names
* Rest days
* Add exercises
* Reorder exercises
* Target sets
* Target reps
* Optional target weight
* Edit/delete exercises

### Today

* Today's workout
* Start workout
* Exercise targets
* Set-by-set tracking
* Actual reps
* Actual weight
* Set completion
* Target comparison
* Workout progress
* Finish workout

### History

* Workout history
* Date
* Exercises
* Sets
* Actual performance
* Target vs actual comparison
* Exercise-level history

### Exercise Library

* Built-in exercises
* Search
* Custom exercises

Do not prioritize advanced analytics, social features, nutrition, AI coaching, or wearable integration in the MVP.

---

# 42. Visual Design

Use a modern, minimal fitness application aesthetic.

The UI should feel:

* Clean
* Premium
* Functional
* Fast
* Uncluttered
* Data-focused

Avoid overly aggressive bodybuilding aesthetics.

Use cards where appropriate, but do not make every element a floating card.

Important information should have strong visual hierarchy.

For example:

EXERCISE NAME

30 kg × 10 reps

3 sets

should be immediately readable.

---

# 43. Responsive Design

The application should work well on:

* Mobile phones
* Tablets
* Desktop browsers

Mobile should be the primary experience because the application is expected to be used inside a gym.

The workout execution screen should be optimized specifically for mobile.

---

# 44. UX Flow

The primary user journey should be:

Open app

↓

Create Plan

↓

Select Monday

↓

Rename Monday → Push Day

↓

Add Machine Chest Press

↓

Set 3 sets × 10 reps × 30 kg

↓

Add more exercises

↓

Configure remaining days

↓

Save Plan

↓

Open app on Monday

↓

See Push Day

↓

Start Workout

↓

Complete Set 1

↓

Record actual reps/weight

↓

Complete Set 2

↓

Complete Set 3

↓

Move to next exercise

↓

Complete workout

↓

View workout summary

↓

Later open History

↓

Select Machine Chest Press

↓

View previous sets and progression

---

# 45. Future Features

Design the architecture so the following can be added later without rebuilding the core system:

* Exercise progress graphs
* Personal records
* Workout streaks
* Automatic progressive overload suggestions
* Rest timers
* Exercise instructions
* Exercise videos
* Superset support
* Dropsets
* Warm-up sets
* Failure/RIR/RPE tracking
* Notes per set
* Workout notes
* Body measurements
* Bodyweight tracking
* Export to CSV/JSON
* Cloud synchronization
* Authentication
* Multiple workout plans
* Deload weeks
* Workout templates
* Exercise substitutions
* Notifications
* Wearable integration

These are future features and should not complicate the initial MVP.

---

# 46. Product Success Criteria

The application succeeds if a user can:

1. Create a weekly workout plan in a few minutes.
2. Clearly understand today's workout immediately after opening the app.
3. Start a workout with one tap.
4. Record each set with minimal interaction.
5. See exactly how actual performance compares to the target.
6. Finish a workout and receive a clear summary.
7. Return weeks later and understand exactly what they previously did.
8. See measurable progression for individual exercises.
9. Change their current routine without corrupting historical records.

The application should prioritize **speed, clarity, accurate historical data, and frictionless workout logging** above feature quantity.

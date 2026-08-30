import type {NavigatorScreenParams} from '@react-navigation/native';

/**
 * Two tabs, not five.
 *
 * Plan and History were sections of their own until they became buttons on
 * the Workout tab's header, and the exercise library moved inside Settings.
 * The screens did not change — only how you reach them — so each former
 * section is now a span of the stack it was folded into.
 */
export type RootTabParamList = {
  Workout: NavigatorScreenParams<WorkoutStackParamList> | undefined;
  Settings: NavigatorScreenParams<SettingsStackParamList> | undefined;
};

/**
 * Everything reachable from the Workout tab: the session itself, the whole
 * plan builder, and the whole of history.
 *
 * One stack rather than three, because a button that pushes is the only reason
 * any of them is on screen — and back then returns to the tab's home screen,
 * which is what a button implies and what a tab could never do.
 */
export type WorkoutStackParamList = {
  /**
   * The tab's landing screen. It cannot simply be called `Workout` — that is
   * the tab, and sharing the name made navigate() ambiguous.
   */
  WorkoutHome: undefined;
  /**
   * The session you are inside: one set at a time, full screen. Named for the
   * thing it operates on rather than the tab it belongs to, because `Workout`
   * is taken twice over already.
   */
  Session: undefined;
  /**
   * `swap` replaces the movement in one slot rather than appending a new
   * exercise (U6); `performedExerciseId` names the slot.
   */
  WorkoutExercisePicker:
    | {mode?: 'add'}
    | {mode: 'swap'; performedExerciseId: string}
    | undefined;
  /**
   * The same editor Settings uses, registered here as well so a custom
   * exercise can be made without leaving the plan builder or a workout
   * (complaint 5). React Navigation resolves a name within the current
   * navigator first, so back returns to the picker rather than another tab.
   */
  ExerciseEditor: {id?: string; initialName?: string} | undefined;

  // ---- the plan, reached by the button on the top right ----
  PlanWeek: undefined;
  PlanDay: {weekday: number};
  PlanExercisePicker: {weekday: number};
  PlanTargetEditor: {weekday: number; exerciseIndex: number};
  PlanCopyDay: {weekday: number};
  PlanHistory: undefined;

  // ---- history, reached by the button on the top left ----
  //
  // One screen, not two. The rolling-fortnight timeline and the calendar
  // listed the same days twice over, so the list moved onto the calendar and
  // the timeline went with it.
  HistoryCalendar: undefined;
  /** Local midnight of the day to open. */
  DayDetail: {date: number};
  ExerciseHistory: {exerciseId: string};
};

/**
 * The plan and history screens live in the Workout stack now, so these are the
 * same list under the names those screens already use. Kept rather than
 * renamed because the names still say something true about which part of the
 * app a screen belongs to — and because being one stack is precisely what
 * lets a plan screen open a day of history without crossing a navigator.
 */
export type PlanStackParamList = WorkoutStackParamList;
export type HistoryStackParamList = WorkoutStackParamList;

/** Settings, and the exercise library that now sits inside it. */
export type SettingsStackParamList = {
  SettingsHome: undefined;
  ExerciseList: undefined;
  ExerciseDetail: {id: string};
  /** No id means "create a new one"; `initialName` seeds it from a search. */
  ExerciseEditor: {id?: string; initialName?: string} | undefined;
  ExerciseHistory: {exerciseId: string};
};

/** The library moved into Settings; this is the name its screens already use. */
export type ExercisesStackParamList = SettingsStackParamList;

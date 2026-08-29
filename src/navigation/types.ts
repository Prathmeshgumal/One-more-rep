import type {NavigatorScreenParams} from '@react-navigation/native';

/**
 * Two tabs, not five.
 *
 * Plan and History were sections of their own until they became buttons on
 * Today's header, and the exercise library moved inside Settings. The screens
 * did not change — only how you reach them — so each former section is now a
 * span of the stack it was folded into.
 */
export type RootTabParamList = {
  Today: NavigatorScreenParams<TodayStackParamList> | undefined;
  Settings: NavigatorScreenParams<SettingsStackParamList> | undefined;
};

/**
 * Everything reachable from Today: the workout itself, the whole plan builder,
 * and the whole of history.
 *
 * One stack rather than three, because a button that pushes is the only reason
 * any of them is on screen — and back then returns to Today, which is what a
 * button implies and what a tab could never do.
 */
export type TodayStackParamList = {
  /** Renamed from `Today`: sharing the tab's name made navigate() ambiguous. */
  TodayHome: undefined;
  Workout: undefined;
  ExerciseSummary: {exerciseIndex: number};
  WorkoutComplete: undefined;
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

  // ---- the plan, reached by the button on Today's right ----
  PlanWeek: undefined;
  PlanDay: {weekday: number};
  PlanExercisePicker: {weekday: number};
  PlanTargetEditor: {weekday: number; exerciseIndex: number};
  PlanCopyDay: {weekday: number};
  PlanHistory: undefined;

  // ---- history, reached by the button on Today's left ----
  HistoryTimeline: undefined;
  HistoryCalendar: undefined;
  /** Local midnight of the day to open. */
  DayDetail: {date: number};
  ExerciseHistory: {exerciseId: string};
};

/**
 * The plan and history screens live in the Today stack now, so these are the
 * same list under the names those screens already use. Kept rather than
 * renamed because the names still say something true about which part of the
 * app a screen belongs to — and because being one stack is precisely what
 * lets a plan screen open a day of history without crossing a navigator.
 */
export type PlanStackParamList = TodayStackParamList;
export type HistoryStackParamList = TodayStackParamList;

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

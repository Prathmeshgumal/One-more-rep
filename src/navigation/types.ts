import type {NavigatorScreenParams} from '@react-navigation/native';

/**
 * `NavigatorScreenParams` rather than `undefined` on the stacks that get
 * navigated into from another tab — Today's "All exercises" opens the History
 * stack at a specific day. Typed here rather than cast at the call site, so a
 * wrong screen name or a missing date is a compile error.
 */
export type RootTabParamList = {
  Today: NavigatorScreenParams<TodayStackParamList> | undefined;
  Plan: NavigatorScreenParams<PlanStackParamList> | undefined;
  History: NavigatorScreenParams<HistoryStackParamList> | undefined;
  Exercises: NavigatorScreenParams<ExercisesStackParamList> | undefined;
  Settings: undefined;
};

export type ExercisesStackParamList = {
  ExerciseList: undefined;
  ExerciseDetail: {id: string};
  /** No id means "create a new one"; `initialName` seeds it from a search. */
  ExerciseEditor: {id?: string; initialName?: string} | undefined;
  ExerciseHistory: {exerciseId: string};
};

export type HistoryStackParamList = {
  HistoryTimeline: undefined;
  HistoryCalendar: undefined;
  /** Local midnight of the day to open. */
  DayDetail: {date: number};
  ExerciseHistory: {exerciseId: string};
};

export type PlanStackParamList = {
  PlanWeek: undefined;
  PlanDay: {weekday: number};
  PlanExercisePicker: {weekday: number};
  PlanTargetEditor: {weekday: number; exerciseIndex: number};
  /**
   * The same editor the Exercises tab uses, registered here as well so a
   * custom exercise can be made without leaving the plan builder (complaint 5).
   * React Navigation resolves a name within the current navigator first, so
   * back returns to the picker rather than dropping you in another tab.
   */
  ExerciseEditor: {id?: string; initialName?: string} | undefined;
  PlanCopyDay: {weekday: number};
  PlanHistory: undefined;
};

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
  /** Registered here too, for the same reason as on the Plan stack. */
  ExerciseEditor: {id?: string; initialName?: string} | undefined;
};

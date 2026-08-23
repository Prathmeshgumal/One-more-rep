export type RootTabParamList = {
  Today: undefined;
  Plan: undefined;
  History: undefined;
  Exercises: undefined;
  Settings: undefined;
};

export type ExercisesStackParamList = {
  ExerciseList: undefined;
  ExerciseDetail: {id: string};
  /** No id means "create a new one". */
  ExerciseEditor: {id?: string};
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
  PlanCopyDay: {weekday: number};
  PlanHistory: undefined;
};

export type TodayStackParamList = {
  Today: undefined;
  Workout: undefined;
  ExerciseSummary: {exerciseIndex: number};
  WorkoutComplete: undefined;
  WorkoutExercisePicker: undefined;
};

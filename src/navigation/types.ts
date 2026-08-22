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
};

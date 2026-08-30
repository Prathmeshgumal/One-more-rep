import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {useTheme, space, radius} from '@/theme';
import {useSettingsQuery} from '@/features/settings/useSettings';
import type {WorkoutStackParamList} from '@/navigation/types';
import {FocusSet, targetLabel, type FocusMode} from './FocusSet';
import {FocusFooter} from './FocusFooter';
import {UndoBanner} from './UndoBanner';
import {SetRail, RAIL_HEIGHT} from './SetRail';
import {SetTapZones} from './SetTapZones';
import {SessionPeek} from './SessionPeek';
import {NoteSheet} from './NoteSheet';
import {NumberPad} from '@/ui/NumberPad';
import {ExerciseActions} from './ExerciseActions';
import {FinishSheet} from './FinishSheet';
import {useActiveSet} from './useActiveSet';
import {weightInPlay} from './weightInPlay';
import {
  flattenSets,
  firstPendingIndex,
  nextPendingAfter,
  allDecided,
  recordedCount,
  type SetCursor,
} from './sessionCursor';
import {
  useTodaySessionQuery,
  usePreviousPerformanceQuery,
  useCompleteSet,
  useSkipSet,
  useSkipExercise,
  useFinishExercise,
  useAddSet,
  useFinishWorkout,
} from './useSession';
import {
  useRestoreSet,
  useSetExerciseNotes,
  useRemoveExercise,
  useRemoveSet,
  useMoveExercise,
} from './useSessionEditing';
import {useDatabase} from '@/providers/DatabaseGate';
import {snapshotSet, type SetSnapshot} from '@/repositories/sessionRepo';

/**
 * The workout, one set at a time.
 *
 * This replaces a screen where a single exercise with five sets was 591dp of a
 * 720dp viewport, and where every ✓ pushed the live row 94dp further down
 * without the list following it. Here nothing scrolls at all: the set you are
 * on has the screen, the rail above carries the rest of the session, and the
 * controls never move.
 *
 * The screen holds one number — an index into the session flattened to a run
 * of sets. "Next" then means the same thing whether the next set is in this
 * exercise or the one after it.
 */
/**
 * What actually gets written to `actualWeight`.
 *
 * Whatever is on screen, with one exception: a zero on a set that has no
 * weight of its own is not a measurement. That is §26 — a bodyweight movement
 * records no weight rather than a zero — and it still applies to a set that
 * had weight added and then stepped back down to nothing. You took the plate
 * off; the ledger should say so by staying empty, not by claiming you lifted
 * nought kilos.
 */
function weightToWrite(cursor: SetCursor, onScreen: number | null) {
  if (onScreen === 0 && !weightInPlay(cursor.exercise, cursor.set)) {
    return null;
  }
  return onScreen;
}

export function SessionScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<WorkoutStackParamList>>();

  const {data: session, isFetching} = useTodaySessionQuery();
  const {data: settings} = useSettingsQuery();
  const active = useActiveSet();
  const db = useDatabase();
  const complete = useCompleteSet();
  const skip = useSkipSet();
  const restore = useRestoreSet();
  const skipExercise = useSkipExercise();
  const finishExercise = useFinishExercise();
  const addSet = useAddSet();
  const setNotes = useSetExerciseNotes();
  const removeExercise = useRemoveExercise();
  const removeSet = useRemoveSet();
  const moveExercise = useMoveExercise();
  const finishWorkout = useFinishWorkout();

  const [focusIndex, setFocusIndex] = useState(0);
  const [peekOpen, setPeekOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  /** Which of the two numbers the pad is open on, if either. */
  const [editing, setEditing] = useState<'reps' | 'weight' | null>(null);

  // Memoised because the record and advance callbacks close over it: a fresh
  // array every render would rebuild them every render, and the undo timer
  // hangs off one of them.
  const cursors = useMemo(
    () => (session ? flattenSets(session) : []),
    [session],
  );
  const cursor: SetCursor | undefined = cursors[focusIndex];

  const {data: previous} = usePreviousPerformanceQuery(
    cursor?.exercise.exerciseId ?? '',
  );

  /**
   * Spec 6.4: an in-progress session resumes at the first pending set.
   *
   * Gaining focus only *asks* for the alignment; the effect below performs it
   * once the query has settled. Aligning inside the focus callback itself
   * looked simpler and was wrong: on a cold open the session has not arrived
   * yet, and on a return the refetch is still in flight, so it aligned against
   * stale data and then never corrected — you came back to a workout sitting
   * on a set you had already recorded.
   */
  const wantsAlign = useRef(true);

  useFocusEffect(
    useCallback(() => {
      wantsAlign.current = true;
    }, []),
  );

  useEffect(() => {
    if (!wantsAlign.current || !session || isFetching) {
      return;
    }
    wantsAlign.current = false;
    setFocusIndex(firstPendingIndex(flattenSets(session)));
  }, [session, isFetching]);

  /**
   * The session can get shorter underneath the screen — a plan edit that drops
   * a set now reaches a running workout — and the focus is a position, not an
   * identity. Left alone it points past the end and the screen renders
   * nothing at all.
   */
  useEffect(() => {
    if (cursors.length > 0 && focusIndex > cursors.length - 1) {
      setFocusIndex(cursors.length - 1);
    }
  }, [cursors.length, focusIndex]);

  /**
   * §35: the controls arrive holding the target. A set being corrected opens
   * on what was recorded instead — you are fixing a number, so the number that
   * was typed is the better starting point than the one it aimed at. A bonus
   * set has no target at all, so the last thing actually lifted on this
   * exercise beats an empty field in a gym.
   */
  useEffect(() => {
    if (!cursor || active.setId === cursor.set.id) {
      return;
    }
    const {set, exercise} = cursor;
    const lastRecorded = [...exercise.sets]
      .reverse()
      .find(s => s.status === 'completed');
    active.load({
      setId: set.id,
      weight:
        set.actualWeight ??
        set.targetWeight ??
        lastRecorded?.actualWeight ??
        (exercise.weightApplicable ? 0 : null),
      reps: set.actualReps ?? set.targetReps ?? lastRecorded?.actualReps ?? 10,
    });
  }, [cursor, active]);

  /**
   * What the last write overwrote, so it can be put back.
   *
   * Held here rather than in the store: it describes this screen's last four
   * seconds, not the set, and it must not survive leaving the workout — an
   * Undo offered after a remount would restore a set you had long moved past.
   */
  const [undo, setUndo] = useState<{
    setId: string;
    index: number;
    snapshot: SetSnapshot;
    message: string;
  } | null>(null);

  const clearUndo = useCallback(() => setUndo(null), []);

  const onUndo = useCallback(() => {
    if (!undo) {
      return;
    }
    const {setId, snapshot, index} = undo;
    setUndo(null);
    restore.mutate(
      {setId, snapshot},
      // Back to the set it came from, not to wherever the advance landed:
      // undoing a record and staying on the next set would leave you looking
      // at a different exercise than the one you just corrected.
      {onSuccess: () => setFocusIndex(index)},
    );
  }, [undo, restore]);

  /**
   * Records the set, then moves to the next one still to be decided.
   *
   * Forward only — `nextPendingAfter` never wraps — so a set skipped on
   * purpose stays skipped unless you go back to it deliberately.
   */
  const onRecord = useCallback(async () => {
    if (!cursor) {
      return;
    }
    // Read before the write, not after: this is what Undo restores.
    const snapshot = await snapshotSet(db, cursor.set.id);
    const weight = weightToWrite(cursor, active.weight);
    const reps = active.reps;
    complete.mutate(
      {setId: cursor.set.id, actualReps: reps, actualWeight: weight},
      {
        onSuccess: () => {
          setUndo({
            setId: cursor.set.id,
            index: cursor.index,
            snapshot,
            message: `Set ${cursor.setNumber} recorded — ${reps} reps`,
          });
          const next = nextPendingAfter(cursors, cursor.index);
          if (next !== null) {
            setFocusIndex(next);
            return;
          }
          // Nothing pending anywhere: this was the last set. In a flow with no
          // list to fall back to there is no other natural end, so the sheet
          // arrives on its own rather than waiting to be found.
          setFinishOpen(true);
        },
      },
    );
  }, [cursor, cursors, db, active, complete]);

  /**
   * Saves a correction to a set already decided, then returns to the live one.
   *
   * Deliberately not `onRecord`: that advances to the next *pending* set,
   * which after correcting set 2 of exercise 1 would be set 3 — walking you
   * backwards through a workout you had already reached the end of. An
   * amendment ends where it started, at whatever is genuinely next.
   */
  const onSaveAmendment = useCallback(() => {
    if (!cursor) {
      return;
    }
    const live = firstPendingIndex(cursors);
    complete.mutate(
      {
        setId: cursor.set.id,
        actualReps: active.reps,
        actualWeight: weightToWrite(cursor, active.weight),
      },
      {onSuccess: () => setFocusIndex(live)},
    );
  }, [cursor, cursors, active, complete]);

  /** Leaves the record alone and goes back to where the work is. */
  const onCancelAmendment = useCallback(() => {
    setFocusIndex(firstPendingIndex(cursors));
  }, [cursors]);

  /** §21: skipped, with actuals left empty. Never pretend it happened. */
  const onSkip = useCallback(async () => {
    if (!cursor) {
      return;
    }
    const snapshot = await snapshotSet(db, cursor.set.id);
    skip.mutate(cursor.set.id, {
      onSuccess: () =>
        setUndo({
          setId: cursor.set.id,
          index: cursor.index,
          snapshot,
          message: `Set ${cursor.setNumber} skipped`,
        }),
    });
  }, [cursor, db, skip]);

  /** The body's own Undo, on a set that is already skipped. */
  const onUndoSkip = useCallback(() => {
    if (!cursor) {
      return;
    }
    restore.mutate({
      setId: cursor.set.id,
      snapshot: {
        status: 'pending',
        actualReps: null,
        actualWeight: null,
        completedAt: null,
      },
    });
  }, [cursor, restore]);

  const onAdvance = useCallback(() => {
    if (!cursor) {
      return;
    }
    const next = nextPendingAfter(cursors, cursor.index);
    if (next !== null) {
      setFocusIndex(next);
    }
  }, [cursor, cursors]);

  /** Moves focus to a set named by id — how the peek and the rail navigate. */
  const jumpToSet = useCallback(
    (setId: string) => {
      const found = cursors.findIndex(c => c.set.id === setId);
      if (found >= 0) {
        setFocusIndex(found);
      }
    },
    [cursors],
  );

  /**
   * U11: finishing and skipping are different acts, and the difference is
   * whether anything actually happened. An exercise with three of four sets
   * recorded is finished, not skipped — calling it skipped understates the
   * work, which is how it came back from the phone.
   */
  const onFinishExercise = useCallback(() => {
    if (!cursor) {
      return;
    }
    const id = cursor.exercise.id;
    const anyRecorded = cursor.exercise.sets.some(
      s => s.status === 'completed',
    );
    const run = anyRecorded ? finishExercise : skipExercise;
    run.mutate(id, {
      onSuccess: () => {
        // Land on the first set of whatever is next rather than on the last
        // set of what was just closed.
        const next = cursors.find(
          c => c.index > cursor.index && c.exercise.id !== id,
        );
        if (next) {
          setFocusIndex(next.index);
        }
      },
    });
  }, [cursor, cursors, finishExercise, skipExercise]);

  /**
   * A set added by mistake, taken back (U10).
   *
   * Focus steps back one so the screen is not left pointing at a set that no
   * longer exists — the index is a position, and the list just got shorter.
   */
  const onRemoveSet = useCallback(() => {
    if (!cursor) {
      return;
    }
    const target = Math.max(0, cursor.index - 1);
    removeSet.mutate(cursor.set.id, {onSuccess: () => setFocusIndex(target)});
  }, [cursor, removeSet]);

  /** A bonus set: no target, appended to this exercise, focused immediately. */
  const onAddSet = useCallback(() => {
    if (!cursor) {
      return;
    }
    const id = cursor.exercise.id;
    const before = cursor.exercise.sets.length;
    addSet.mutate(id, {
      onSuccess: () => {
        // The new set is the last one on this exercise. Counted from the
        // exercise's first cursor, because the flat index moves when an
        // earlier exercise gains a set.
        const first = cursors.find(c => c.exercise.id === id);
        if (first) {
          setFocusIndex(first.index + before);
        }
      },
    });
  }, [cursor, cursors, addSet]);

  if (!session || !cursor) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  const unit = settings?.unit ?? 'kg';
  const increment = settings?.defaultIncrement ?? 0.5;

  const mode: FocusMode =
    cursor.set.status === 'skipped'
      ? 'skipped'
      : cursor.set.status === 'completed'
      ? 'amending'
      : 'live';

  // The same set number from last time, not the first one: on set four, what
  // you did on set four is the useful comparison, and it is usually not what
  // you did on set one. Falls back to the last set recorded, because last week
  // may have been a shorter session.
  const lastTime =
    previous?.sets[cursor.setNumber - 1] ??
    previous?.sets[previous.sets.length - 1] ??
    null;
  const previousLabel = lastTime
    ? `last time ${lastTime.reps}${
        lastTime.weight ? ` × ${lastTime.weight} ${unit}` : ''
      }`
    : null;

  /**
   * Weight is on this set if the catalogue or the plan put it there, or if
   * you put it there yourself during the session. The third case is why the
   * store's `null` matters: `active.load` resolves to `null` exactly when no
   * weight applies anywhere, so a non-null value is an answer, not a default.
   */
  const weightShown =
    weightInPlay(cursor.exercise, cursor.set) || active.weight !== null;

  const padCaption = previousLabel
    ? `${targetLabel(cursor.set, unit)} · ${previousLabel}`
    : targetLabel(cursor.set, unit);

  const done = recordedCount(cursors);
  const everythingDecided = allDecided(cursors);

  // Names where the primary button goes, so it can say so. Crossing into
  // another exercise names the exercise; staying inside one names the set.
  const nextIndex = nextPendingAfter(cursors, cursor.index);
  const next = nextIndex === null ? null : cursors[nextIndex]!;
  const nextLabel = !next
    ? null
    : next.exercise.id === cursor.exercise.id
    ? `set ${next.setNumber}`
    : next.exercise.name;

  return (
    <View
      style={[
        styles.root,
        {backgroundColor: colors.paper, paddingTop: insets.top},
      ]}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close workout"
          hitSlop={space.md}
          onPress={() => navigation.goBack()}
          style={styles.icon}>
          <AppText variant="h1" color="muted">
            ✕
          </AppText>
        </Pressable>
        <View style={styles.title}>
          <AppText variant="h2" numberOfLines={1}>
            {session.dayName}
          </AppText>
          <AppText variant="mono" color="muted">
            {`${done} of ${cursors.length} recorded`}
          </AppText>
        </View>
        {/* Ending early is always available — the sheet says what saving will
            do to whatever is left. It stands out only once the work is
            genuinely done. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Finish workout"
          hitSlop={space.sm}
          onPress={() => setFinishOpen(true)}
          style={[
            styles.finish,
            {
              backgroundColor: everythingDecided
                ? colors.plate
                : colors.plateSoft,
            },
          ]}>
          <AppText
            variant="mono"
            style={{color: everythingDecided ? colors.plateInk : colors.plate}}>
            FINISH
          </AppText>
        </Pressable>
      </View>

      <SetRail
        cursors={cursors}
        focusIndex={focusIndex}
        amending={mode === 'amending'}
        onJump={setFocusIndex}
      />

      {/* The zones span the body and nothing else — never the header, never
          the action block — and are drawn first, so the steppers, the numeral
          and the footer all sit above them and win any overlap. */}
      <View style={styles.body}>
        <SetTapZones
          canGoBack={focusIndex > 0}
          canGoForward={focusIndex < cursors.length - 1}
          onBack={() => setFocusIndex(focusIndex - 1)}
          onForward={() => setFocusIndex(focusIndex + 1)}
        />

        <FocusSet
          cursor={cursor}
          mode={mode}
          reps={active.reps}
          weight={active.weight}
          unit={unit}
          increment={increment}
          previousLabel={previousLabel}
          onStepReps={active.stepReps}
          onStepWeight={active.stepWeight}
          weightShown={weightShown}
          onEditReps={() => setEditing('reps')}
          onEditWeight={() => setEditing('weight')}
          onAddWeight={() => setEditing('weight')}
          onUndoSkip={onUndoSkip}
        />
      </View>

      {/* Every control you can reach mid-set, in one thumb arc: the block you
          press, and the four you rarely do. */}
      <View style={{paddingBottom: insets.bottom}}>
        <FocusFooter
          mode={mode}
          reps={active.reps}
          weight={active.weight}
          unit={unit}
          weightInPlay={weightShown}
          nextLabel={nextLabel}
          done={done}
          total={cursors.length}
          exerciseName={cursor.exercise.name}
          hasNote={Boolean(cursor.exercise.notes)}
          busy={complete.isPending || skip.isPending || restore.isPending}
          onRecord={onRecord}
          onSkip={onSkip}
          onSaveAmendment={onSaveAmendment}
          onCancelAmendment={onCancelAmendment}
          onAdvance={onAdvance}
          onOpenSession={() => setPeekOpen(true)}
          onOpenNote={() => setNoteOpen(true)}
          onOpenMenu={() => setMenuOpen(true)}
        />
      </View>

      {/* One pad, told which number it is on. Both write through the store's
          absolute setters — a typed 62.5 is not expressible as a delta from
          whatever happened to be there before. */}
      <NumberPad
        visible={editing === 'reps'}
        title="reps"
        value={active.reps}
        min={1}
        max={999}
        caption={padCaption}
        confirmLabel={v => `Set ${v} reps`}
        onSubmit={v => {
          active.setReps(v);
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
      <NumberPad
        visible={editing === 'weight'}
        title="weight"
        value={active.weight ?? 0}
        unit={unit}
        min={0}
        max={999}
        allowDecimal
        caption={padCaption}
        confirmLabel={v => `Set ${v} ${unit}`}
        onSubmit={v => {
          active.setWeight(v);
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />

      <SessionPeek
        visible={peekOpen}
        session={session}
        unit={unit}
        liveSetId={cursor.set.id}
        onSelectSet={jumpToSet}
        onClose={() => setPeekOpen(false)}
      />

      <ExerciseActions
        visible={menuOpen}
        exercise={cursor.exercise}
        set={cursor.set}
        setNumber={cursor.setNumber}
        isFirst={cursor.exerciseNumber === 1}
        isLast={cursor.exerciseNumber === cursor.exerciseCount}
        onClose={() => setMenuOpen(false)}
        onAddSet={onAddSet}
        onRemoveSet={onRemoveSet}
        onFinish={onFinishExercise}
        onSwap={() =>
          navigation.navigate('WorkoutExercisePicker', {
            mode: 'swap',
            performedExerciseId: cursor.exercise.id,
          })
        }
        onNote={() => setNoteOpen(true)}
        onRemove={() =>
          removeExercise.mutate(cursor.exercise.id, {
            // The removed exercise's sets leave the session, so the index has
            // to come back inside it or the screen renders nothing.
            onSuccess: () => setFocusIndex(0),
          })
        }
        onMove={direction =>
          moveExercise.mutate({
            performedExerciseId: cursor.exercise.id,
            direction,
          })
        }
      />

      <FinishSheet
        visible={finishOpen}
        session={session}
        unit={unit}
        busy={finishWorkout.isPending}
        onSave={() =>
          finishWorkout.mutate(session.id, {
            onSuccess: () => {
              setFinishOpen(false);
              // Back to the tab home, which now renders the finished day.
              navigation.goBack();
            },
          })
        }
        onClose={() => setFinishOpen(false)}
      />

      <NoteSheet
        visible={noteOpen}
        exerciseName={cursor.exercise.name}
        note={cursor.exercise.notes}
        onSave={note => {
          setNotes.mutate({
            performedExerciseId: cursor.exercise.id,
            notes: note,
          });
          setNoteOpen(false);
        }}
        onClose={() => setNoteOpen(false)}
      />

      {undo ? (
        // Keyed on the message: recording a second set inside the window
        // restarts the timer against the new one rather than inheriting
        // whatever was left of the old one's four seconds.
        <View
          style={[
            styles.undo,
            {top: insets.top + HEADER_HEIGHT + RAIL_HEIGHT + space.sm},
          ]}>
          <UndoBanner
            key={undo.message}
            message={undo.message}
            onUndo={onUndo}
            onExpire={clearUndo}
          />
        </View>
      ) : null}
    </View>
  );
}

/** The bar above the rail. The undo banner clears both. */
const HEADER_HEIGHT = 56;

const styles = StyleSheet.create({
  root: {flex: 1},
  body: {flex: 1},
  /**
   * 56, not 45. Everything in this bar was a size below what it should have
   * been — a 15px day name over an 11px count, beside an 11px FINISH — against
   * a 112px numeral and a 96dp Record block. It read as a caption strip rather
   * than as the header of the screen you are working on.
   */
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {flex: 1},
  finish: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  undo: {position: 'absolute', left: 0, right: 0},
});

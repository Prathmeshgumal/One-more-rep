import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, TextInput, View} from 'react-native';
import {AppText} from '@/ui/Text';
import {StatusChip} from '@/ui/StatusChip';
import {useTheme, type as typeScale, space, radius} from '@/theme';
import {targetLine} from '@/domain/format';
import {aggregateExercise} from '@/domain/sessionProgress';
import type {
  SessionExercise,
  PreviousPerformance,
} from '@/repositories/sessionRepo';
import {SetRow} from './SetRow';

/**
 * One exercise in the workout list (U1).
 *
 * Collapsed it is a name, how far through it is, what it is asking for, and —
 * once it is finished — how that went. Expanded it is the sets themselves.
 *
 * The collapsed state deliberately keeps the target line. Complaint 6 was that
 * you could not see what set 3 wanted while you were standing on set 1; a card
 * that hides its target when shut would reintroduce that one level up.
 *
 * It owns no state. Which card is open is the screen's business (U2 — exactly
 * one), and so is which set is active, because both are decisions about the
 * workout rather than about this card.
 */
export function WorkoutExerciseCard({
  exercise,
  expanded,
  onToggle,
  onLayoutY,
  unit,
  increment,
  previous,
  activeSetId,
  activeWeight,
  activeReps,
  onSetWeight,
  onSetReps,
  onCompleteSet,
  onEditSet,
  onRemoveSet,
  onMore,
  onNote,
  children,
}: {
  exercise: SessionExercise;
  expanded: boolean;
  onToggle: () => void;
  /** Feeds the screen's auto-scroll; see SessionScreen. */
  onLayoutY: (y: number) => void;
  unit: string;
  increment: number;
  previous?: PreviousPerformance | null;
  activeSetId?: string | null;
  activeWeight?: number | null;
  activeReps?: number;
  onSetWeight?: (value: number) => void;
  onSetReps?: (value: number) => void;
  onCompleteSet?: () => void;
  /** U10: reopens a set that has already been recorded or skipped. */
  onEditSet?: (setId: string) => void;
  /** Only ever called for a set that was added by hand and never used. */
  onRemoveSet?: (setId: string) => void;
  /** Opens this exercise's menu. Absent means the card has no menu. */
  onMore?: () => void;
  /** Commits what was written in the note field. */
  onNote?: (notes: string | null) => void;
  /** The action row — add set, skip, notes. Only drawn when open. */
  children?: React.ReactNode;
}) {
  const {colors} = useTheme();

  // A bonus set carries no target, and neither does a planned set whose target
  // never made it in — so both are excluded from the target line rather than
  // being described as something they are not. The guard is what tells the
  // compiler that too.
  const planned = exercise.sets.filter(
    (s): s is typeof s & {targetReps: number} =>
      !s.isUnplanned && s.targetReps !== null,
  );
  const recorded = exercise.sets.filter(s => s.status === 'completed').length;
  const finished = exercise.status !== 'pending';

  const aggregate = aggregateExercise(exercise.sets, exercise.weightApplicable);

  // A skipped exercise says so plainly. Anything else that is finished reports
  // how it went against its target — ochre when short, never red.
  const verdict = !finished
    ? null
    : exercise.status === 'skipped'
    ? ('skipped' as const)
    : aggregate.status;

  return (
    <View
      testID="exercise-card"
      onLayout={event => onLayoutY(event.nativeEvent.layout.y)}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: expanded ? colors.plate : colors.ruleSoft,
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={exercise.name}
        accessibilityState={{expanded}}
        accessibilityHint={
          expanded ? 'Closes this exercise' : 'Opens this exercise'
        }
        onPress={onToggle}
        style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="bodyStrong" color={finished ? 'muted' : 'ink'}>
            {exercise.name}
          </AppText>
          {exercise.substitutedFromName ? (
            // U6: the slot was served by something else, and history should
            // say so rather than quietly report the planned movement.
            <AppText variant="printed" color="plate">
              {`swapped from ${exercise.substitutedFromName}`}
            </AppText>
          ) : null}
          {/* Full contrast, open or shut: this is the number you are working
              towards, not decoration. */}
          <AppText variant="printed" color="muted">
            {targetLine(planned, unit)}
          </AppText>
        </View>
        <View style={styles.headerMeta}>
          <AppText variant="mono" color="ink2">
            {`${recorded} / ${exercise.sets.length} sets`}
          </AppText>
          {verdict ? <StatusChip status={verdict} /> : null}
        </View>
      </Pressable>

      {onMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More for ${exercise.name}`}
          accessibilityHint="Swap, move, remove or summarise this exercise"
          hitSlop={space.sm}
          onPress={onMore}
          style={styles.more}>
          <AppText variant="bodyStrong" color="muted">
            ⋯
          </AppText>
        </Pressable>
      ) : null}

      {expanded ? (
        <View style={styles.body}>
          {previous ? (
            <AppText variant="printed" color="muted">
              {`last time ${previous.sets
                .map(
                  s =>
                    `${s.weight === null ? '' : `${s.weight.toFixed(1)}×`}${
                      s.reps
                    }`,
                )
                .join(' · ')}`}
            </AppText>
          ) : null}

          {exercise.sets.map((set, index) => {
            const isActive = activeSetId === set.id;
            // The most recent weight recorded *before* this set, so a ghost
            // never suggests a number from further down the exercise.
            const fallbackWeight =
              [...exercise.sets.slice(0, index)]
                .reverse()
                .find(s => s.status === 'completed' && s.actualWeight !== null)
                ?.actualWeight ?? null;
            return (
              <SetRow
                key={set.id}
                setNumber={set.setNumber}
                targetReps={set.targetReps}
                targetWeight={set.targetWeight}
                actualReps={isActive ? activeReps ?? null : set.actualReps}
                actualWeight={
                  isActive ? activeWeight ?? null : set.actualWeight
                }
                status={set.status}
                isUnplanned={set.isUnplanned}
                isActive={isActive}
                unit={unit}
                increment={increment}
                weightApplicable={exercise.weightApplicable}
                fallbackWeight={fallbackWeight}
                onSetWeight={isActive ? onSetWeight : undefined}
                onSetReps={isActive ? onSetReps : undefined}
                onComplete={isActive ? onCompleteSet : undefined}
                onEdit={
                  !isActive && set.status !== 'pending' && onEditSet
                    ? () => onEditSet(set.id)
                    : undefined
                }
                onRemove={
                  // Work you invented, and never the last set standing — an
                  // exercise with no sets can never be finished. Recorded or
                  // not: a bonus set deleted only ever gives you less credit,
                  // never more, so there is nothing to protect against.
                  set.isUnplanned && exercise.sets.length > 1 && onRemoveSet
                    ? () => onRemoveSet(set.id)
                    : undefined
                }
              />
            );
          })}

          {onNote ? (
            <NoteField
              name={exercise.name}
              value={exercise.notes}
              onCommit={onNote}
            />
          ) : null}

          {children}
        </View>
      ) : null}
    </View>
  );
}

/** How long after the last keystroke a note is written. */
const NOTE_DEBOUNCE_MS = 800;

/**
 * What happened on this exercise today, in the user's own words.
 *
 * Committing on blur alone is not enough, and the emulator proved it: Android's
 * hardware back dismisses the keyboard **without** blurring the field, so the
 * note was silently lost — the same trap `PlanDayScreen` documents, which ate
 * a rename on the device once already. Collapsing the card or opening another
 * one unmounts the field, and neither blurs it first either.
 *
 * So there are three ways out and all of them are covered: a debounce while
 * typing, so a note is never more than a second from being saved even if the
 * process is killed; the unmount, for every way the field can disappear; and
 * blur, which is simply the fastest of the three when it does happen.
 *
 * The draft is seeded once and then left alone. `exercise` is a fresh object on
 * every refetch, and an unguarded effect would overwrite what is being typed.
 */
function NoteField({
  name,
  value,
  onCommit,
}: {
  name: string;
  value: string | null;
  onCommit: (notes: string | null) => void;
}) {
  const {colors} = useTheme();
  const [text, setText] = useState(value ?? '');
  const saved = useRef(value ?? '');

  // Read through refs so the unmount cleanup sees the last thing typed rather
  // than what was on screen when the effect was registered.
  const latest = useRef({text, onCommit});
  latest.current = {text, onCommit};

  const commit = useCallback(() => {
    const {text: current, onCommit: commitNow} = latest.current;
    const trimmed = current.trim();
    if (trimmed === saved.current) {
      return;
    }
    saved.current = trimmed;
    commitNow(trimmed === '' ? null : trimmed);
  }, []);

  useEffect(() => {
    // Only when the note changed underneath us — a different exercise, or a
    // write that landed elsewhere. Never mid-typing.
    if ((value ?? '') !== saved.current) {
      saved.current = value ?? '';
      setText(value ?? '');
    }
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(commit, NOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, commit]);

  // Every way the field can vanish without a blur.
  useEffect(() => commit, [commit]);

  return (
    <TextInput
      accessibilityLabel={`Note for ${name}`}
      value={text}
      onChangeText={setText}
      onBlur={commit}
      placeholder="How did it feel?"
      placeholderTextColor={colors.faint}
      multiline
      style={[
        typeScale.body,
        styles.note,
        {
          color: colors.ink,
          backgroundColor: colors.surface2,
          borderColor: colors.ruleSoft,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    // 44px minimum, so a collapsed card is a comfortable target with a
    // chalked-up thumb.
    minHeight: 44,
  },
  headerText: {flex: 1, gap: 2},
  headerMeta: {alignItems: 'flex-end', gap: space.xs},
  body: {paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm},
  more: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    padding: space.sm,
  },
  note: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 44,
    textAlignVertical: 'top',
  },
});

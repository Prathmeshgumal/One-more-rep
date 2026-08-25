import React from 'react';
import {View} from 'react-native';
import {render, renderHook, act} from '@testing-library/react-native';
import {captureRef} from 'react-native-view-shot';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import {ThemeProvider} from '@/theme';
import {DayImageCard} from '@/features/history/DayImageCard';
import {useSaveDayImage} from '@/features/history/useSaveDayImage';
import type {Session, SessionSet} from '@/repositories/sessionRepo';

const set = (n: number, over: Partial<SessionSet> = {}): SessionSet => ({
  id: `s${n}`,
  setNumber: n,
  targetReps: 10,
  targetWeight: 60,
  actualReps: 10,
  actualWeight: 60,
  status: 'completed',
  isUnplanned: false,
  completedAt: null,
  ...over,
});

const session = (over: Partial<Session> = {}): Session => ({
  id: 'ws1',
  date: new Date(2026, 7, 24).getTime(),
  dayName: 'Push Day',
  status: 'completed',
  startedAt: 0,
  completedAt: 1,
  planVersionId: 'pv1',
  planDayId: 'pd1',
  exercises: [
    {
      id: 'pex1',
      exerciseId: 'bench',
      name: 'Bench Press',
      equipment: 'barbell',
      weightApplicable: true,
      plannedExerciseId: 'pe1',
      orderIndex: 0,
      status: 'completed',
      notes: null,
      substitutedFromName: null,
      sets: [set(1), set(2), set(3, {actualReps: 8})],
    },
  ],
  ...over,
});

const renderCard = (s: Session = session()) =>
  render(
    <ThemeProvider>
      <DayImageCard session={s} unit="kg" />
    </ThemeProvider>,
  );

describe('DayImageCard', () => {
  it('names the day and dates it', async () => {
    const view = await renderCard();
    expect(view.getByText('Push Day')).toBeTruthy();
    expect(view.getByText('ONE MORE REP')).toBeTruthy();
  });

  it('draws every exercise and every set that happened', async () => {
    const view = await renderCard();
    expect(view.getByText('Bench Press')).toBeTruthy();
    expect(view.getAllByText('10 × 60.0')).toHaveLength(2);
    expect(view.getByText('8 × 60.0')).toBeTruthy();
  });

  it('totals what was moved', async () => {
    const view = await renderCard();
    // 10x60 + 10x60 + 8x60 = 1,680
    expect(view.getByText('3 sets · 1,680 kg')).toBeTruthy();
  });

  // Honest inside the app, noise in something you send to a friend.
  it('leaves skipped sets out of the picture', async () => {
    const view = await renderCard(
      session({
        exercises: [
          {
            ...session().exercises[0]!,
            sets: [
              set(1),
              set(2, {status: 'skipped', actualReps: null, actualWeight: null}),
            ],
          },
        ],
      }),
    );
    expect(view.queryByText('Skipped')).toBeNull();
    expect(view.getByText('1 sets · 600 kg')).toBeTruthy();
  });

  it('drops an exercise nothing was recorded on', async () => {
    const base = session();
    const view = await renderCard(
      session({
        exercises: [
          base.exercises[0]!,
          {
            ...base.exercises[0]!,
            id: 'pex2',
            name: 'Cable Fly',
            sets: [
              set(1, {status: 'skipped', actualReps: null, actualWeight: null}),
            ],
          },
        ],
      }),
    );
    expect(view.queryByText('Cable Fly')).toBeNull();
  });

  it('says just the count for a bodyweight day', async () => {
    const base = session();
    const view = await renderCard(
      session({
        exercises: [
          {
            ...base.exercises[0]!,
            name: 'Pull-up',
            weightApplicable: false,
            sets: [
              set(1, {actualWeight: null, targetWeight: null}),
              set(2, {actualWeight: null, targetWeight: null}),
            ],
          },
        ],
      }),
    );
    // No volume line at all, and the reps stand alone with no "x weight".
    expect(view.getByText('2 sets')).toBeTruthy();
    expect(view.getAllByText('10')).toHaveLength(2);
    expect(view.queryByText(/×/)).toBeNull();
  });
});

describe('useSaveDayImage', () => {
  beforeEach(() => {
    (captureRef as jest.Mock).mockClear();
    (CameraRoll.save as jest.Mock).mockClear();
    (captureRef as jest.Mock).mockResolvedValue('/tmp/shot.png');
    (CameraRoll.save as jest.Mock).mockResolvedValue('content://media/1');
  });

  it('starts with nothing to report', async () => {
    const {result} = await renderHook(() => useSaveDayImage());
    expect(result.current.status).toBe('idle');
    expect(result.current.message).toBeNull();
  });

  it('captures the card and files it in an album', async () => {
    const ref = React.createRef<React.ComponentRef<typeof View>>();
    const {result} = await renderHook(() => useSaveDayImage());

    await act(() => result.current.save(ref));

    expect(captureRef).toHaveBeenCalledWith(ref, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });
    expect(CameraRoll.save).toHaveBeenCalledWith('/tmp/shot.png', {
      type: 'photo',
      album: 'One More Rep',
    });
    expect(result.current.status).toBe('saved');
    expect(result.current.message).toMatch(/gallery/i);
  });

  // A save that quietly does nothing is worse than one that says it could not:
  // you find out when you go looking for the picture and it is not there.
  it('reports a failure rather than claiming success', async () => {
    (CameraRoll.save as jest.Mock).mockRejectedValueOnce(
      new Error('permission denied'),
    );
    const ref = React.createRef<React.ComponentRef<typeof View>>();
    const {result} = await renderHook(() => useSaveDayImage());

    await act(() => result.current.save(ref));

    expect(result.current.status).toBe('failed');
    expect(result.current.message).toMatch(/permission denied/);
  });

  it('reports a capture that failed, not just a write that did', async () => {
    (captureRef as jest.Mock).mockRejectedValueOnce(new Error('no view'));
    const ref = React.createRef<React.ComponentRef<typeof View>>();
    const {result} = await renderHook(() => useSaveDayImage());

    await act(() => result.current.save(ref));

    expect(result.current.status).toBe('failed');
    expect(CameraRoll.save).not.toHaveBeenCalled();
  });
});

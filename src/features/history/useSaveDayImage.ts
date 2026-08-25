import {useCallback, useState} from 'react';
import {PermissionsAndroid, Platform, View} from 'react-native';
import {captureRef} from 'react-native-view-shot';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * The ref the card is captured through. `View` is a function component in RN
 * 0.87, so the useful type is its rendered instance rather than the component
 * itself — worth naming once rather than spelling out at every call site.
 */
export type ShotRef = React.RefObject<React.ComponentRef<typeof View> | null>;

/** The album the image lands in, so it is findable rather than loose. */
const ALBUM = 'One More Rep';

/**
 * From Android 10 an app needs no permission to add its own picture to the
 * gallery. Below that it does, and this app's minSdkVersion is 24.
 */
async function mayWrite(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) >= 29) {
    return true;
  }
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Rasterises the day's card and writes it to the phone's gallery.
 *
 * Reports what happened rather than failing quietly: a save that silently does
 * nothing is worse than one that says it could not, because you find out when
 * you go looking for the picture and it is not there.
 */
export function useSaveDayImage() {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const save = useCallback(async (ref: ShotRef) => {
    setStatus('saving');
    setMessage(null);
    try {
      if (!(await mayWrite())) {
        setStatus('failed');
        setMessage('Saving needs permission to write to your photos.');
        return;
      }
      const uri = await captureRef(ref, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await CameraRoll.save(uri, {type: 'photo', album: ALBUM});
      setStatus('saved');
      setMessage(`Saved to your gallery, in "${ALBUM}".`);
    } catch (error) {
      setStatus('failed');
      setMessage(
        error instanceof Error
          ? `Couldn't save the image: ${error.message}`
          : "Couldn't save the image.",
      );
    }
  }, []);

  return {status, message, save};
}

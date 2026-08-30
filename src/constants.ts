export const APP_NAME = 'One More Rep';

/**
 * The version this build calls itself, shown in Settings.
 *
 * Duplicated in `package.json` and `android/app/build.gradle` because neither
 * can read a TypeScript constant, and reading the version at runtime would
 * mean a native module for one line of text. `__tests__/toolchain.test.ts`
 * fails if the three ever disagree, which is the part that actually matters —
 * a tester reporting a bug against the wrong version is worse than no version
 * at all.
 */
export const APP_VERSION = '1.0.0';

/**
 * The longest a note on an exercise may be.
 *
 * A note is "shoulder felt off, dropped to 15kg" — a sentence or two written
 * between sets, on a phone, with a barbell waiting. A thousand characters is
 * roughly two hundred words: far past anything anyone types standing up, and
 * short enough that the field cannot become somewhere a training diary
 * quietly accumulates inside a row that every history screen renders in full.
 *
 * The input stops at this; the repository refuses past it. Two enforcements
 * of one number, which is why the number lives here rather than in either.
 */
export const NOTE_MAX_LENGTH = 1000;

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

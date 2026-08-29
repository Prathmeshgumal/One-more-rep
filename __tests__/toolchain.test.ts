import fs from 'fs';
import path from 'path';
import {APP_NAME, APP_VERSION} from '@/constants';

describe('toolchain', () => {
  it('resolves the @/ path alias', () => {
    expect(APP_NAME).toBe('One More Rep');
  });
});

/**
 * The app's version lives in three files, because none of them can read the
 * others: package.json, android/app/build.gradle, and APP_VERSION for the
 * screen that prints it. A tester reporting a bug against the wrong version is
 * worse than showing no version at all, so this fails the moment they drift.
 */
describe('the app version', () => {
  const root = path.join(__dirname, '..');

  const fromPackageJson = (): string =>
    JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

  const fromGradle = (): string => {
    const gradle = fs.readFileSync(
      path.join(root, 'android', 'app', 'build.gradle'),
      'utf8',
    );
    return /versionName\s+"([^"]+)"/.exec(gradle)![1]!;
  };

  it('agrees across package.json, the Android build and the constant', () => {
    expect(fromGradle()).toBe(APP_VERSION);
    expect(fromPackageJson()).toBe(APP_VERSION);
  });

  it('is a three-part version, so a patch release has somewhere to go', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  // Android orders builds by this integer, not by the name. Play refuses an
  // upload whose code has not risen, and a sideloaded APK will not install
  // over a higher one.
  it('carries a whole-number versionCode', () => {
    const gradle = fs.readFileSync(
      path.join(root, 'android', 'app', 'build.gradle'),
      'utf8',
    );
    const code = /versionCode\s+(\d+)/.exec(gradle)![1]!;
    expect(Number.isInteger(Number(code))).toBe(true);
    expect(Number(code)).toBeGreaterThan(0);
  });
});

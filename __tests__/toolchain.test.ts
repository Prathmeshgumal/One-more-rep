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
    JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
      .version;

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

/**
 * The release APK was 87 MB: four CPU architectures in one file, and a dex
 * nobody had ever run R8 over. It is 27 MB now (docs/decisions.md, D42).
 *
 * Every line of that is a build-file flag, which is exactly the kind of thing
 * that gets flipped back while debugging something else and never flipped
 * again. Nothing about a slowly growing download is visible from inside the
 * app, so it is guarded here instead.
 */
describe('the release build stays small', () => {
  const root = path.join(__dirname, '..');
  const gradle = (): string =>
    fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8');

  it('runs R8 over release builds', () => {
    expect(gradle()).toMatch(/def enableProguardInReleaseBuilds\s*=\s*true/);
  });

  // Without minification the shrinker cannot run at all, so these two travel
  // together or the second is silently a no-op.
  it('shrinks resources alongside the code', () => {
    expect(gradle()).toMatch(/shrinkResources enableProguardInReleaseBuilds/);
    expect(gradle()).toMatch(/minifyEnabled enableProguardInReleaseBuilds/);
  });

  // x86 and x86_64 exist for emulators. Shipping them to phones was 43 MB of
  // the old 87 — half the download, for hardware no user has.
  it('splits release APKs per ABI, and only ARM ones', () => {
    const abi = /splits\s*\{[\s\S]*?abi\s*\{([\s\S]*?)\n {8}\}/.exec(gradle());
    expect(abi).not.toBeNull();
    const block = abi![1]!;
    expect(block).toContain('arm64-v8a');
    expect(block).toContain('armeabi-v7a');
    expect(block).toMatch(/universalApk false/);
    // The default list the build falls back to must name no emulator ABI.
    const fallback = /\?:\s*"([^"]+)"/.exec(block)?.[1] ?? '';
    expect(fallback).not.toMatch(/x86/);
  });

  // A universal APK would put both instruction sets back in one file.
  it('has no universal APK to fall back into', () => {
    expect(gradle()).not.toMatch(/universalApk true/);
  });
});

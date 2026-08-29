#!/usr/bin/env node
/**
 * Checks a built APK before it goes anywhere.
 *
 * The failure this exists to catch: a release signed with the **debug** key.
 * It installs, it runs, it looks completely normal — and anyone in the world
 * can forge an update over it, because that key ships inside every copy of
 * Android Studio. It also can never be re-signed with a real key without an
 * uninstall, which on an installed app means somebody's training history.
 *
 *   node scripts/verify-apk.mjs [path/to.apk]
 *
 * Defaults to the release output. Exits non-zero on anything worth stopping
 * for, so it can sit in front of a distribution step.
 */
import {execFileSync, execSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';

const DEFAULT_APK = path.join(
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk',
);

/** The certificate Android Studio ships. Never acceptable in a release. */
const DEBUG_KEY_MARKERS = ['CN=Android Debug', 'O=Android'];

function sdkRoot() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk'),
    'C:\\Android\\Sdk',
  ].filter(Boolean);
  const found = candidates.find(dir => existsSync(path.join(dir, 'build-tools')));
  if (!found) {
    throw new Error(
      'Could not find the Android SDK. Set ANDROID_HOME and try again.',
    );
  }
  return found;
}

/** The newest build-tools has the newest apksigner; any of them would do. */
function buildTool(name) {
  const root = path.join(sdkRoot(), 'build-tools');
  const versions = readdirSync(root).sort().reverse();
  for (const version of versions) {
    for (const file of [`${name}.bat`, name, `${name}.exe`]) {
      const candidate = path.join(root, version, file);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  throw new Error(`Could not find ${name} under ${root}`);
}

/**
 * Node 20 refuses to spawn a .bat or .cmd without a shell, which is most of
 * the Android build tools on Windows. Quoted because the SDK path may contain
 * spaces, and so may the APK path.
 */
const run = (cmd, args) => {
  const isBatch = /\.(bat|cmd)$/i.test(cmd);
  const options = {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024};
  if (!isBatch) {
    return execFileSync(cmd, args, options);
  }
  const quoted = [cmd, ...args].map(part => `"${part}"`).join(' ');
  return execSync(quoted, options);
};

function expectedVersion() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const gradle = readFileSync(
    path.join('android', 'app', 'build.gradle'),
    'utf8',
  );
  const name = /versionName\s+"([^"]+)"/.exec(gradle)?.[1];
  const code = /versionCode\s+(\d+)/.exec(gradle)?.[1];
  return {packageJson: pkg.version, name, code};
}

const apk = process.argv[2] ?? DEFAULT_APK;
const problems = [];

try {
  if (!existsSync(apk)) {
    throw new Error(
      `No APK at ${apk}. Build one first: npm run apk`,
    );
  }

  const certs = run(buildTool('apksigner'), [
    'verify',
    '--print-certs',
    apk,
  ]);
  const dn = /certificate DN:\s*(.+)/.exec(certs)?.[1]?.trim() ?? '(unknown)';
  const sha256 = /SHA-256 digest:\s*(\w+)/.exec(certs)?.[1] ?? '(unknown)';

  const badging = run(buildTool('aapt2'), ['dump', 'badging', apk]);
  const name = /versionName='([^']+)'/.exec(badging)?.[1];
  const code = /versionCode='(\d+)'/.exec(badging)?.[1];
  const pkgName = /package: name='([^']+)'/.exec(badging)?.[1];
  const minSdk = /minSdkVersion:'(\d+)'/.exec(badging)?.[1];

  const size = statSync(apk).size;
  const expected = expectedVersion();

  console.log(`APK        ${apk}`);
  console.log(`size       ${(size / 1024 / 1024).toFixed(0)} MB`);
  console.log(`package    ${pkgName}`);
  console.log(`version    ${name} (code ${code}), minSdk ${minSdk}`);
  console.log(`signed by  ${dn}`);
  console.log(`SHA-256    ${sha256}`);

  if (DEBUG_KEY_MARKERS.some(marker => dn.includes(marker))) {
    problems.push(
      'Signed with the DEBUG key. Do not distribute this — anyone can forge ' +
        'an update over it. Set ONEMOREREP_STORE_FILE in ~/.gradle/gradle.properties.',
    );
  }
  if (name !== expected.name) {
    problems.push(
      `The APK says ${name} but android/app/build.gradle says ${expected.name}. ` +
        'Stale build?',
    );
  }
  if (expected.packageJson !== expected.name) {
    problems.push(
      `package.json says ${expected.packageJson} but the Android build says ` +
        `${expected.name}. They must agree.`,
    );
  }
  if (code !== expected.code) {
    problems.push(`versionCode is ${code} in the APK, ${expected.code} in the build.`);
  }
} catch (error) {
  problems.push(error instanceof Error ? error.message : String(error));
}

if (problems.length > 0) {
  console.error('\nNOT OK:');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}
console.log('\nOK — signed with a real key, and the version matches the source.');

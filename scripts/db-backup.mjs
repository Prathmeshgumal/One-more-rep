#!/usr/bin/env node
/**
 * Copies the app's database off the phone, and puts one back.
 *
 * The app is in real use now, and `android:allowBackup="false"` means Android
 * keeps no copy of its own — so a wipe, a lost phone, or a mistaken uninstall
 * is the end of that training history. This is the safety net.
 *
 *   node scripts/db-backup.mjs pull            → backups/onemorerep-<stamp>.db
 *   node scripts/db-backup.mjs restore <file>  → puts that file back
 *   node scripts/db-backup.mjs list            → what has been kept
 *
 * `run-as` is what makes this work without root: it runs `cat` as the app's
 * own uid, which is the only uid allowed to read that directory. It therefore
 * only works on a debuggable build — which is every build this project makes.
 */
import {execFileSync, spawnSync} from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const PACKAGE = 'com.onemorerep';
const REMOTE = `databases/onemorerep.db`;
const ABSOLUTE_REMOTE = `/data/data/${PACKAGE}/${REMOTE}`;
const BACKUP_DIR = path.join(process.cwd(), 'backups');

/**
 * A whole database comes back through this pipe, and Node's default stdout
 * buffer is 1 MB. The database passed 950 KB within a fortnight of real use,
 * so the default would have started truncating backups almost immediately —
 * silently, since a truncated SQLite file still begins "SQLite format 3".
 */
const MAX_BUFFER = 256 * 1024 * 1024;

const adb = (args, options = {}) =>
  execFileSync('adb', args, {
    encoding: 'buffer',
    maxBuffer: MAX_BUFFER,
    ...options,
  });

function requireOneDevice() {
  const out = execFileSync('adb', ['devices'], {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  });
  const devices = out
    .split('\n')
    .slice(1)
    .map(line => line.trim())
    .filter(line => line.endsWith('\tdevice'))
    .map(line => line.split('\t')[0]);

  if (devices.length === 0) {
    throw new Error('No device. Plug the phone in and enable USB debugging.');
  }
  if (devices.length > 1) {
    throw new Error(
      `More than one device attached (${devices.join(', ')}). ` +
        'Disconnect the others, or unset the emulator.',
    );
  }
  return devices[0];
}

/** Refuses to back up nothing, which is the failure worth catching. */
function pull() {
  requireOneDevice();
  mkdirSync(BACKUP_DIR, {recursive: true});

  const bytes = adb(['exec-out', 'run-as', PACKAGE, 'cat', REMOTE]);
  if (bytes.length === 0) {
    throw new Error(
      `Read 0 bytes from ${ABSOLUTE_REMOTE}. Is the app installed, and is ` +
        'this a debuggable build?',
    );
  }
  // A SQLite file always starts with this. Without the check, a permission
  // error printed to stdout would be saved as a "backup" and trusted.
  const header = bytes.subarray(0, 15).toString('utf8');
  if (header !== 'SQLite format 3') {
    throw new Error(
      `That is not a SQLite database — it starts "${header}". Nothing saved.`,
    );
  }

  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  const file = path.join(BACKUP_DIR, `onemorerep-${stamp}.db`);
  writeFileSync(file, bytes);

  const size = statSync(file).size;
  if (size !== bytes.length) {
    throw new Error(`Wrote ${size} bytes but read ${bytes.length}. Not trusting that.`);
  }
  console.log(`Saved ${(size / 1024).toFixed(0)} KB to ${file}`);
}

function restore(file) {
  if (!file) {
    throw new Error('Which file? node scripts/db-backup.mjs restore <file>');
  }
  if (!existsSync(file)) {
    throw new Error(`No such file: ${file}`);
  }
  requireOneDevice();

  // Stop the app first: replacing the file under a live connection is how you
  // get a half-written database rather than a restored one.
  execFileSync('adb', ['shell', 'am', 'force-stop', PACKAGE]);

  // Through stdin as base64 rather than /sdcard: scoped storage means the app
  // cannot read /sdcard, so the obvious route silently truncates the file.
  // Encoded in this process — shelling out to node for it hit the 1 MB pipe
  // limit and failed the restore outright.
  const b64 = readFileSync(file).toString('base64');
  const result = spawnSync(
    'adb',
    ['shell', `run-as ${PACKAGE} sh -c 'base64 -d > ${REMOTE}'`],
    {input: b64, maxBuffer: MAX_BUFFER},
  );
  if (result.status !== 0) {
    throw new Error(`Restore failed: ${result.stderr?.toString() ?? 'unknown'}`);
  }

  // Read it back rather than trusting the exit code: the redirect runs inside
  // the device's shell, and a failure there does not always surface here.
  const landed = adb(['exec-out', 'run-as', PACKAGE, 'cat', REMOTE]);
  const expected = readFileSync(file);
  if (!landed.equals(expected)) {
    throw new Error(
      `Restore did not land: ${landed.length} bytes on the device against ` +
        `${expected.length} in the file. The app's data is unchanged.`,
    );
  }
  console.log(`Restored ${file} (${(expected.length / 1024).toFixed(0)} KB), verified byte for byte.`);
}

function list() {
  if (!existsSync(BACKUP_DIR)) {
    console.log('No backups yet. Run: npm run db:backup');
    return;
  }
  const files = readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .sort()
    .reverse();
  if (files.length === 0) {
    console.log('No backups yet. Run: npm run db:backup');
    return;
  }
  for (const f of files) {
    const {size, mtime} = statSync(path.join(BACKUP_DIR, f));
    console.log(
      `${f}  ${(size / 1024).toFixed(0).padStart(6)} KB  ${mtime.toISOString().slice(0, 16).replace('T', ' ')}`,
    );
  }
}

const [command, argument] = process.argv.slice(2);
try {
  if (command === 'pull' || command === undefined) {
    pull();
  } else if (command === 'restore') {
    restore(argument);
  } else if (command === 'list') {
    list();
  } else {
    console.error(`Unknown command "${command}". Use pull, restore or list.`);
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

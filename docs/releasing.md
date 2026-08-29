# Making a release

A repeatable checklist. The app is installed and in real use, so the two things
that matter most are that the build is signed with the **project's own key**
and that the version **goes up**.

Run everything from the repository root unless it says otherwise.

---

## 0. Back up the phone first

```bash
npm run db:backup          # → backups/onemorerep-<timestamp>.db
npm run db:backups         # what you have kept
```

`android:allowBackup="false"` means Android keeps no copy of its own. This is
the only copy of that training history, and it takes five seconds.

The backup script refuses to write anything that is not a real SQLite file, so
a permission error can never be saved as a "backup" you would later trust.

---

## 1. Make sure the tree is green

```bash
npm test
npm run typecheck
npm run lint
```

All three must pass. `npm test` includes the guards that matter here:

- **Migrations preserve existing data** — a database is seeded at the version a
  real phone is on, migrated forward, and every row checked. Nothing may drop a
  table or a column.
- **The version agrees** across `package.json`, `android/app/build.gradle` and
  `APP_VERSION`.

---

## 2. Bump the version

Three files, and a test fails the moment they disagree:

| File | Field |
|---|---|
| `package.json` | `"version"` |
| `android/app/build.gradle` | `versionName` |
| `src/constants.ts` | `APP_VERSION` |

**And raise `versionCode` in `android/app/build.gradle` by one.** It is a
separate integer and it is not optional:

- Android orders builds by it, not by the name.
- Play refuses an upload whose code has not risen.
- A sideloaded APK will not install over a higher one.

So `1.0.1` after `1.0.0` still needs `versionCode 2`. Currently on
**`1.0.0`, code 1**.

Then commit:

```bash
git add -A && git commit -m "chore: version x.y.z"
```

---

## 3. Build it

```bash
npm run apk        # gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

If the build fails on the keystore, it is almost always the two password lines
in `~/.gradle/gradle.properties` disagreeing. A PKCS12 keystore uses **one**
password for both the store and the key, so `ONEMOREREP_STORE_PASSWORD` and
`ONEMOREREP_KEY_PASSWORD` must be byte-for-byte identical. Check the password
itself without putting it anywhere:

```bash
keytool -list -keystore "android/app/one-more-rep.keystore"
```

It prompts, and does not echo. If it lists `one-more-rep` with a fingerprint,
that is the right password.

---

## 4. Verify before it goes anywhere

```bash
npm run apk:verify
```

Prints the signer, the fingerprint, the version and the size, and **exits
non-zero** if anything is wrong. It is checked against a deliberately
debug-signed APK, so the guard is known to bite.

What it is protecting you from: a release signed with the **debug** key
installs, runs and looks completely normal — and anyone in the world can forge
an update over it, because that key ships inside every copy of Android Studio.
It also can never be re-signed with a real key without an uninstall, which on
an installed app costs somebody their history.

The right answer looks like:

```
signed by  CN=Prathmesh Gumal, ...
SHA-256    37a5b0763b97020dbfa0a49c864e6a1a04670f4b90c6fdb456159032e9ee88bb
OK — signed with a real key, and the version matches the source.
```

**That fingerprint must never change.** If it does, every installed copy needs
an uninstall to accept an update.

---

## 5. Install and walk it

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

`-r` replaces in place and **keeps the data** — debug and release builds share
one signing key precisely so this works. If Android refuses with
`INSTALL_FAILED_UPDATE_INCOMPATIBLE`, the installed copy was signed with a
different key; uninstall, install, and restore the backup from step 0:

```bash
npm run db:restore -- backups/onemorerep-<stamp>.db
```

Then walk enough of the app to know it runs: start a workout, record a set,
finish it, open History. Settings prints the version at the foot — check it
says what you expect.

---

## 6. Tag and push

```bash
git tag -a vX.Y.Z -m "X.Y.Z — what changed"
git push origin main --follow-tags
```

---

## 7. Share it

Copy the APK somewhere with a useful name:

```bash
cp android/app/build/outputs/apk/release/app-release.apk one-more-rep-X.Y.Z.apk
```

`*.apk` is gitignored, so it will not land in the repository.

Whoever receives it needs to allow installs from whatever app they got it
through. It is about 87 MB because it carries all four CPU architectures;
splitting per architecture would get that to roughly 25 MB each, and is worth
doing if you send it around much.

---

## When you eventually publish to Play

Not needed for any of the above, and a different account password from the
keystore. Two differences when you get there:

- Play wants an **`.aab`** (`./gradlew bundleRelease`), not an APK.
- Play Signing will ask to hold the upload key. Read what it offers before
  accepting: it changes who can sign updates, and it is not easily undone.

---

## The rules underneath this

1. **The signing fingerprint never changes.** Changing it means every installed
   copy must be uninstalled — which destroys its data.
2. **`versionCode` only ever goes up.**
3. **Migrations are additive.** Never drop a table or a column, and only ever
   delete rows that are already orphans. There are tests for all three.
4. **Never run `adb shell pm clear com.onemorerep`.** It is the fastest way to
   destroy real training history, and there is no undo.

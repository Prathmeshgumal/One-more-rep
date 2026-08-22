// Downloads free-exercise-db's dataset to a gitignored working copy.
// The committed artefact is src/db/seed/exercises.json, not this.
//
// Licence verified 2026-08-22: The Unlicense (public domain — no attribution,
// no share-alike, commercial use permitted), which is what makes a Play Store
// release safe (D12). Re-check before any release:
//   https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md
import {writeFileSync, mkdirSync} from 'node:fs';

const URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const OUT = '.exercise-source/exercises.json';

const response = await fetch(URL);
if (!response.ok) {
  console.error(`Fetch failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}
const body = await response.text();
const parsed = JSON.parse(body);
if (!Array.isArray(parsed) || parsed.length < 500) {
  console.error(`Unexpected payload: ${parsed.length ?? 'not an array'} entries`);
  process.exit(1);
}

mkdirSync('.exercise-source', {recursive: true});
writeFileSync(OUT, body);
console.log(`Wrote ${parsed.length} source exercises to ${OUT}`);

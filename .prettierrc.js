/**
 * The React Native template's defaults, in full.
 *
 * `bracketSameLine` and `bracketSpacing` were missing here while every file in
 * the repo was written to them — so running Prettier reformatted the entire
 * codebase instead of the file you had touched, and nobody ran it. Restored so
 * the config describes the code that actually exists.
 */
module.exports = {
  arrowParens: 'avoid',
  bracketSameLine: true,
  bracketSpacing: false,
  singleQuote: true,
  trailingComma: 'all',
};

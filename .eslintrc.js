module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Build-time Node scripts, not app code. They are plain ESM running on
      // the installed Node, so they use top-level await and optional chaining
      // that the React Native preset's parser settings do not expect.
      files: ['scripts/**/*.mjs'],
      parserOptions: {ecmaVersion: 2022, sourceType: 'module'},
      env: {node: true, es2022: true},
    },
  ],
};

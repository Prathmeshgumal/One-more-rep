module.exports = {
  // Jest's 5s default is measured against a warm transform cache. The first
  // run after a batch of edits recompiles everything and takes roughly twice
  // as long, which timed out a screen test that does migrations, a seed and a
  // list render. Raising the ceiling removes the false failure without
  // weakening any assertion — nothing here should ever take fifteen seconds.
  testTimeout: 15000,
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {'^@/(.*)$': '<rootDir>/src/$1'},
  testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-navigation)/)',
  ],
};

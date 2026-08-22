module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {'^@/(.*)$': '<rootDir>/src/$1'},
  testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-navigation)/)',
  ],
};

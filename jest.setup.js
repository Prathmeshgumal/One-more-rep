// Test environment setup. Native module mocks are registered here.

// React 19 requires this flag before it will process state updates inside
// act(), which React Native Testing Library relies on.
global.IS_REACT_ACT_ENVIRONMENT = true;

// op-sqlite is a native module with no Node implementation. Tests that need a
// real database use __tests__/helpers/testDb.ts (better-sqlite3) instead.
jest.mock('@op-engineering/op-sqlite', () => ({
  open: () => {
    throw new Error('op-sqlite is unavailable under Jest. Use createTestDb().');
  },
}));

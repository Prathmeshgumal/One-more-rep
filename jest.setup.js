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

// The library ships its own mock; a hand-rolled one misses the contexts that
// React Navigation's tab bar consumes.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// Drag-to-reorder needs native gestures and worklets, neither of which exist
// under Jest. The gesture itself is proved on the device (Task 8, step 8);
// these mocks exist so screens that use it can still be rendered and asserted.
require('react-native-gesture-handler/jestSetup');

jest.mock('react-native-reorderable-list', () => {
  const React = require('react');
  const {View} = require('react-native');
  const ReorderableList = ({data, renderItem, keyExtractor}) =>
    React.createElement(
      View,
      null,
      (data ?? []).map((item, index) =>
        React.createElement(
          View,
          {key: keyExtractor ? keyExtractor(item, index) : index},
          renderItem({item, index}),
        ),
      ),
    );
  return {
    __esModule: true,
    default: ReorderableList,
    ReorderableListItem: View,
    useReorderableDrag: () => () => {},
    reorderItems: (list, from, to) => {
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    },
  };
});

// Two native modules with no Node implementation, added in R6. The image
// itself is asserted as a rendered card; what these mocks stand in for is the
// rasterising and the write to the gallery, neither of which exists off-device.
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => '/tmp/shot.png'),
}));

jest.mock('@react-native-camera-roll/camera-roll', () => ({
  CameraRoll: {save: jest.fn(async () => 'content://media/1')},
}));

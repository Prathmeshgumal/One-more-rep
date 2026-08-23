module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./'],
        alias: {'@': './src'},
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      },
    ],
    // Must be last. The worklets plugin rewrites worklet functions and expects
    // to see the output of every other transform. Reanimated 4 ships it here;
    // on Reanimated 3 the same plugin lived at 'react-native-reanimated/plugin'.
    'react-native-worklets/plugin',
  ],
};

const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // drizzle-orm ships ESM with extensioned internal imports ("../alias.js")
    // and declares them through its package "exports" map. Without this Metro
    // ignores that map and looks for "alias.js.android.js", which does not
    // exist, so the bundle fails to resolve.
    unstable_enablePackageExports: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

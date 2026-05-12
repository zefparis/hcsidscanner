const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const defaults = getDefaultConfig(projectRoot);

const rootModules = path.resolve(monorepoRoot, 'node_modules');

// Force singleton resolution for packages that register native views/modules.
// Without this, Metro may resolve the same package via two different paths in
// a monorepo watchFolders setup, causing "Tried to register two views" errors.
const singletons = [
  'react',
  'react-native',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-gesture-handler',
  'react-native-reanimated',
  '@react-navigation/native',
  '@react-navigation/stack',
  '@react-navigation/elements',
];

const extraNodeModules = {};
for (const name of singletons) {
  extraNodeModules[name] = path.resolve(rootModules, name);
}

const config = {
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [rootModules],
    extraNodeModules,
  },
};

const merged = mergeConfig(defaults, config);

// Strip options injected by newer @react-native/metro-config that RN 0.73's
// Metro validator does not recognise. Done after mergeConfig so the keys
// are not re-introduced.
if (merged.server) delete merged.server.tls;
if (merged.watcher) {
  delete merged.watcher.unstable_lazySha1;
  delete merged.watcher.unstable_autoSaveCache;
}

module.exports = merged;

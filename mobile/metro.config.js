// Monorepo-aware Metro config (design/10 § 2). The mobile app lives in an npm
// workspace and imports `@mmp/shared` (which re-exports the repo's pure
// `lib/recommendation`), so Metro must:
//   1. watch the repo root (to resolve files outside `mobile/`), and
//   2. resolve modules from both the app's and the root's `node_modules`.
// NativeWind is layered on top via `withNativeWind`.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so changes to `packages/shared` and `lib/` reload.
config.watchFolders = [workspaceRoot];

// 2. Let Metro resolve hoisted deps from the root, then app-local ones.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = withNativeWind(config, { input: "./global.css" });

/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";
import path from "path";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.overrideWebpackConfig((config) => {
  config.resolve = config.resolve || {};
  config.resolve.alias = {
    ...(config.resolve.alias || {}),
    "@shared": path.resolve(__dirname, "../shared"),
    "@game": path.resolve(__dirname, "../src/game"),
    // Stub out the Vite-only share module (uses import.meta.env) so the
    // HUD import chain doesn't break the Remotion webpack build.
    [path.resolve(__dirname, "../src/share")]: path.resolve(
      __dirname,
      "src/share-stub.ts",
    ),
  };
  return enableTailwind(config);
});

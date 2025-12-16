import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AppleNativeBindings } from "./types.js";

const require = createRequire(import.meta.url);
const currentDir = fileURLToPath(new URL(".", import.meta.url));

/**
 * Load the native Apple Speech module
 *
 * Returns null if the module cannot be loaded (e.g., on non-macOS platforms
 * or if the native module wasn't built).
 */
export function loadNativeModule(): AppleNativeBindings | null {
  try {
    // Try to load the pre-built native module
    // The module is built to: build/Release/apple_speech.node
    const modulePath = join(currentDir, "..", "..", "..", "build", "Release", "apple_speech.node");
    return require(modulePath) as AppleNativeBindings;
  } catch {
    // Native module not available
    return null;
  }
}

/**
 * Cached native module instance
 */
let cachedModule: AppleNativeBindings | null | undefined;

/**
 * Get the native Apple Speech module
 *
 * Throws an error if the module is not available.
 */
export function getNativeModule(): AppleNativeBindings {
  if (cachedModule === undefined) {
    cachedModule = loadNativeModule();
  }

  if (cachedModule === null) {
    throw new Error(
      "Apple Speech native module is not available. " +
        "Make sure you're on macOS and have built the native module with 'npm run build:native'."
    );
  }

  return cachedModule;
}

/**
 * Check if the native module is available
 */
export function isNativeModuleAvailable(): boolean {
  if (cachedModule === undefined) {
    cachedModule = loadNativeModule();
  }
  return cachedModule !== null;
}


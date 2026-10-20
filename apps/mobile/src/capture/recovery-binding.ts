/**
 * M2 — AsyncStorage binding for `RecoveryStorage`.
 *
 * The ONLY file that may import `@react-native-async-storage/async-storage`.
 * Structural typing keeps `tsc` green before the Expo deps land (same
 * pattern as `adapters/expo-binding.ts`).
 *
 * Install before use (device only):
 *   npx expo install @react-native-async-storage/async-storage
 */

import type { RecoveryStorage } from "./recovery.js";

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
};

export function createRecoveryStorage(native: AsyncStorageLike): RecoveryStorage {
  return {
    get: (key) => native.getItem(key),
    set: (key, value) => native.setItem(key, value),
    remove: (key) => native.removeItem(key),
    listKeys: async (prefix) => (await native.getAllKeys()).filter((k) => k.startsWith(prefix)),
  };
}

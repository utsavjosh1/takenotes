/**
 * M0 — Expo binding for `ExpoFileAdapter`.
 *
 * The ONLY file that may import `expo-file-system`. Everything else talks to
 * the `HostFilesystem` seam. Loaded on-device only — never imported by logic
 * tests (they use `MemoryHostFilesystem` or a fake `ExpoFsOps`).
 *
 * Install before use (M0 gate, device smoke only):
 *   npx expo install expo-file-system
 *
 * Uses structural typing (no `import ... from "expo-file-system"`) so `tsc`
 * stays green before the Expo deps land. After install, remove the
 * `ExpoNativeFs` structural type and import the real types.
 */

import { ExpoFileAdapter, type ExpoFsOps } from "./expo-filesystem.js";

/** Structural subset of the Expo File API we rely on (legacy + next). */
type ExpoNativeFs = {
  readAsStringAsync?: (uri: string, options?: { encoding?: string }) => Promise<string>;
  writeAsStringAsync?: (uri: string, contents: string, options?: { encoding?: string }) => Promise<void>;
  getInfoAsync?: (uri: string) => Promise<{ exists: boolean; isDirectory?: boolean; size?: number; modificationTime?: number }>;
  readDirectoryAsync?: (uri: string) => Promise<string[]>;
  makeDirectoryAsync?: (uri: string, options?: { intermediates?: boolean }) => Promise<void>;
  moveAsync?: (options: { from: string; to: string }) => Promise<void>;
  deleteAsync?: (uri: string, options?: { idempotent?: boolean }) => Promise<void>;
};

declare const expoFileSystem: ExpoNativeFs;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

/** Build the injected ops from the real Expo module. Call on-device only. */
export function createExpoFsOps(native: ExpoNativeFs = expoFileSystem): ExpoFsOps {
  return {
    async readBytes(uri: string): Promise<Uint8Array> {
      if (!native.readAsStringAsync) throw new Error("expo-file-system not installed (readAsStringAsync missing)");
      return base64ToBytes(await native.readAsStringAsync(uri, { encoding: "base64" }));
    },
    async writeBytes(uri: string, bytes: Uint8Array): Promise<void> {
      if (!native.writeAsStringAsync) throw new Error("expo-file-system not installed (writeAsStringAsync missing)");
      await native.writeAsStringAsync(uri, bytesToBase64(bytes), { encoding: "base64" });
    },
    async move(from: string, to: string): Promise<void> {
      if (!native.moveAsync) throw new Error("expo-file-system not installed (moveAsync missing)");
      await native.moveAsync({ from, to });
    },
    async mkdir(uri: string): Promise<void> {
      if (!native.makeDirectoryAsync) throw new Error("expo-file-system not installed (makeDirectoryAsync missing)");
      await native.makeDirectoryAsync(uri, { intermediates: true });
    },
    async deleteSilent(uri: string): Promise<void> {
      try {
        await native.deleteAsync?.(uri, { idempotent: true });
      } catch {
        /* best-effort tmp cleanup */
      }
    },
    async stat(uri: string) {
      if (!native.getInfoAsync) throw new Error("expo-file-system not installed (getInfoAsync missing)");
      const info = await native.getInfoAsync(uri);
      if (!info.exists) {
        const err = new Error(`ENOENT: ${uri}`) as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      return {
        size: info.size ?? 0,
        mtimeMs: (info.modificationTime ?? Date.now() / 1000) * 1000,
        isDirectory: info.isDirectory ?? false,
      };
    },
    async exists(uri: string): Promise<boolean> {
      if (!native.getInfoAsync) return false;
      try {
        return (await native.getInfoAsync(uri)).exists;
      } catch {
        return false;
      }
    },
    async readDir(uri: string) {
      if (!native.readDirectoryAsync || !native.getInfoAsync) {
        throw new Error("expo-file-system not installed (readDirectoryAsync missing)");
      }
      let names: string[];
      try {
        names = await native.readDirectoryAsync(uri);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/not (found|exist)|ENOENT|no such file/i.test(message)) {
          const e = new Error(`ENOENT: ${uri}`) as NodeJS.ErrnoException;
          e.code = "ENOENT";
          throw e;
        }
        throw err;
      }
      const base = uri.replace(/\/+$/, "");
      const out: Array<{ name: string; isDirectory: boolean; mtimeMs: number; size: number }> = [];
      for (const name of names) {
        try {
          const info = await native.getInfoAsync(`${base}/${name}`);
          out.push({
            name,
            isDirectory: info.isDirectory ?? false,
            size: info.size ?? 0,
            mtimeMs: (info.modificationTime ?? Date.now() / 1000) * 1000,
          });
        } catch {
          /* skip entries that vanish mid-list */
        }
      }
      return out;
    },
  };
}

/** One-liner for app startup: `new ExpoFileAdapter(createExpoFsOps(FileSystem))`. */
export function createExpoFileAdapter(native?: ExpoNativeFs): ExpoFileAdapter {
  return new ExpoFileAdapter(createExpoFsOps(native));
}

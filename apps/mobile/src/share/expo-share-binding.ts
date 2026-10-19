/**
 * M3 — Expo share binding (DocumentPicker + Sharing + cache write).
 *
 * The ONLY file that may import `expo-document-picker`, `expo-sharing`,
 * or use the cache dir for share-out. Everything else talks to
 * `importFiles` / `readForShare`. Structural typing keeps `tsc` green
 * before the Expo deps land (same pattern as the other bindings).
 *
 * Install before use (device only):
 *   npx expo install expo-document-picker expo-sharing expo-file-system
 */

import { importFiles, readForShare, type ImportResult, type IncomingFile } from "./import-export.js";
import type { MobileWorkspace } from "../workspace/mobile-workspace.js";
import type { DirectoryListing } from "../adapters/listing.js";

type DocumentPickerResult = {
  canceled: boolean;
  assets?: Array<{ name?: string | null; uri: string }>;
};

type DocumentPickerNative = {
  getDocumentAsync(options?: { multiple?: boolean; copyToCacheDirectory?: boolean }): Promise<DocumentPickerResult>;
};

type SharingNative = {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(uri: string, options?: { mimeType?: string; dialogTitle?: string }): Promise<void>;
};

type CacheFsNative = {
  writeAsStringAsync(uri: string, contents: string, options?: { encoding?: string }): Promise<void>;
  readAsStringAsync(uri: string, options?: { encoding?: string }): Promise<string>;
  getInfoAsync(uri: string): Promise<{ exists: boolean }>;
};

export type ShareDeps = {
  picker: DocumentPickerNative;
  sharing: SharingNative;
  cacheFs: CacheFsNative;
  /** `FileSystem.cacheDirectory` (ends with `/`), e.g. `file:///…/cache/`. */
  cacheDir: string;
};

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

/** Picker → `IncomingFile[]` (device only). */
export async function pickImportFiles(deps: ShareDeps): Promise<IncomingFile[]> {
  const res = await deps.picker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (res.canceled || !res.assets) return [];
  const out: IncomingFile[] = [];
  for (const a of res.assets) {
    if (!a.uri) continue;
    // Cache read is base64 through the legacy string API (see expo-binding).
    const b64 = await deps.cacheFs.readAsStringAsync(a.uri, { encoding: "base64" }).catch(() => null);
    if (b64 === null) continue;
    out.push({ name: a.name ?? a.uri.split("/").pop() ?? "import.md", bytes: base64ToBytes(b64) });
  }
  return out;
}

/** Full flow: pick → import into `dir`. */
export async function importFromPicker(
  deps: ShareDeps,
  ws: MobileWorkspace,
  lister: DirectoryListing,
  root: string,
  dir: string,
): Promise<ImportResult> {
  return importFiles(ws, lister, root, dir, await pickImportFiles(deps));
}

/** Share-out: write note to cache, open the sheet ("Open in Files" lives there). */
export async function shareNote(
  deps: ShareDeps,
  ws: MobileWorkspace,
  relativePath: string,
): Promise<{ shared: true } | { error: { code: "NOT_FOUND" | "UNAVAILABLE"; message: string } }> {
  const read = await readForShare(ws, relativePath);
  if ("error" in read) {
    return { error: { code: "NOT_FOUND", message: read.error.message } };
  }
  if (!(await deps.sharing.isAvailableAsync())) {
    return { error: { code: "UNAVAILABLE", message: "Sharing is not available on this device." } };
  }
  const safe = read.payload.filename.replace(/[^A-Za-z0-9._-]/g, "_") || "note.md";
  const uri = `${deps.cacheDir.replace(/\/+$/, "")}/share-${Date.now()}-${safe}`;
  await deps.cacheFs.writeAsStringAsync(uri, bytesToBase64(new TextEncoder().encode(read.payload.content)), {
    encoding: "base64",
  });
  await deps.sharing.shareAsync(uri, { mimeType: read.payload.mime, dialogTitle: read.payload.filename });
  return { shared: true };
}

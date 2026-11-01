/**
 * M1 — DirectoryListing seam.
 *
 * `HostFilesystem` (S1) is frozen by design: byte IO only. Listing is a
 * separate narrow interface so the byte seam never widens. Both mobile
 * adapters (`MemoryHostFilesystem`, `ExpoFileAdapter`) satisfy it; callers
 * (Explorer, index build) depend on this interface, never on Expo.
 */

export type ListedEntry = {
  name: string;
  isDirectory: boolean;
  mtimeMs: number;
  size: number;
};

export interface DirectoryListing {
  listDirectory(absolutePath: string): Promise<ListedEntry[]>;
  /** Recursive mkdir (no error when already a directory). Needed because
   *  `CoreNoteService.create` writes files, never parents — hosts differ
   *  (desktop fs vs mobile sandbox), so parents are the caller's job. */
  ensureDirectory(absolutePath: string): Promise<void>;
}

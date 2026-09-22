/** Gate A: canonical policy lives in `src/core/policy/note-policy.ts`.
 * This module re-exports it so existing imports keep working with one source. */
export {
  MAX_PATH_CHARS,
  validateNoteRelativePath,
  validatePosixRelativePath,
  validateWindowsRelativePath,
  validateWorkspaceId,
} from "../../core/policy/note-policy.js";

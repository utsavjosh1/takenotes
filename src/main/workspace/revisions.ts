/** Gate A: canonical revision/text policy lives in `src/core/policy/note-policy.ts`.
 * This module re-exports it so existing imports keep working with one source. */
export {
  MAX_FILE_BYTES,
  decodeUtf8,
  detectNewline,
  encodeUtf8,
  isRevisionCurrent,
  revisionOfBytes,
  type FileRevision,
} from "../../core/policy/note-policy.js";

/** Shared protocol version between Electron main and the WSL helper.
 * Bump only on incompatible protocol changes. UI changes do not bump this. */
export const PROTOCOL_VERSION = 1;

/** Maximum single protocol frame: 16 MiB (see build-config.json limits). */
export const MAX_FRAME_BYTES = 16 * 1024 * 1024;

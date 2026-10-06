/**
 * Shared valibot schemas (framework-agnostic).
 *
 * These run unchanged on Electron, Expo, and Node. They validate shape
 * only — security-sensitive path walking stays in `policy/note-policy.ts`
 * and is never reimplemented here. Every schema parses with `safeParse`
 * semantics: callers get data or fall back, they never throw.
 */
import * as v from "valibot";

/** Renderer settings persisted in localStorage. All fields optional: the
 * caller merges successful output over built-in defaults, so corrupt or
 * future-unknown stored values degrade to defaults instead of breaking boot. */
export const SettingsSchema = v.object({
  theme: v.optional(v.picklist(["system", "light", "dark"])),
  fontSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(10), v.maxValue(32))),
  lineHeight: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(3))),
  readableWidth: v.optional(v.pipe(v.number(), v.integer(), v.minValue(400), v.maxValue(1400))),
  fullWidth: v.optional(v.boolean()),
  wordWrap: v.optional(v.boolean()),
  lineNumbers: v.optional(v.boolean()),
  confirmTrash: v.optional(v.boolean()),
  /** Opt-in WSL workspaces (Windows only). Off → plain notetaking app. */
  wslEnabled: v.optional(v.boolean()),
  /** Step 2: activity-rail visibility. */
  ribbonVisible: v.optional(v.boolean()),
});

export type ValidatedSettings = v.InferOutput<typeof SettingsSchema>;

/** Parse stored settings field-by-field: one corrupt value drops only
 * itself (unknown keys are ignored); unparseable input yields `{}`.
 * The caller merges the result over built-in defaults. */
export function parseSettings(input: unknown): ValidatedSettings {
  if (typeof input !== "object" || input === null) return {};
  const record = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(SettingsSchema.entries)) {
    if (!(key in record)) continue;
    const result = v.safeParse(schema, record[key]);
    if (result.success) out[key] = result.output;
  }
  return out as ValidatedSettings;
}
/** `POST /api/auth/login` body. Same accept/behavior as the previous
 * hand-rolled check: anything but a non-empty string fails closed. */
export const LoginBodySchema = v.object({
  password: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
});

/** Login password or null when the body is malformed. */
export function parseLoginPassword(body: unknown): string | null {
  const result = v.safeParse(LoginBodySchema, body);
  return result.success ? result.output.password : null;
}

/** `POST /api/auth/password` body. Malformed pairs fail closed with the
 * same INVALID_REQUEST the hand-rolled check produced. */
export const PasswordChangeSchema = v.object({
  currentPassword: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
  nextPassword: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
});

export type PasswordChangeInput = v.InferOutput<typeof PasswordChangeSchema>;

/** Password-change pair or null when the body is malformed. */
export function parsePasswordChange(body: unknown): PasswordChangeInput | null {
  const result = v.safeParse(PasswordChangeSchema, body);
  return result.success ? result.output : null;
}

/** WSL connect form (desktop dialog today, mobile workspace-connect later).
 * `path` shape only — confinement against the distro root is enforced
 * host-side by the helper/main, never by this schema. */
export const WslConnectSchema = v.object({
  distro: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  linuxUser: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  path: v.pipe(v.string(), v.minLength(1), v.maxLength(1024)),
});

export type WslConnectInput = v.InferOutput<typeof WslConnectSchema>;

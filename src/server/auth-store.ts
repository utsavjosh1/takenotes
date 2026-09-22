/**
 * Persistent single-owner auth for the self-hosted server (Gate C).
 *
 * Layout under `$TAKENOTES_DATA/app/`:
 * - `auth.json`: password verifier + `authGeneration`
 * - `sessions.json`: opaque sessions (id + CSRF + expiry + generation)
 *
 * Password KDF is scrypt (N=16384, r=8, p=1, 64-byte output) from
 * `node:crypto` — no native addons, so the Docker image stays dependency-
 * free. Parameters are stored alongside the verifier (`kdf` field), so a
 * future Argon2id migration can re-hash on next login without breaking
 * existing installs.
 *
 * `authGeneration` bumps on every password change and wipes all sessions:
 * after a change, pre-change sessions fail closed even if unexpired.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Context, Next } from "hono";
import { appError } from "../shared/errors.js";
import type { IpcResult } from "../shared/contracts/ipc.js";
import { CSRF_HEADER, buildClearCookie, buildSetCookie, cookieNameFor, parseCookies } from "./cookies.js";

const AUTH_VERSION = 1;
const SESSIONS_VERSION = 1;
const KDF_ID = "scrypt-16384-8-1";
const SALT_BYTES = 16;
const HASH_BYTES = 64;
const SESSION_BYTES = 32;
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const MIN_PASSWORD_CHARS = 12;

type StoredAuth = {
  version: typeof AUTH_VERSION;
  kdf: typeof KDF_ID;
  salt: string;
  hash: string;
  authGeneration: number;
};

type StoredSession = {
  id: string;
  csrf: string;
  createdAt: number;
  expiresAt: number;
  generation: number;
};

type StoredSessions = {
  version: typeof SESSIONS_VERSION;
  sessions: StoredSession[];
};

function token(bytes = SESSION_BYTES): string {
  return randomBytes(bytes).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function hashPassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, HASH_BYTES, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived as Buffer);
    });
  });
}

function isStoredAuth(v: unknown): v is StoredAuth {
  const o = v as Record<string, unknown>;
  return (
    !!o &&
    o["version"] === AUTH_VERSION &&
    o["kdf"] === KDF_ID &&
    typeof o["salt"] === "string" &&
    typeof o["hash"] === "string" &&
    typeof o["authGeneration"] === "number"
  );
}

function isStoredSessions(v: unknown): v is StoredSessions {
  const o = v as { version?: unknown; sessions?: unknown };
  return !!o && o.version === SESSIONS_VERSION && Array.isArray(o.sessions);
}

async function atomicWriteJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

export type FileOwnerAuthOptions = {
  appDir: string;
  insecureHttp?: boolean;
  sessionTtlMs?: number;
  now?: () => number;
};

export class FileOwnerAuth {
  readonly cookieName: string;
  private readonly authFile: string;
  private readonly sessionsFile: string;
  private readonly insecureHttp: boolean;
  private readonly sessionTtlMs: number;
  private readonly now: () => number;
  private auth: StoredAuth;
  private sessions = new Map<string, StoredSession>();
  /** In-memory login-failure buckets per client key (throttle only, not security state). */
  private readonly loginFailures = new Map<string, { count: number; resetAt: number }>();

  private constructor(options: FileOwnerAuthOptions, auth: StoredAuth, sessions: StoredSession[]) {
    this.insecureHttp = options.insecureHttp ?? false;
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.now = options.now ?? Date.now;
    this.cookieName = cookieNameFor(this.insecureHttp);
    this.authFile = path.join(options.appDir, "auth.json");
    this.sessionsFile = path.join(options.appDir, "sessions.json");
    this.auth = auth;
    for (const s of sessions) this.sessions.set(s.id, s);
  }

  /** Open existing auth state. Throws when never bootstrapped (fail fast). */
  static async open(options: FileOwnerAuthOptions): Promise<FileOwnerAuth> {
    const authFile = path.join(options.appDir, "auth.json");
    const sessionsFile = path.join(options.appDir, "sessions.json");
    let authRaw: unknown;
    try {
      authRaw = JSON.parse(await readFile(authFile, "utf8"));
    } catch {
      throw new Error(
        `No auth state at ${authFile}. First boot requires TAKENOTES_PASSWORD (min ${MIN_PASSWORD_CHARS} chars).`,
      );
    }
    if (!isStoredAuth(authRaw)) throw new Error(`Unrecognized auth state at ${authFile}.`);
    let sessions: StoredSession[] = [];
    try {
      const raw = JSON.parse(await readFile(sessionsFile, "utf8"));
      if (isStoredSessions(raw)) sessions = raw.sessions;
    } catch {
      sessions = [];
    }
    const store = new FileOwnerAuth(options, authRaw, sessions);
    await store.pruneExpired();
    return store;
  }

  /** First-boot initialization. Throws when already bootstrapped. */
  static async bootstrap(appDir: string, password: string): Promise<void> {
    if (password.length < MIN_PASSWORD_CHARS) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_CHARS} characters.`);
    }
    const authFile = path.join(appDir, "auth.json");
    try {
      await readFile(authFile, "utf8");
      throw new Error(`Auth already initialized at ${authFile}. Use password change instead.`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Auth already initialized")) throw err;
    }
    const salt = randomBytes(SALT_BYTES);
    const hash = await hashPassword(password, salt);
    const auth: StoredAuth = {
      version: AUTH_VERSION,
      kdf: KDF_ID,
      salt: salt.toString("base64"),
      hash: hash.toString("base64"),
      authGeneration: 1,
    };
    await atomicWriteJson(authFile, auth);
    await atomicWriteJson(path.join(appDir, "sessions.json"), { version: SESSIONS_VERSION, sessions: [] });
  }

  get authGeneration(): number {
    return this.auth.authGeneration;
  }

  async verifyPassword(password: string): Promise<boolean> {
    const salt = Buffer.from(this.auth.salt, "base64");
    const expected = Buffer.from(this.auth.hash, "base64");
    const actual = await hashPassword(password, salt);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  isLoginThrottled(clientKey: string): boolean {
    const bucket = this.loginFailures.get(clientKey);
    if (!bucket) return false;
    if (this.now() >= bucket.resetAt) {
      this.loginFailures.delete(clientKey);
      return false;
    }
    return bucket.count >= 20;
  }

  recordFailedLogin(clientKey: string): void {
    const cur = this.loginFailures.get(clientKey);
    if (!cur || this.now() >= cur.resetAt) {
      this.loginFailures.set(clientKey, { count: 1, resetAt: this.now() + 5 * 60 * 1000 });
    } else {
      cur.count += 1;
    }
  }

  clearFailedLogins(clientKey: string): void {
    this.loginFailures.delete(clientKey);
  }

  async login(password: string): Promise<{ sessionId: string; csrfToken: string } | null> {
    if (!(await this.verifyPassword(password))) return null;
    const now = this.now();
    const session: StoredSession = {
      id: token(),
      csrf: token(),
      createdAt: now,
      expiresAt: now + this.sessionTtlMs,
      generation: this.auth.authGeneration,
    };
    this.sessions.set(session.id, session);
    await this.persistSessions();
    return { sessionId: session.id, csrfToken: session.csrf };
  }

  async logout(sessionId: string): Promise<void> {
    if (this.sessions.delete(sessionId)) await this.persistSessions();
  }

  /** Password change: re-hash, bump generation, wipe ALL sessions. */
  async changePassword(currentPassword: string, nextPassword: string): Promise<boolean> {
    if (!(await this.verifyPassword(currentPassword))) return false;
    if (nextPassword.length < MIN_PASSWORD_CHARS) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_CHARS} characters.`);
    }
    const salt = randomBytes(SALT_BYTES);
    const hash = await hashPassword(nextPassword, salt);
    this.auth = {
      version: AUTH_VERSION,
      kdf: KDF_ID,
      salt: salt.toString("base64"),
      hash: hash.toString("base64"),
      authGeneration: this.auth.authGeneration + 1,
    };
    this.sessions.clear();
    await atomicWriteJson(this.authFile, this.auth);
    await this.persistSessions();
    return true;
  }

  sessionFromRequest(c: Context): { sessionId: string; csrf: string } | null {
    const cookies = parseCookies(c.req.header("cookie") ?? null);
    const sessionId = cookies.get(this.cookieName);
    if (!sessionId) return null;
    return { sessionId, csrf: c.req.header(CSRF_HEADER) ?? "" };
  }

  /**
   * Cookie-only liveness check (browser boot, no CSRF yet). Safe: the CSRF
   * token is revealed only to a caller already holding the opaque session
   * cookie. Mutating/RPC calls still require CSRF via `validate`.
   */
  sessionStatus(sessionId: string): { live: true; csrfToken: string } | { live: false } {
    const s = this.sessions.get(sessionId);
    if (!s || s.generation !== this.auth.authGeneration || s.expiresAt <= this.now()) {
      if (s) {
        this.sessions.delete(sessionId);
        void this.persistSessions().catch(() => {});
      }
      return { live: false };
    }
    return { live: true, csrfToken: s.csrf };
  }

  /** Validate session + CSRF + expiry + generation. Prunes dead sessions best-effort. */
  validate(sessionId: string, csrf: string): { ok: true; session: StoredSession } | { ok: false; status: 401 | 403 } {
    const s = this.sessions.get(sessionId);
    if (!s || !safeEqual(sessionId, s.id)) return { ok: false, status: 401 };
    if (s.generation !== this.auth.authGeneration || s.expiresAt <= this.now()) {
      this.sessions.delete(sessionId);
      void this.persistSessions().catch(() => {});
      return { ok: false, status: 401 };
    }
    if (!csrf || !safeEqual(csrf, s.csrf)) return { ok: false, status: 403 };
    return { ok: true, session: s };
  }

  setCookieHeader(sessionId: string): string {
    return buildSetCookie(sessionId, this.insecureHttp, Math.floor(this.sessionTtlMs / 1000));
  }

  clearCookieHeader(): string {
    return buildClearCookie(this.insecureHttp);
  }

  async require(c: Context, next: Next): Promise<Response | void> {
    const creds = this.sessionFromRequest(c);
    if (!creds) {
      const body: IpcResult<never> = {
        ok: false,
        error: appError("PERMISSION_DENIED", "Authentication required."),
      };
      return c.json(body, 401);
    }
    const v = this.validate(creds.sessionId, creds.csrf);
    if (!v.ok) {
      const body: IpcResult<never> =
        v.status === 401
          ? { ok: false, error: appError("PERMISSION_DENIED", "Authentication required.") }
          : { ok: false, error: appError("PERMISSION_DENIED", "Invalid CSRF token.") };
      return c.json(body, v.status);
    }
    await next();
  }

  private async pruneExpired(): Promise<void> {
    let changed = false;
    for (const [id, s] of this.sessions) {
      if (s.generation !== this.auth.authGeneration || s.expiresAt <= this.now()) {
        this.sessions.delete(id);
        changed = true;
      }
    }
    if (changed) await this.persistSessions();
  }

  private async persistSessions(): Promise<void> {
    const body: StoredSessions = { version: SESSIONS_VERSION, sessions: [...this.sessions.values()] };
    await atomicWriteJson(this.sessionsFile, body);
  }
}

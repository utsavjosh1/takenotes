import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { appError } from "../shared/errors.js";
import type { IpcResult } from "../shared/contracts/ipc.js";

export type OwnerSession = {
  sessionId: string;
  csrfToken: string;
};

type AuthOptions = {
  cookieName?: string;
  session?: OwnerSession;
};

function token(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function parseCookies(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) continue;
    out.set(rawName, rawValue.join("="));
  }
  return out;
}

/**
 * GATE B PARITY HARNESS — NOT PRODUCTION AUTH.
 *
 * Single pre-issued owner session + CSRF: enough to prove the HTTP
 * transport carries the same `CoreNoteService` semantics as IPC (same args,
 * same `FileReadResult`, same `AppError` codes, same CONFLICT) with an
 * authenticated gate in front — without claiming self-hosting security is
 * complete. Production owner auth (password bootstrap, persisted verifier
 * + sessions, `authGeneration` invalidation, `__Host-` cookies) lives in
 * `auth-store.ts` (`FileOwnerAuth`) and is proven by `tests/server/gate-c.test.ts`.
 *
 * Do NOT mistake `SingleOwnerAuth` for a deployment credential scheme: its
 * session is minted in-process and does not survive restarts. Tests that
 * need restart persistence or password rotation must use `FileOwnerAuth`.
 */
export class SingleOwnerAuth {
  readonly cookieName: string;
  readonly session: OwnerSession;

  constructor(options: AuthOptions = {}) {
    this.cookieName = options.cookieName ?? "__Host-takenotes-session";
    this.session = options.session ?? { sessionId: token(), csrfToken: token() };
  }

  cookieHeader(): string {
    return `${this.cookieName}=${this.session.sessionId}`;
  }

  headers(): Record<string, string> {
    return {
      cookie: this.cookieHeader(),
      "x-csrf-token": this.session.csrfToken,
    };
  }

  async require(c: Context, next: Next): Promise<Response | void> {
    const cookies = parseCookies(c.req.header("cookie") ?? null);
    const sessionId = cookies.get(this.cookieName);
    if (!sessionId || !safeEqual(sessionId, this.session.sessionId)) {
      const body: IpcResult<never> = { ok: false, error: appError("PERMISSION_DENIED", "Authentication required.") };
      return c.json(body, 401);
    }
    const csrf = c.req.header("x-csrf-token") ?? "";
    if (!csrf || !safeEqual(csrf, this.session.csrfToken)) {
      const body: IpcResult<never> = { ok: false, error: appError("PERMISSION_DENIED", "Invalid CSRF token.") };
      return c.json(body, 403);
    }
    await next();
  }
}

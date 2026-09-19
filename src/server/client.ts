import type { FileReadResult, FileRevision, IpcResult } from "../shared/contracts/ipc.js";
import type { OwnerSession } from "./auth.js";
import { CSRF_HEADER, INSECURE_COOKIE_NAME, PRODUCTION_COOKIE_NAME } from "./cookies.js";

export type TakenotesClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
  /** Pre-established session (Gate-B harness / tests). */
  session?: OwnerSession;
  cookieName?: string;
};

export type NoteUpdateRequest = {
  workspaceId: string;
  relativePath: string;
  content: string;
  expectedHash: string;
  newlineStyle: "lf" | "crlf";
  hadBom: boolean;
};

export type RemoteWorkspace = {
  workspaceId: string;
  displayName: string;
};

/**
 * HTTP client for the note slice + Gate-C auth lifecycle.
 *
 * Gate B used only `noteRead`/`noteUpdate` with a pre-shared session.
 * Gate C adds `login`/`logout`/`session`/`listWorkspaces`/`changePassword`
 * against `/api/auth/*` + `workspace.list`. The client keeps an in-memory
 * cookie jar (session id + CSRF + the cookie name the server set) so tests
 * and scripts exercise the same login → work → logout lifecycle as the
 * browser UI, over both production (`__Host-`) and insecure-dev cookies.
 */
export class TakenotesClient {
  private readonly fetchImpl: typeof fetch;
  private jar: { session: OwnerSession; cookieName: string } | null;

  constructor(private readonly options: TakenotesClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    const preset = options.session;
    this.jar = preset
      ? { session: preset, cookieName: options.cookieName ?? PRODUCTION_COOKIE_NAME }
      : null;
  }

  /** Currently held session (null when logged out / never logged in). */
  get session(): OwnerSession | null {
    return this.jar?.session ?? this.options.session ?? null;
  }

  async login(password: string): Promise<{ ok: true; csrfToken: string } | { ok: false; status: number }> {
    const res = await this.fetchImpl(new URL("/api/auth/login", this.options.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.status !== 200) return { ok: false, status: res.status };
    const body = (await res.json()) as IpcResult<{ csrfToken: string }>;
    if (!body.ok) return { ok: false, status: res.status };
    const setCookie = res.headers.get("set-cookie") ?? "";
    // Accept whichever cookie name the server set (production vs insecure-dev).
    let cookieName: string | null = null;
    let sessionId = "";
    for (const name of [PRODUCTION_COOKIE_NAME, INSECURE_COOKIE_NAME, this.options.cookieName ?? ""]) {
      if (!name) continue;
      const match = new RegExp(`${name}=([^;]*)`).exec(setCookie);
      if (match?.[1]?.trim()) {
        cookieName = name;
        sessionId = match[1].trim();
        break;
      }
    }
    if (!cookieName || !sessionId) return { ok: false, status: res.status };
    this.jar = { session: { sessionId, csrfToken: body.result.csrfToken }, cookieName };
    return { ok: true, csrfToken: body.result.csrfToken };
  }

  async logout(): Promise<void> {
    await this.rpcRaw("/api/auth/logout", {});
    this.jar = null;
  }

  sessionStatus(): Promise<IpcResult<{ authenticated: boolean; csrfToken?: string }>> {
    return this.rpc<{ authenticated: boolean; csrfToken?: string }>("/api/auth/session", undefined, "GET");
  }

  listWorkspaces(): Promise<IpcResult<RemoteWorkspace[]>> {
    return this.rpc<RemoteWorkspace[]>("/api/rpc/workspace.list", {});
  }

  async changePassword(currentPassword: string, nextPassword: string): Promise<IpcResult<null>> {
    const out = await this.rpc<null>("/api/auth/password", { currentPassword, nextPassword });
    if (out.ok) this.jar = null;
    return out;
  }

  noteRead(workspaceId: string, relativePath: string): Promise<IpcResult<FileReadResult>> {
    return this.rpc<FileReadResult>("/api/rpc/note.read", { workspaceId, relativePath });
  }

  noteUpdate(request: NoteUpdateRequest): Promise<IpcResult<FileRevision>> {
    return this.rpc<FileRevision>("/api/rpc/note.update", request);
  }

  private async rpc<T>(path: string, body: unknown, method = "POST"): Promise<IpcResult<T>> {
    const res = await this.rpcRaw(path, body, method);
    return (await res.json()) as IpcResult<T>;
  }

  private async rpcRaw(path: string, body: unknown, method = "POST"): Promise<Response> {
    const headers: Record<string, string> = {};
    if (method !== "GET") headers["content-type"] = "application/json";
    const active = this.jar;
    const fallback = this.options.session
      ? { session: this.options.session, cookieName: this.options.cookieName ?? PRODUCTION_COOKIE_NAME }
      : null;
    const creds = active ?? fallback;
    if (creds) {
      headers.cookie = `${creds.cookieName}=${creds.session.sessionId}`;
      headers[CSRF_HEADER] = creds.session.csrfToken;
    }
    return this.fetchImpl(new URL(path, this.options.baseUrl), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
}

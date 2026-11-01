import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Per-agent MCP bearer tokens (ADR-0017).
 *
 * Only SHA-256 hashes are stored; the raw token is returned once at creation.
 * The file is re-read when its mtime changes, so tokens created or revoked by
 * the CLI take effect on a running server without a restart. Corrupt or
 * missing state yields an empty store — fail closed (deny), never open.
 */

export const AGENT_TOKEN_PREFIX = "tn_agent_";
const TOKENS_FILE = "agent-tokens.json";
const MAX_LABEL_CHARS = 64;

export type AgentScope = "read" | "write";

export type AgentTokenRecord = {
  id: string;
  label: string;
  /** SHA-256 (hex) of the raw token. */
  hash: string;
  workspaceIds: string[];
  scope: AgentScope;
  createdAt: number;
  revokedAt?: number;
};

export type AgentTokenSummary = Omit<AgentTokenRecord, "hash">;

type TokensFile = { version: 1; tokens: AgentTokenRecord[] };

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function summarize(t: AgentTokenRecord): AgentTokenSummary {
  const out: AgentTokenSummary = {
    id: t.id,
    label: t.label,
    workspaceIds: [...t.workspaceIds],
    scope: t.scope,
    createdAt: t.createdAt,
  };
  if (t.revokedAt !== undefined) out.revokedAt = t.revokedAt;
  return out;
}

function isRecord(value: unknown): value is AgentTokenRecord {
  const v = value as Partial<AgentTokenRecord> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.id === "string" &&
    typeof v.label === "string" &&
    typeof v.hash === "string" &&
    /^[0-9a-f]{64}$/.test(v.hash) &&
    Array.isArray(v.workspaceIds) &&
    v.workspaceIds.every((w) => typeof w === "string") &&
    (v.scope === "read" || v.scope === "write") &&
    typeof v.createdAt === "number"
  );
}

export class AgentTokenStore {
  private tokens: AgentTokenRecord[] = [];
  private mtimeMs = -1;

  constructor(private readonly filePath: string) {}

  static forAppDir(appDir: string): AgentTokenStore {
    return new AgentTokenStore(path.join(appDir, TOKENS_FILE));
  }

  /** Reload from disk when the file changed (CLI edits while the server runs). */
  private async refresh(): Promise<void> {
    let mtime: number;
    try {
      mtime = (await stat(this.filePath)).mtimeMs;
    } catch {
      this.tokens = [];
      this.mtimeMs = -1;
      return;
    }
    if (mtime === this.mtimeMs) return;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<TokensFile>;
      this.tokens = parsed?.version === 1 && Array.isArray(parsed.tokens) ? parsed.tokens.filter(isRecord) : [];
    } catch {
      this.tokens = [];
    }
    this.mtimeMs = mtime;
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    const body: TokensFile = { version: 1, tokens: this.tokens };
    await writeFile(tmp, JSON.stringify(body, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(tmp, this.filePath);
    this.mtimeMs = (await stat(this.filePath)).mtimeMs;
  }

  /** Create a token. The raw value is returned once and never stored. */
  async create(input: {
    label: string;
    workspaceIds: string[];
    scope: AgentScope;
    now?: number;
  }): Promise<{ token: string; record: AgentTokenSummary }> {
    const label = input.label.trim().slice(0, MAX_LABEL_CHARS);
    if (!label) throw new Error("A token label is required.");
    const workspaceIds = [...new Set(input.workspaceIds.map((w) => w.trim()).filter(Boolean))];
    if (workspaceIds.length === 0) throw new Error("At least one workspace is required.");
    await this.refresh();
    const token = `${AGENT_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
    const record: AgentTokenRecord = {
      id: randomUUID(),
      label,
      hash: hashToken(token),
      workspaceIds,
      scope: input.scope,
      createdAt: input.now ?? Date.now(),
    };
    this.tokens.push(record);
    await this.persist();
    return { token, record: summarize(record) };
  }

  async list(): Promise<AgentTokenSummary[]> {
    await this.refresh();
    return this.tokens.map(summarize);
  }

  /** Revoke by id (or unique id prefix). True when a live token was revoked. */
  async revoke(idOrPrefix: string, now: number = Date.now()): Promise<boolean> {
    await this.refresh();
    const matches = this.tokens.filter((t) => t.id === idOrPrefix || (idOrPrefix.length >= 6 && t.id.startsWith(idOrPrefix)));
    if (matches.length !== 1 || matches[0]!.revokedAt !== undefined) return false;
    matches[0]!.revokedAt = now;
    await this.persist();
    return true;
  }

  /** Resolve a presented raw token to its live record, or null. */
  async verify(raw: string): Promise<AgentTokenRecord | null> {
    if (!raw.startsWith(AGENT_TOKEN_PREFIX) || raw.length > 256) return null;
    await this.refresh();
    const presented = Buffer.from(hashToken(raw), "hex");
    let found: AgentTokenRecord | null = null;
    for (const t of this.tokens) {
      // Compare every record so timing doesn't reveal which hash was closest.
      if (timingSafeEqual(presented, Buffer.from(t.hash, "hex")) && t.revokedAt === undefined) found = t;
    }
    return found;
  }
}

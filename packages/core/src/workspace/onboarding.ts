/** Pure rules for the welcome and workspace flows. No DOM, no IPC. */

const BAD_NAME_CHARS = /[\\/:*?"<>|]/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Returns a plain-words problem, or null when the name is fine. */
export function validateWorkspaceName(raw: string, existing: readonly string[]): string | null {
  const name = raw.trim();
  if (!name) return "Give the workspace a name.";
  if (BAD_NAME_CHARS.test(name)) return "Names can’t contain / \\ : * ? \" < > |.";
  if (name === "." || name === ".." || name.endsWith(".") || RESERVED.test(name)) return "That name can’t be used for a folder.";
  if (existing.some((e) => e.trim().toLowerCase() === name.toLowerCase())) return "A workspace with this name already exists.";
  return null;
}

export const WELCOME_NOTE = "# Welcome\n\nYour notes stay plain Markdown files.\n\nType / to add a heading, list or to-do.\n";

/* ---------- sign-in lockout ---------- */

export const LOCKOUT_MAX_FAILS = 3;
export const LOCKOUT_MS = 30_000;

export type LockoutStorage = { get(): string | null; set(value: string): void };
type LockState = { fails: number; lockUntil: number };

/** Three wrong tokens lock the form for 30 s. State lives in storage so a reload does not reset it. */
export class SignInLockout {
  constructor(private readonly store: LockoutStorage, private readonly now: () => number = Date.now) {}

  private load(): LockState {
    try {
      const v = JSON.parse(this.store.get() ?? "") as Partial<LockState>;
      return { fails: Number(v.fails) || 0, lockUntil: Number(v.lockUntil) || 0 };
    } catch {
      return { fails: 0, lockUntil: 0 };
    }
  }
  private save(s: LockState): void { this.store.set(JSON.stringify(s)); }

  /** Whole seconds left, 0 when open. */
  secondsLeft(): number {
    return Math.max(0, Math.ceil((this.load().lockUntil - this.now()) / 1000));
  }
  recordFailure(): { locked: boolean; attemptsLeft: number } {
    const s = this.load();
    if (s.lockUntil > this.now()) return { locked: true, attemptsLeft: 0 };
    const fails = s.fails + 1;
    if (fails >= LOCKOUT_MAX_FAILS) {
      this.save({ fails: 0, lockUntil: this.now() + LOCKOUT_MS });
      return { locked: true, attemptsLeft: 0 };
    }
    this.save({ fails, lockUntil: 0 });
    return { locked: false, attemptsLeft: LOCKOUT_MAX_FAILS - fails };
  }
  recordSuccess(): void { this.save({ fails: 0, lockUntil: 0 }); }
}

export const lockoutMessage = (seconds: number): string => `Too many attempts. Try again in ${seconds} s.`;
export const WRONG_TOKEN_MESSAGE = "That token was not accepted.";

/* ---------- pairing link ---------- */

export type PairPreview = { server: string; name: string };

/** `takenotes://pair?server=http://127.0.0.1:3001&name=Debian%20dev` */
export function parsePairLink(link: string): PairPreview | null {
  let url: URL;
  try { url = new URL(link.trim()); } catch { return null; }
  if (url.protocol !== "takenotes:" || url.hostname !== "pair") return null;
  const server = url.searchParams.get("server") ?? "";
  const name = (url.searchParams.get("name") ?? "").trim();
  try {
    const s = new URL(server);
    if (s.protocol !== "http:" && s.protocol !== "https:") return null;
  } catch { return null; }
  return { server, name: name || new URL(server).host };
}

/** Server addresses: http(s) only, no credentials in the URL. */
export function normalizeServerAddress(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username || u.password) return null;
    return u.origin;
  } catch { return null; }
}

/* ---------- plain-words open errors ---------- */

export type FriendlyError = { title: string; cause: string; details: string; action: string };

export function describeOpenFolderError(code: string, message: string, detail?: string): FriendlyError {
  const details = [code, message, detail].filter(Boolean).join("\n");
  switch (code) {
    case "PERMISSION_DENIED":
      return { title: "Can’t open this folder", cause: "takenotes does not have permission to read this folder.", details, action: "Choose another folder" };
    case "NOT_FOUND":
      return { title: "Can’t find this folder", cause: "The folder was moved or deleted.", details, action: "Choose another folder" };
    case "DISCONNECTED":
    case "OFFLINE":
      return { title: "Can’t reach this workspace", cause: "The connection to it is down.", details, action: "Try again" };
    default:
      return { title: "Can’t open this folder", cause: "Something unexpected stopped the folder from opening.", details, action: "Choose another folder" };
  }
}

/* ---------- WSL setup wizard ---------- */

export type WizardStepId = "choose" | "install" | "pair" | "open";
export type StepStatus = "pending" | "working" | "done" | "failed";
export const WIZARD_STEPS: ReadonlyArray<{ id: WizardStepId; label: string }> = [
  { id: "choose", label: "Choose distro" },
  { id: "install", label: "Install helper" },
  { id: "pair", label: "Pair" },
  { id: "open", label: "Open" },
];

export function stepStatuses(current: WizardStepId, state: "working" | "failed" | "idle"): StepStatus[] {
  const at = WIZARD_STEPS.findIndex((s) => s.id === current);
  return WIZARD_STEPS.map((_, i) => (i < at ? "done" : i === at ? (state === "failed" ? "failed" : state === "working" ? "working" : "pending") : "pending"));
}

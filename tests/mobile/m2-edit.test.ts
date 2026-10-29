/**
 * M2 gate — edit + save pipeline, recovery, capture (any OS, no native deps).
 *
 * Fake clock throughout (`now` injected): throttle/retention/debounce are
 * time logic, and time logic untested with real clocks is time logic broken.
 */
import { describe, expect, it } from "vitest";
import { RECOVERY_RETENTION_MS as DESKTOP_RETENTION, RECOVERY_THROTTLE_MS as DESKTOP_THROTTLE } from "@takenotes/desktop/main/workspace/recovery";
import { CoreNoteService } from "@takenotes/core/services/note-service";
import { WorkspaceIndex } from "@takenotes/core/index/store";
import { MobileWorkspace } from "@takenotes/mobile/workspace/mobile-workspace";
import { MemoryHostFilesystem } from "@takenotes/mobile/adapters/memory";
import { EditorSession } from "@takenotes/mobile/editor/session";
import { renderPreview, toggleTask } from "@takenotes/mobile/editor/tasks";
import {
  captureToInbox,
  ensureDailyNote,
  getToday,
} from "@takenotes/mobile/capture/quick-capture";
import {
  MemoryRecoveryStorage,
  MobileRecovery,
  RECOVERY_RETENTION_MS,
  RECOVERY_THROTTLE_MS,
  fingerprintContent,
  mobileRecoveryNamespace,
} from "@takenotes/mobile/capture/recovery";

const ROOT = "/sandbox/takenotes";

function makeWs(root = ROOT) {
  const host = new MemoryHostFilesystem();
  const ws = new MobileWorkspace({ workspaceId: "m2-ws", root }, host);
  return { host, ws };
}

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("M2: core create (shared by every transport)", () => {
  it("creates new notes, ALREADY_EXISTS on duplicate, validates paths", async () => {
    const { host } = makeWs();
    const svc = new CoreNoteService(host);
    const ws = { root: ROOT, kind: "mobile-local" as const };
    const created = await svc.create(ws, "new.md", "hello\n");
    expect("revision" in created).toBe(true);
    const dup = await svc.create(ws, "new.md", "other\n");
    expect(dup).toMatchObject({ error: { code: "ALREADY_EXISTS" } });
    const bad = await svc.create(ws, "../escape.md", "x");
    expect("error" in bad).toBe(true);
    const read = await svc.read(ws, "new.md");
    if ("result" in read) expect(read.result.content).toBe("hello\n");
  });

  it("MobileWorkspace.create ensures Daily parents", async () => {
    const { ws } = makeWs();
    const out = await ws.create("Daily/2026/10/2026-10-08.md", "# daily\n");
    expect("revision" in out).toBe(true);
    const read = await ws.read("Daily/2026/10/2026-10-08.md");
    expect("result" in read).toBe(true);
  });
});

describe("M2: editor session", () => {
  function openSession(content = "v1\n", now = 1000) {
    let disk = content;
    let diskHash = `h-${content}`;
    const save = async (c: string, _e: unknown) => {
      // Fake host: accept (test drives conflicts explicitly below).
      disk = c;
      diskHash = `h-${c}`;
      return { revision: { hash: diskHash, size: c.length, mtimeMs: now } };
    };
    const session = new EditorSession(
      { content, hash: diskHash, newlineStyle: "lf", hadBom: false, now },
      save,
      1500,
    );
    return { session, getDisk: () => disk };
  }

  it("type → dirty; autosave fires only past debounce; explicit saves now", async () => {
    const { session } = openSession("v1\n", 1000);
    expect(session.view().state).toBe("clean");
    session.type("v2\n", 1100);
    expect(session.view()).toMatchObject({ state: "dirty", dirty: true });
    await session.autosave(2000); // 900ms < 1500ms debounce
    expect(session.view().state).toBe("dirty");
    await session.autosave(3000);
    expect(session.view()).toMatchObject({ state: "clean", dirty: false });
    session.type("v3\n", 3100);
    await session.saveExplicit(); // fires inside debounce
    expect(session.view().state).toBe("clean");
  });

  it("CONFLICT → banner state, draft retained, reload-keeps-disk", async () => {
    const session = new EditorSession(
      { content: "mine\n", hash: "h-old", newlineStyle: "lf", hadBom: false, now: 0 },
      async () => ({ error: { code: "CONFLICT", message: "stale" } }) as never,
      1500,
    );
    session.type("mine edited\n", 10);
    await session.saveExplicit();
    expect(session.view()).toMatchObject({ state: "conflict" });
    expect(session.view().draft).toBe("mine edited\n"); // retained
    session.setConflictSnapshot("theirs\n");
    session.reload({ content: "theirs\n", hash: "h-new", newlineStyle: "lf", hadBom: false });
    expect(session.view()).toMatchObject({ state: "clean", draft: "theirs\n" });
  });

  it("vanished file → missing state, draft retained for retry", async () => {
    const session = new EditorSession(
      { content: "x\n", hash: "h", newlineStyle: "lf", hadBom: false, now: 0 },
      async () => ({ error: { code: "NOT_FOUND", message: "gone" } }) as never,
      1500,
    );
    session.type("y\n", 10);
    await session.saveExplicit();
    expect(session.view()).toMatchObject({ state: "missing", draft: "y\n" });
  });

  it("retry re-attempts; repeat CONFLICT stays put", async () => {
    let calls = 0;
    const session = new EditorSession(
      { content: "x\n", hash: "h", newlineStyle: "lf", hadBom: false, now: 0 },
      async () => {
        calls += 1;
        return calls === 1
          ? ({ error: { code: "CONFLICT", message: "stale" } }) as never
          : { revision: { hash: "h2", size: 2, mtimeMs: 5 } };
      },
      1500,
    );
    session.type("y\n", 10);
    await session.saveExplicit();
    expect(session.view().state).toBe("conflict");
    await session.retry();
    expect(session.view().state).toBe("clean");
    expect(calls).toBe(2);
  });

  it("real CONFLICT through MobileWorkspace (two writers)", async () => {
    const { host } = makeWs();
    host.seed(`${ROOT}/shared.md`, "v1\n");
    const a = new MobileWorkspace({ workspaceId: "a", root: ROOT }, host);
    const b = new MobileWorkspace({ workspaceId: "b", root: ROOT }, host);
    const readA = await a.read("shared.md");
    if (!("result" in readA)) throw new Error("seed missing");
    const readB = await b.read("shared.md");
    if (!("result" in readB)) throw new Error("seed missing");
    const wb = await b.update("shared.md", "from-b\n", readB.result.revision.hash, "lf", false);
    expect("revision" in wb).toBe(true);
    const session = new EditorSession(
      {
        content: readA.result.content,
        hash: readA.result.revision.hash,
        newlineStyle: "lf",
        hadBom: false,
        now: 0,
      },
      (content, e) => a.update("shared.md", content, e.hash, e.newlineStyle, e.hadBom),
      0,
    );
    session.type("from-a\n", 1);
    await session.saveExplicit();
    expect(session.view().state).toBe("conflict");
  });
});

describe("M2: preview + task toggle", () => {
  it("preview renders headings/tasks without becoming an editing surface", () => {
    const { html } = renderPreview("# Title\n\n- [ ] buy milk\n");
    expect(html).toContain("Title");
    expect(html).toContain("buy milk");
  });

  it("toggles task with revision guard; non-task line is INVALID_REQUEST", async () => {
    const { host, ws } = makeWs();
    host.seed(`${ROOT}/t.md`, "- [ ] milk\nplain\n");
    const ok = await toggleTask(ws, "t.md", 1);
    expect("revision" in ok).toBe(true);
    if ("revision" in ok) expect(ok.content).toContain("- [x] milk");
    const bad = await toggleTask(ws, "t.md", 2);
    expect(bad).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    const reread = await ws.read("t.md");
    if ("result" in reread) expect(reread.result.content).toContain("- [x] milk");
  });
});

describe("M2: quick capture", () => {
  it("creates Inbox on first capture, appends after", async () => {
    const { ws } = makeWs();
    const first = await captureToInbox(ws, "buy milk", "2026-10-09");
    expect("revision" in first).toBe(true);
    const second = await captureToInbox(ws, "call mom");
    expect("revision" in second).toBe(true);
    const inbox = await ws.read("Inbox.md");
    if ("result" in inbox) {
      expect(inbox.result.content).toContain("- [ ] buy milk @due(2026-10-09)");
      expect(inbox.result.content).toContain("- [ ] call mom");
    } else throw new Error("inbox missing");
  });

  it("retries once across a racing writer", async () => {
    const { host, ws } = makeWs();
    host.seed(`${ROOT}/Inbox.md`, "- [ ] existing\n");
    const racer = new MobileWorkspace({ workspaceId: "racer", root: ROOT }, host);
    // Race: external write lands between capture's read and update.
    const origUpdate = ws.update.bind(ws);
    let raced = false;
    ws.update = async (...args: Parameters<typeof origUpdate>) => {
      if (!raced) {
        raced = true;
        const r = await racer.read("Inbox.md");
        if ("result" in r) {
          await racer.update("Inbox.md", `${r.result.content}- [ ] racer line\n`, r.result.revision.hash, "lf", false);
        }
      }
      return origUpdate(...args);
    };
    const out = await captureToInbox(ws, "captured late");
    expect("revision" in out).toBe(true);
    const inbox = await ws.read("Inbox.md");
    if ("result" in inbox) {
      expect(inbox.result.content).toContain("racer line");
      expect(inbox.result.content).toContain("captured late");
    } else throw new Error("inbox missing");
  });

  it("rejects empty text and bad due dates without touching disk", async () => {
    const { ws } = makeWs();
    expect(await captureToInbox(ws, "   ")).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(await captureToInbox(ws, "task", "tomorrow")).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    await expect(ws.read("Inbox.md")).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});

describe("M2: daily + today", () => {
  it("creates daily explicitly with frontmatter; second call is a no-op", async () => {
    const { ws } = makeWs();
    const first = await ensureDailyNote(ws, { date: "2026-10-08", workspaceName: "notes" });
    expect(first).toMatchObject({ relativePath: "Daily/2026/10/2026-10-08.md", created: true });
    const content = await ws.read("Daily/2026/10/2026-10-08.md");
    if ("result" in content) {
      expect(content.result.content).toContain("2026-10-08");
      expect(content.result.content).toContain("daily");
    } else throw new Error("daily missing");
    const second = await ensureDailyNote(ws, { date: "2026-10-08" });
    expect(second).toMatchObject({ created: false });
  });

  it("today aggregates without ever creating the daily", async () => {
    const { host, ws } = makeWs();
    host.seed(`${ROOT}/tasks.md`, "- [ ] overdue @due(2026-10-01)\n- [ ] today @due(2026-10-08)\n- [ ] later @due(2026-10-20)\n- [ ] block @scheduled(2026-10-08T10:00)\n- [x] done @due(2026-10-01)\n");
    const store = new WorkspaceIndex();
    const read = await ws.read("tasks.md");
    if (!("result" in read)) throw new Error("seed missing");
    const { revisionOfBytes: revOf } = await import("@takenotes/core/policy/note-policy");
    store.upsert("m2-ws", "tasks.md", read.result.content, revOf(Buffer.from(read.result.content), 1));
    const today = await getToday(ws, store, "m2-ws", "2026-10-08");
    if (!("groups" in today)) throw new Error("expected today view");
    expect(today.dailyContent).toBeNull(); // never silently created
    expect(today.dailyRelativePath).toBe("Daily/2026/10/2026-10-08.md");
    expect(today.groups.overdue.map((t) => t.description)).toEqual(["overdue"]);
    expect(today.groups.dueToday.map((t) => t.description)).toEqual(["today"]);
    expect(today.groups.scheduledToday.map((t) => t.description)).toEqual(["block"]);
    await expect(ws.read("Daily/2026/10/2026-10-08.md")).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});

describe("M2: recovery", () => {
  it("constants equal desktop (mirror pin)", () => {
    expect(RECOVERY_THROTTLE_MS).toBe(DESKTOP_THROTTLE);
    expect(RECOVERY_RETENTION_MS).toBe(DESKTOP_RETENTION);
  });

  it("namespace is stable per root, distinct across roots", () => {
    expect(mobileRecoveryNamespace("/a/notes/")).toBe(mobileRecoveryNamespace("/a/notes"));
    expect(mobileRecoveryNamespace("/a/notes")).not.toBe(mobileRecoveryNamespace("/a/other"));
    expect(fingerprintContent("x")).toBe(fingerprintContent("x"));
    expect(fingerprintContent("x")).not.toBe(fingerprintContent("y"));
  });

  it("edit throttle: 1 snapshot per 5min; save bypasses when changed; identical skips", async () => {
    const clock = fakeClock();
    const rec = new MobileRecovery(new MemoryRecoveryStorage(), { now: clock.now, id: (() => { let n = 0; return () => `s${n++}`; })() });
    const ns = mobileRecoveryNamespace(ROOT);
    expect(await rec.snapshot(ns, "a.md", "v1", "edit")).not.toBeNull();
    clock.advance(60_000);
    expect(await rec.snapshot(ns, "a.md", "v2", "edit")).toBeNull(); // throttled
    clock.advance(60_000);
    expect(await rec.snapshot(ns, "a.md", "v3", "save")).not.toBeNull(); // save bypasses
    expect(await rec.snapshot(ns, "a.md", "v3", "save")).toBeNull(); // identical skips
    clock.advance(RECOVERY_THROTTLE_MS);
    expect(await rec.snapshot(ns, "a.md", "v4", "edit")).not.toBeNull(); // window passed
    const list = await rec.list(ns, "a.md");
    expect(list.map((m) => m.reason)).toEqual(["edit", "save", "edit"].reverse());
    expect(list[0]?.createdAt).toBeGreaterThanOrEqual(list[1]?.createdAt ?? 0);
  });

  it("read restores content; janitor purges past 7 days", async () => {
    const clock = fakeClock();
    let n = 0;
    const rec = new MobileRecovery(new MemoryRecoveryStorage(), { now: clock.now, id: () => `s${n++}` });
    const ns = mobileRecoveryNamespace(ROOT);
    const meta = await rec.snapshot(ns, "b.md", "keep me", "save");
    expect(meta).not.toBeNull();
    expect(await rec.read(ns, "b.md", meta!.snapshotId)).toBe("keep me");
    expect(await rec.read(ns, "b.md", "nope")).toBeNull();
    clock.advance(RECOVERY_RETENTION_MS + 1000);
    expect(await rec.janitor(ns)).toBe(1);
    expect(await rec.list(ns, "b.md")).toEqual([]);
  });

  it("session edits flow into recovery with throttle (wired)", async () => {
    const clock = fakeClock(5000);
    let n = 0;
    const rec = new MobileRecovery(new MemoryRecoveryStorage(), { now: clock.now, id: () => `s${n++}` });
    const ns = mobileRecoveryNamespace(ROOT);
    const session = new EditorSession(
      { content: "v1\n", hash: "h1", newlineStyle: "lf", hadBom: false, now: clock.now() },
      async (c) => ({ revision: { hash: `h-${c}`, size: c.length, mtimeMs: clock.now() } }),
      1500,
    );
    const onEdit = (content: string) => rec.snapshot(ns, "wired.md", content, "edit");
    session.type("v2\n", clock.now());
    expect(await onEdit(session.view().draft)).not.toBeNull();
    clock.advance(1000);
    session.type("v3\n", clock.now());
    expect(await onEdit(session.view().draft)).toBeNull(); // throttled
    await session.saveExplicit();
    expect(await rec.snapshot(ns, "wired.md", session.view().draft, "save")).not.toBeNull();
  });
});

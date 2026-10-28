import { describe, expect, it } from "vitest";
import { contentRev, FileStoreError, MemoryFileStore } from "@takenotes/core/ports/file-store";
import {
  classifySaveFailure, decideExternalChange, lineCount, saveStateOf, sideBySide, snapshotLabel,
} from "@takenotes/core/save/decisions";

/** A tiny stand-in for one open note, driven only by the shared decision rules and a FileStore. It proves none of the scenarios can lose text. */
class Session {
  snapshots: Array<{ label: string; text: string }> = [];
  state = "saved" as ReturnType<typeof saveStateOf>;
  constructor(private fs: MemoryFileStore, readonly path: string, public text: string, public baseRev: string) {}
  static async open(fs: MemoryFileStore, path: string) { const r = await fs.read("w", path); return new Session(fs, path, r.body, r.rev); }
  edit(t: string) { this.text = t; this.state = "unsaved"; }
  private get dirty() { return this.text !== this.diskText; }
  diskText = "";
  async sync() { this.diskText = (await this.fs.read("w", this.path)).body; }
  async save(): Promise<void> {
    try {
      const { rev } = await this.fs.write("w", this.path, this.text, { expectedRev: this.baseRev });
      this.baseRev = rev; this.diskText = this.text; this.state = "saved";
    } catch (e) {
      const f = classifySaveFailure((e as FileStoreError).code);
      this.state = f === "conflict" ? "conflict" : f === "readonly" ? "readonly" : f === "offline" ? "disconnected" : f === "deleted" ? "deleted" : "unsaved";
    }
  }
  async onWatch(): Promise<void> {
    let disk: { exists: boolean; rev?: string };
    try { disk = { exists: true, rev: (await this.fs.read("w", this.path)).rev }; } catch { disk = { exists: false }; }
    const act = decideExternalChange({ dirty: this.text !== this.diskText, baseRev: this.baseRev }, disk);
    if (act.kind === "reload-quietly") { const r = await this.fs.read("w", this.path); this.text = r.body; this.diskText = r.body; this.baseRev = r.rev; this.state = "saved"; }
    else if (act.kind === "conflict") this.state = "conflict";
    else if (act.kind === "deleted") this.state = "deleted";
  }
  async keepMine() {
    const cur = await this.fs.read("w", this.path);
    this.snapshots.push({ label: snapshotLabel("before-overwrite"), text: cur.body });
    const { rev } = await this.fs.write("w", this.path, this.text, { expectedRev: cur.rev });
    this.baseRev = rev; this.diskText = this.text; this.state = "saved";
  }
  async useTheirs() {
    this.snapshots.push({ label: snapshotLabel("before-reload"), text: this.text });
    const r = await this.fs.read("w", this.path);
    this.text = r.body; this.diskText = r.body; this.baseRev = r.rev; this.state = "saved";
  }
}

const setup = async (body = "one\ntwo\n") => {
  const fs = new MemoryFileStore();
  fs.seed("w", { "a.md": body });
  const s = await Session.open(fs, "a.md");
  s.diskText = body;
  return { fs, s };
};

describe("external edit", () => {
  it("without local edits: reloads quietly", async () => {
    const { fs, s } = await setup();
    fs.externalWrite("w", "a.md", "one\ntwo\nthree\n");
    await s.onWatch();
    expect(s.text).toBe("one\ntwo\nthree\n");
    expect(s.state).toBe("saved");
  });
  it("with local edits: conflict, nothing merged, both versions safe", async () => {
    const { fs, s } = await setup();
    s.edit("one\nmine\n");
    fs.externalWrite("w", "a.md", "one\ntheirs\n");
    await s.onWatch();
    expect(s.state).toBe("conflict");
    await s.save(); // a save attempt must not overwrite
    expect(s.state).toBe("conflict");
    expect(s.text).toBe("one\nmine\n");
    expect((await fs.read("w", "a.md")).body).toBe("one\ntheirs\n");
  });
  it("keep mine snapshots the other version first; use the other one snapshots mine", async () => {
    let t = await setup();
    t.s.edit("mine\n"); t.fs.externalWrite("w", "a.md", "theirs\n"); await t.s.onWatch();
    await t.s.keepMine();
    expect(t.s.snapshots).toEqual([{ label: "Before overwrite", text: "theirs\n" }]);
    expect((await t.fs.read("w", "a.md")).body).toBe("mine\n");
    t = await setup();
    t.s.edit("mine\n"); t.fs.externalWrite("w", "a.md", "theirs\n"); await t.s.onWatch();
    await t.s.useTheirs();
    expect(t.s.snapshots).toEqual([{ label: "Before reload", text: "mine\n" }]);
    expect(t.s.text).toBe("theirs\n");
  });
  it("our own write echoing back is ignored", async () => {
    const { s } = await setup();
    s.edit("changed\n"); await s.save(); await s.onWatch();
    expect(s.state).toBe("saved");
  });
});

describe("delete outside the app", () => {
  it("keeps unsaved edits and can restore the note", async () => {
    const { fs, s } = await setup();
    s.edit("my work\n");
    fs.externalRemove("w", "a.md");
    await s.onWatch();
    expect(s.state).toBe("deleted");
    expect(s.text).toBe("my work\n");
    await fs.write("w", "a.md", s.text); // Restore note
    expect((await fs.read("w", "a.md")).body).toBe("my work\n");
  });
  it("a clean note that disappears is offered Close, with its text intact", async () => {
    const { fs, s } = await setup();
    fs.externalRemove("w", "a.md");
    expect(decideExternalChange({ dirty: false, baseRev: s.baseRev }, { exists: false })).toEqual({ kind: "deleted", keepEdits: false });
  });
});

describe("permission, disconnect and reconnect", () => {
  it("a protected file never loses the text", async () => {
    const { fs, s } = await setup();
    fs.readOnlyPrefixes = ["a"];
    s.edit("kept\n"); await s.save();
    expect(s.state).toBe("readonly");
    expect(s.text).toBe("kept\n");
    // Copy to a new note
    fs.readOnlyPrefixes = [];
    await fs.write("w", "a copy.md", s.text);
    expect((await fs.read("w", "a copy.md")).body).toBe("kept\n");
  });
  it("edits made offline are written when the connection returns", async () => {
    const { fs, s } = await setup();
    fs.offline = true;
    s.edit("typed while away\n"); await s.save();
    expect(s.state).toBe("disconnected");
    s.edit("typed while away\nmore\n"); await s.save();
    expect(s.state).toBe("disconnected");
    fs.offline = false;
    await s.save();
    expect(s.state).toBe("saved");
    expect((await fs.read("w", "a.md")).body).toBe("typed while away\nmore\n");
  });
});

describe("snapshots and comparing", () => {
  it("restoring takes a Before restore snapshot first", async () => {
    const { fs, s } = await setup("v1\n");
    const old = "v0 (snapshot)\n";
    s.snapshots.push({ label: snapshotLabel("restore-before"), text: s.text });
    const { rev } = await fs.write("w", "a.md", old, { expectedRev: s.baseRev });
    expect(rev).toBe(contentRev(old));
    expect(s.snapshots[0]).toEqual({ label: "Before restore", text: "v1\n" });
  });
  it("labels", () => {
    expect(["before-overwrite", "before-reload", "restore-before", "before-agent-undo", "edit", "close"].map(snapshotLabel))
      .toEqual(["Before overwrite", "Before reload", "Before restore", "Before agent undo", "Auto", "On close"]);
  });
  it("side by side marks removed lines on the left and added on the right", () => {
    const rows = sideBySide("a\nb\nc", "a\nB\nc\nd");
    expect(rows.map((r) => [r.left?.kind ?? "-", r.right?.kind ?? "-"])).toEqual([["same", "same"], ["del", "-"], ["-", "add"], ["same", "same"], ["-", "add"]]);
  });
  it("states: the most serious wins; line counts", () => {
    const base = { dirty: true, saving: false, conflict: false };
    expect(saveStateOf({ ...base, conflict: true, offline: true })).toBe("conflict");
    expect(saveStateOf({ ...base, deleted: true, conflict: true })).toBe("deleted");
    expect(saveStateOf({ ...base, readOnly: true })).toBe("readonly");
    expect(saveStateOf({ ...base, offline: true })).toBe("disconnected");
    expect(saveStateOf({ ...base, saving: true })).toBe("saving");
    expect(saveStateOf(base)).toBe("unsaved");
    expect(saveStateOf({ dirty: false, saving: false, conflict: false })).toBe("saved");
    expect(lineCount("")).toBe(0);
    expect(lineCount("a\nb")).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import {
  attachmentFileName,
  buildAttachmentLink,
  classifyAttachment,
  pastedFileName,
  resolveAttachmentDir,
} from "@takenotes/core/attachments/import";

describe("classifyAttachment (roadmap allowlist)", () => {
  it.each([
    ["pic.png", "image"],
    ["photo.JPG", "image"],
    ["a/b.svg", "image"],
    ["clip.mp3", "audio"],
    ["voice.3gp", "audio"],
    ["movie.mkv", "video"],
    ["clip.webm", "video"],
    ["doc.pdf", "pdf"],
    ["DOC.PDF", "pdf"],
  ])("%s → %s", (name, expected) => {
    expect(classifyAttachment(name)).toBe(expected);
  });

  it.each([["note.md", "unsupported"], ["archive.zip", "unsupported"], ["noext", "unsupported"], [".hidden", "unsupported"], ["", "unsupported"]])(
    "%s → unsupported",
    (name) => {
      expect(classifyAttachment(name)).toBe("unsupported");
    },
  );
});

describe("resolveAttachmentDir", () => {
  it.each([
    ["root", "attachments", "Notes/a.md", ""],
    ["same-folder", "attachments", "Notes/a.md", "Notes"],
    ["same-folder", "attachments", "a.md", ""],
    ["subfolder", "attachments", "Notes/a.md", "Notes/attachments"],
    ["subfolder", "attachments", "a.md", "attachments"],
    ["folder", "media/img", "Notes/a.md", "media/img"],
    ["folder", "/media/img/", "Notes/a.md", "media/img"],
  ] as const)("%s + %s for %s → %s", (mode, folder, note, expected) => {
    expect(resolveAttachmentDir(mode, folder, note)).toBe(expected);
  });

  it("falls back to `attachments` for empty subfolder config", () => {
    expect(resolveAttachmentDir("subfolder", "", "Notes/a.md")).toBe("Notes/attachments");
  });

  it("refuses escaping folder config", () => {
    expect(resolveAttachmentDir("folder", "../out", "a.md")).toBeNull();
    expect(resolveAttachmentDir("folder", "a/../../out", "a.md")).toBeNull();
  });
});

describe("attachmentFileName", () => {
  it("increments per-directory, case-insensitively", () => {
    const siblings = new Set(["pic.png"]);
    expect(attachmentFileName("pic.png", siblings)).toBe("pic 1.png");
    expect(attachmentFileName("PIC.PNG", siblings)).toBe("PIC 1.PNG");
    expect(attachmentFileName("new.png", siblings)).toBe("new.png");
  });
});

describe("pastedFileName", () => {
  it("is timestamped and deterministic per instant", () => {
    const now = new Date(2026, 0, 2, 3, 4, 5);
    expect(pastedFileName("png", now)).toBe("pasted-20260102-030405.png");
    expect(pastedFileName("PNG", now)).toBe("pasted-20260102-030405.png");
    expect(pastedFileName("", now)).toBe("pasted-20260102-030405.png");
  });
});

describe("buildAttachmentLink", () => {
  it("embeds supported kinds as [[…]] in the active format", () => {
    expect(buildAttachmentLink("Notes/pic.png", "Notes/a.md", "shortest", true, "image", "link")).toBe("![[pic.png]]");
    expect(buildAttachmentLink("pic.png", "Notes/a.md", "relative", true, "pdf", "link")).toBe("![[../pic.png]]");
    // Embeds stay wikilink even when the toggle is off (1c scope line).
    expect(buildAttachmentLink("Notes/pic.png", "Notes/a.md", "shortest", false, "image", "link")).toBe("![[pic.png]]");
  });

  it("links unsupported kinds per the toggle, or refuses under skip", () => {
    expect(buildAttachmentLink("Notes/a.zip", "Notes/n.md", "shortest", true, "unsupported", "link")).toBe("[[a.zip]]");
    expect(buildAttachmentLink("Notes/a.zip", "Notes/n.md", "shortest", false, "unsupported", "link")).toBe("[a.zip](a.zip)");
    expect(buildAttachmentLink("Notes/a.zip", "Notes/n.md", "shortest", true, "unsupported", "skip")).toBeNull();
  });
});

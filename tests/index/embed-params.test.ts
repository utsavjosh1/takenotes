import { describe, expect, it } from "vitest";
import { isAttachmentTarget, parseEmbedFragment, parseEmbedSize } from "@takenotes/core/links/embed-params";

describe("parseEmbedSize", () => {
  it.each([
    ["100", { width: 100 }],
    ["100x145", { width: 100, height: 145 }],
    ["007x009", { width: 7, height: 9 }],
    [" 100 ", { width: 100 }],
  ])("%s → %j", (alias, expected) => {
    expect(parseEmbedSize(alias)).toEqual(expected);
  });

  it.each([undefined, "", "  ", "NB", "My Alias", "100x", "x145", "0", "0x10", "-5", "10.5", "100px", "100 x 145"])(
    "%s is not a size",
    (alias) => {
      expect(parseEmbedSize(alias)).toBeNull();
    },
  );
});

describe("parseEmbedFragment", () => {
  it.each([
    ["page=2", { page: 2 }],
    ["height=400", { height: 400 }],
    ["page=3&height=400", { page: 3, height: 400 }],
    ["PAGE=2", { page: 2 }],
  ])("%s → %j", (frag, expected) => {
    expect(parseEmbedFragment(frag)).toEqual(expected);
  });

  it.each([undefined, "", "  ", "My Heading", "^blk", "page", "page=0", "page=-1", "page=2&foo=3", "width=5", "page=2.5"])(
    "%s is not params",
    (frag) => {
      expect(parseEmbedFragment(frag)).toBeNull();
    },
  );
});

describe("isAttachmentTarget", () => {
  it.each(["pic.png", "a/photo.JPG", "clip.mp3", "movie.mkv", "doc.pdf", "doc.pdf#page=2", "img.svg?x=1"])(
    "%s is an attachment",
    (target) => {
      expect(isAttachmentTarget(target)).toBe(true);
    },
  );

  it.each(["Note", "Note.md", "pic.png.md", "archive"])("%s is not an attachment", (target) => {
    expect(isAttachmentTarget(target)).toBe(false);
  });
});

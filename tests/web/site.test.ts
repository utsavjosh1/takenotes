import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { blogPosts, findPost, readingMinutes } from "../../apps/web/src/blog-content";
import { Blog, BlogArticle, BlogNotFound } from "../../apps/web/src/components/Blog";
import { pageFromHash, postHref } from "../../apps/web/src/navigation";
import { parseTheme, resolveTheme } from "../../apps/web/src/theme";

describe("web navigation", () => {
  it("keeps landing-page anchors separate from journal routes", () => {
    for (const hash of ["", "#top", "#features", "#faq", "#download"]) {
      expect(pageFromHash(hash)).toEqual({ kind: "home" });
    }
    expect(pageFromHash("#/blog")).toEqual({ kind: "blog" });
    expect(pageFromHash("#/blog/")).toEqual({ kind: "blog" });
  });

  it("resolves static-host article permalinks and section links", () => {
    const slug = "your-notes-are-files";
    expect(pageFromHash(postHref(slug))).toEqual({ kind: "post", slug });
    expect(pageFromHash(`${postHref(slug)}?section=2`)).toEqual({ kind: "post", slug, section: 2 });
    expect(pageFromHash(`${postHref(slug)}/`)).toEqual({ kind: "post", slug });
  });

  it("rejects malformed routes without throwing or treating them as home", () => {
    for (const hash of ["#/other", "#/blog/a/b", "#/blog/%E0%A4%A", "#/blog/a?section=0", "#/blog/a?section=-1", "#/blog/a?section=1000"]) {
      expect(pageFromHash(hash)).toEqual({ kind: "not-found" });
    }
    expect(findPost("missing-story")).toBeUndefined();
  });
});

describe("website theme preference", () => {
  it("uses the system theme only when there is no valid stored preference", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("ignores malformed or cleared storage", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    for (const value of [undefined, null, "", "system", "unexpected", "DARK"]) {
      expect(parseTheme(value)).toBeNull();
    }
  });
});

describe("journal content and rendering", () => {
  it("has unique routable articles, readable bodies, and real reading estimates", () => {
    expect(new Set(blogPosts.map((post) => post.slug)).size).toBe(blogPosts.length);
    for (const post of blogPosts) {
      expect(findPost(post.slug)).toBe(post);
      expect(pageFromHash(postHref(post.slug))).toMatchObject({ kind: "post", slug: post.slug });
      expect(readingMinutes(post)).toBeGreaterThan(0);
      expect(post.sections.length).toBeGreaterThan(0);
      expect(post.sections.every((section) => section.heading && section.paragraphs.length)).toBe(true);
    }
  });

  it("renders the listing with discoverable article links and filter labels", () => {
    const html = renderToStaticMarkup(createElement(Blog));
    expect(html).toContain('aria-label="Filter articles by category"');
    for (const post of blogPosts) expect(html).toContain(`href="${postHref(post.slug)}"`);
    expect((html.match(/<h1[ >]/g) ?? []).length).toBe(1);
  });

  it("renders accessible article sections and a return path", () => {
    for (const post of blogPosts) {
      const html = renderToStaticMarkup(createElement(BlogArticle, { post }));
      expect(html).toContain('href="#/blog"');
      expect((html.match(/<h1[ >]/g) ?? []).length).toBe(1);
      post.sections.forEach((_, index) => {
        expect(html).toContain(`id="article-section-${index + 1}"`);
        expect(html).toContain(`href="${postHref(post.slug)}?section=${index + 1}"`);
      });
    }
  });

  it("offers a recovery path for missing stories", () => {
    const html = renderToStaticMarkup(createElement(BlogNotFound));
    expect(html).toContain('href="#/blog"');
    expect(html).toContain("Back to the journal");
  });
});

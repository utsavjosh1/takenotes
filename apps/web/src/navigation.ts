import { useSyncExternalStore } from "react";

export type Page = { kind: "home" } | { kind: "blog" } | { kind: "post"; slug: string; section?: number } | { kind: "not-found" };

// Hash pages keep direct article links working on static hosts without rewrites.
// Ordinary #features / #faq anchors continue to address the home page.
export function pageFromHash(hash: string): Page {
  if (hash === "#/blog" || hash === "#/blog/") return { kind: "blog" };
  const match = /^#\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?(?:\?section=([1-9]\d{0,2}))?$/.exec(hash);
  if (match?.[1]) return { kind: "post", slug: match[1], section: match[2] ? Number(match[2]) : undefined };
  if (hash.startsWith("#/")) return { kind: "not-found" };
  return { kind: "home" };
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function useLocationHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash, () => "");
}

export function postHref(slug: string): string {
  return `#/blog/${slug}`;
}

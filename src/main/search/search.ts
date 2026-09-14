import { promises as fs } from "node:fs";
import path from "node:path";

export type SearchOptions = {
  query: string;
  includeFilenames: boolean;
  includeContent: boolean;
  maxResults: number;
  signal?: AbortSignal;
};

export type SearchMatch = {
  relativePath: string;
  line: number;
  column: number;
  preview: string;
};

const EXCLUDED_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".cache"]);
const MAX_SEARCH_FILE_BYTES = 1024 * 1024;
const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);

/** Bounded-concurrency literal search over the workspace. No index, no DB. */
export async function searchWorkspace(root: string, options: SearchOptions): Promise<SearchMatch[]> {
  const { query, maxResults } = options;
  if (!query) return [];
  const matches: SearchMatch[] = [];
  const dirs: string[] = [root];
  let cancelled = options.signal?.aborted ?? false;
  options.signal?.addEventListener("abort", () => {
    cancelled = true;
  });

  async function* walk(): AsyncGenerator<{ abs: string; rel: string }> {
    while (dirs.length > 0) {
      if (cancelled) return;
      const dir = dirs.pop()!;
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (cancelled) return;
        if (e.isDirectory()) {
          if (!EXCLUDED_DIRS.has(e.name)) dirs.push(path.join(dir, e.name));
        } else {
          const abs = path.join(dir, e.name);
          yield { abs, rel: path.relative(root, abs) };
        }
      }
    }
  }

  // Bounded concurrency work queue (32 files at a time).
  const CONCURRENCY = 32;
  const pending: Promise<void>[] = [];
  const pushFile = (abs: string, rel: string): void => {
    const p = (async () => {
      if (matches.length >= maxResults || cancelled) return;
      const lower = rel.toLowerCase();
      if (options.includeFilenames && lower.includes(query.toLowerCase())) {
        matches.push({ relativePath: rel, line: 0, column: 0, preview: rel });
      }
      if (!options.includeContent) return;
      const ext = lower.slice(lower.lastIndexOf("."));
      if (!TEXT_EXTENSIONS.has(ext)) return;
      let stat;
      try {
        stat = await fs.stat(abs);
      } catch {
        return;
      }
      if (stat.size > MAX_SEARCH_FILE_BYTES) return;
      let text: string;
      try {
        text = await fs.readFile(abs, "utf8");
      } catch {
        return;
      }
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const col = lines[i]!.toLowerCase().indexOf(query.toLowerCase());
        if (col >= 0) {
          matches.push({ relativePath: rel, line: i + 1, column: col + 1, preview: lines[i]!.slice(0, 200) });
          if (matches.length >= maxResults) return;
          break; // one match per file keeps results bounded
        }
      }
    })();
    pending.push(p);
    if (pending.length >= CONCURRENCY) {
      void Promise.all(pending.splice(0, pending.length));
    }
  };

  for await (const f of walk()) {
    pushFile(f.abs, f.rel);
    if (matches.length >= maxResults || cancelled) break;
  }
  await Promise.all(pending);
  return matches.slice(0, maxResults);
}

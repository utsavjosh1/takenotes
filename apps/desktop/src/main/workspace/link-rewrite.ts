import path from "node:path";

function stripMarkdownExtension(rel: string): string {
  return rel.replace(/\.md$/i, "").replace(/\.markdown$/i, "");
}

function splitTarget(target: string): { pathPart: string; suffix: string } {
  const hash = target.indexOf("#");
  if (hash === -1) return { pathPart: target, suffix: "" };
  return { pathPart: target.slice(0, hash), suffix: target.slice(hash) };
}

function replacementForPath(pathPart: string, oldRel: string, newRel: string, allowBare: boolean): string | null {
  const oldNoExt = stripMarkdownExtension(oldRel);
  const newNoExt = stripMarkdownExtension(newRel);
  const pathQualified = pathPart.includes("/");
  if (pathQualified && pathPart === oldRel) return newRel;
  if (pathQualified && pathPart === oldNoExt) return newNoExt;
  if (allowBare) {
    const oldBase = path.posix.basename(oldNoExt);
    const newBase = path.posix.basename(newNoExt);
    if (pathPart === oldBase) return newBase;
    if (pathPart === `${oldBase}.md`) return `${newBase}.md`;
  }
  return null;
}

function replacementForDirectory(pathPart: string, oldDir: string, newDir: string): string | null {
  const oldPrefix = oldDir.endsWith("/") ? oldDir : `${oldDir}/`;
  const newPrefix = newDir.endsWith("/") ? newDir : `${newDir}/`;
  if (pathPart === oldDir) return newDir;
  if (pathPart.startsWith(oldPrefix)) return `${newPrefix}${pathPart.slice(oldPrefix.length)}`;
  return null;
}

/** Rewrite Obsidian-style wikilinks after an already-validated rename.
 * Markdown files remain authoritative; this is a textual service-layer
 * mutation, not an index sidecar. It preserves aliases, headings/block
 * fragments, embeds, and unresolved links that do not target the moved path.
 */
export function rewriteWikilinksForMove(
  content: string,
  oldRel: string,
  newRel: string,
  options: { kind: "file" | "directory"; allowBareFileName: boolean },
): string {
  return content.replace(/(!?)\[\[([^\]\n]+)\]\]/g, (full: string, embed: string, inner: string) => {
    const pipe = inner.indexOf("|");
    const target = pipe === -1 ? inner : inner.slice(0, pipe);
    const alias = pipe === -1 ? "" : inner.slice(pipe);
    const { pathPart, suffix } = splitTarget(target);
    if (pathPart === "") return full;
    const nextPath = options.kind === "directory"
      ? replacementForDirectory(pathPart, oldRel, newRel)
      : replacementForPath(pathPart, oldRel, newRel, options.allowBareFileName);
    if (!nextPath) return full;
    return `${embed}[[${nextPath}${suffix}${alias}]]`;
  });
}

export function hasDuplicateBareName(paths: string[], oldRel: string): boolean {
  const oldBase = path.posix.basename(stripMarkdownExtension(oldRel)).toLocaleLowerCase();
  let matches = 0;
  for (const rel of paths) {
    if (path.posix.basename(stripMarkdownExtension(rel)).toLocaleLowerCase() === oldBase) matches += 1;
    if (matches > 1) return true;
  }
  return false;
}

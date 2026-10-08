/** Embed display params (Step 4): `![[image.png|100x145]]` dimensions and
 * `![[Doc.pdf#page=N]]` / `#height=` fragments.
 *
 * Pure, total, host-independent. Presentational only — the index drops
 * these (they never affect resolution), while the reference renderer and
 * the editor preview honor them. Garbage degrades to "no params", never
 * to a thrown error or a broken tag.
 */

export type EmbedSize = {
  width?: number;
  height?: number;
};

export type EmbedFragmentParams = {
  /** PDF viewer page (`#page=N`). */
  page?: number;
  /** Viewer height in px (`#height=N`, images and PDFs). */
  height?: number;
};

/** Parse a positive int param (leading zeros fine, negatives/decimals/zero
 * refuse — a `0`-wide image is never what the author meant). */
function positiveInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= 100000 ? n : null;
}

/** Parse an embed size from the `|alias` slot (`100` = width only,
 * `100x145` = width × height). Anything else (real aliases included) is
 * not a size — returns null so callers keep the alias. */
export function parseEmbedSize(alias: string | undefined): EmbedSize | null {
  if (alias === undefined) return null;
  const t = alias.trim();
  if (!t) return null;
  const m = /^(\d+)(?:x(\d+))?$/.exec(t);
  if (!m) return null;
  const width = positiveInt(m[1]!);
  if (width === null) return null;
  if (m[2] === undefined) return { width };
  const height = positiveInt(m[2]);
  return height === null ? null : { width, height };
}

/** True when an embed target is an attachment (audio/video/PDF/image).
 * Only attachment embeds take display params — a `|100` slot on a note
 * embed stays an alias, matching the renderer. Fragment/query ignored. */
export function isAttachmentTarget(target: string): boolean {
  const base = target.split(/[?#]/)[0] ?? "";
  return /\.(mp3|wav|ogg|oga|m4a|flac|aac|opus|mp4|webm|mov|mkv|ogv|m4v|pdf|png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(base);
}

/** Parse an embed `#fragment` (`page=N`, `height=N`, `&`-combined). All-or-
 * nothing: every `&`-pair must be a recognized key with a valid int, or
 * the fragment is not params at all (a `#My Heading` keeps its heading
 * classification). Empty/undefined fragments are not params. */
export function parseEmbedFragment(fragment: string | undefined): EmbedFragmentParams | null {
  if (fragment === undefined) return null;
  const t = fragment.trim();
  if (!t) return null;
  const out: EmbedFragmentParams = {};
  for (const pair of t.split("&")) {
    const eq = pair.indexOf("=");
    if (eq < 0) return null;
    const key = pair.slice(0, eq).trim().toLowerCase();
    const value = positiveInt(pair.slice(eq + 1).trim());
    if (value === null) return null;
    if (key === "page") out.page = value;
    else if (key === "height") out.height = value;
    else return null;
  }
  return out;
}

/** Note templates (filesystem-first, no database).
 *
 * A template is an ordinary Markdown file under the configured template
 * folder. Insertion renders `{{title}}`, `{{date}}`, `{{time}}` only and
 * splices the result at the cursor — nothing else is substituted, executed,
 * or stored. Unknown `{{…}}` tokens pass through untouched so a typo is
 * visible instead of silently eaten.
 */

export type NoteTemplateVars = {
  title: string;
  date: string;
  time: string;
};

const NOTE_TEMPLATE_VAR_RE = /\{\{\s*(title|date|time)\s*\}\}/g;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** `YYYY-MM-DD` for `{{date}}` (local calendar date). */
export function templateDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** `HH:MM` for `{{time}}` (local clock). */
export function templateTime(now = new Date()): string {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

/** Filename stem for `{{title}}` (`Notes/Idea.md` → `Idea`). */
export function templateTitleForPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  return base.replace(/\.(md|markdown|txt)$/i, "") || base;
}

/** Render only `{{title}}`, `{{date}}`, `{{time}}`. Everything else stays. */
export function renderNoteTemplate(template: string, vars: NoteTemplateVars): string {
  return template.replace(NOTE_TEMPLATE_VAR_RE, (_match, key: string) => {
    if (key === "title") return vars.title;
    if (key === "date") return vars.date;
    if (key === "time") return vars.time;
    return _match;
  });
}

function normalizeFolder(folder: string): string {
  return folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/** Relative paths of `.md` files directly under `folder/` (sorted). */
export function listNoteTemplates(relativePaths: string[], templateFolder: string): string[] {
  const folder = normalizeFolder(templateFolder);
  if (!folder) return [];
  const prefix = `${folder.toLowerCase()}/`;
  return relativePaths
    .filter((p) => {
      const normalized = p.replace(/\\/g, "/");
      return normalized.toLowerCase().startsWith(prefix) && /\.md$/i.test(normalized);
    })
    .sort((a, b) => a.localeCompare(b));
}

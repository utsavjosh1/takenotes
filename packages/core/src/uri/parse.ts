/** Step 8 URI minimal (Phase 5e): `takenotes://` parsing, pure + total.
 *
 * Four actions, nothing else:
 * - `open` — file/path/heading/block locators, tab pane only (MVP has
 *   no splits, so any other pane value is an honest INVALID_REQUEST).
 * - `new` — name/path/content (creation-path-from-link honored by the
 *   renderer, which resolves the name exactly like a `[[link]]`).
 * - `daily` — today's Daily Note (no params; the renderer confirms
 *   creation exactly like the `note.openToday` command — URIs never
 *   silent-create either).
 * - `search` — query string (seeds the search pane).
 *
 * `x-success` / `x-error` ride along as opaque echo strings (≤2 KiB):
 * accepted, validated, carried on the parsed output — never opened,
 * never fetched. There are no callbacks and no `hook-get-address`.
 *
 * Paths are confined here with the POSIX policy (services re-validate
 * with kind-appropriate rules — defense in depth). The `bundle` host
 * is reserved for the renderer fallback and never parses as automation.
 * Unknown query params are ignored (documented leniency — automation
 * actions have no destructive ops, see guardrails in
 * `apps/desktop/src/main/uri/handler.ts`).
 */
import { appError, type AppError } from "@takenotes/contracts/errors";
import { validatePosixRelativePath } from "../policy/note-policy.js";

export type UriOpenAction = {
  action: "open";
  /** Workspace-relative note path (absent = no-op anchor without file). */
  path?: string;
  /** Heading anchor or text (matched against index anchors first). */
  heading?: string;
  /** Block id without the caret (`^id` → `id`). */
  block?: string;
  /** Pane target: only `tab` exists in MVP. */
  pane?: "tab";
};

export type UriNewAction = {
  action: "new";
  name?: string;
  path?: string;
  content?: string;
};

export type UriDailyAction = {
  action: "daily";
};

export type UriSearchAction = {
  action: "search";
  query: string;
};

export type UriAction = UriOpenAction | UriNewAction | UriDailyAction | UriSearchAction;

export type ParsedTakenotesUri = {
  action: UriAction;
  /** Opaque `x-success` echo (never opened). */
  success?: string;
  /** Opaque `x-error` echo (never opened). */
  errorEcho?: string;
};

export const URI_HOSTS = ["open", "new", "daily", "search"] as const;

const MAX_PARAM_CHARS = 2048;

function param(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key);
  if (value === null || value === "") return undefined;
  if (value.length > MAX_PARAM_CHARS) return undefined;
  return value;
}

function echoParam(url: URL, key: string): { value?: string } | { error: AppError } {
  const raw = url.searchParams.get(key);
  if (raw === null || raw === "") return {};
  if (raw.length > MAX_PARAM_CHARS) {
    return { error: appError("INVALID_REQUEST", `Param "${key}" is too long (2 KiB max).`) };
  }
  return { value: raw };
}

function checkedPath(raw: string | undefined): { path?: string } | { error: AppError } {
  if (raw === undefined) return {};
  const checked = validatePosixRelativePath(raw);
  if ("error" in checked) return checked;
  return { path: checked.relativePath };
}

export function parseTakenotesUri(input: unknown): { ok: true; uri: ParsedTakenotesUri } | { ok: false; error: AppError } {
  if (typeof input !== "string" || !input.trim()) {
    return { ok: false, error: appError("INVALID_REQUEST", "Empty URI.") };
  }
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, error: appError("INVALID_REQUEST", "Malformed URI.") };
  }
  if (url.protocol !== "takenotes:") {
    return { ok: false, error: appError("INVALID_REQUEST", `Unsupported scheme "${url.protocol}".`) };
  }
  const host = url.hostname.toLowerCase();
  if (host === "bundle") {
    return { ok: false, error: appError("INVALID_REQUEST", "Reserved URI host (renderer bundle).") };
  }
  if (host !== "open" && host !== "new" && host !== "daily" && host !== "search") {
    return { ok: false, error: appError("INVALID_REQUEST", `Unknown action "${url.hostname}" (open/new/daily/search only).`) };
  }

  const success = echoParam(url, "x-success");
  if ("error" in success) return { ok: false as const, error: success.error };
  const errorEcho = echoParam(url, "x-error");
  if ("error" in errorEcho) return { ok: false as const, error: errorEcho.error };
  const echo = {
    ...(success.value !== undefined ? { success: success.value } : {}),
    ...(errorEcho.value !== undefined ? { errorEcho: errorEcho.value } : {}),
  };

  switch (host) {
    case "open": {
      const file = param(url, "file") ?? param(url, "path");
      const path = checkedPath(file);
      if ("error" in path) return { ok: false as const, error: path.error };
      const paneRaw = param(url, "pane");
      if (paneRaw !== undefined && paneRaw !== "tab") {
        return { ok: false, error: appError("INVALID_REQUEST", `Unknown pane "${paneRaw}" (tab only — no splits in MVP).`) };
      }
      const blockRaw = param(url, "block");
      const block = blockRaw?.startsWith("^") ? blockRaw.slice(1) : blockRaw;
      if (block !== undefined && !/^[A-Za-z0-9-]+$/.test(block)) {
        return { ok: false, error: appError("INVALID_REQUEST", "Malformed block id (^latin-numbers-dashes).") };
      }
      return {
        ok: true,
        uri: {
          action: {
            action: "open",
            ...("path" in path && path.path !== undefined ? { path: path.path } : {}),
            ...(param(url, "heading") !== undefined ? { heading: param(url, "heading")! } : {}),
            ...(block !== undefined ? { block } : {}),
            ...(paneRaw !== undefined ? { pane: "tab" as const } : {}),
          },
          ...echo,
        },
      };
    }
    case "new": {
      const path = checkedPath(param(url, "path"));
      if ("error" in path) return { ok: false as const, error: path.error };
      return {
        ok: true,
        uri: {
          action: {
            action: "new",
            ...(param(url, "name") !== undefined ? { name: param(url, "name")! } : {}),
            ...("path" in path && path.path !== undefined ? { path: path.path } : {}),
            ...(param(url, "content") !== undefined ? { content: param(url, "content")! } : {}),
          },
          ...echo,
        },
      };
    }
    case "daily":
      return { ok: true, uri: { action: { action: "daily" }, ...echo } };
    case "search": {
      const query = param(url, "query") ?? param(url, "q");
      if (!query) {
        return { ok: false, error: appError("INVALID_REQUEST", 'Search needs a non-empty "query".') };
      }
      return { ok: true, uri: { action: { action: "search", query }, ...echo } };
    }
  }
}

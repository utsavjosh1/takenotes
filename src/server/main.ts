/**
 * Self-hosted server entry point (Gate C).
 *
 * Layout:
 * - `$TAKENOTES_DATA/app/` — auth.json, sessions.json, workspaces.json
 * - `$TAKENOTES_DATA/workspaces/<slug>/` — the authoritative note files
 *
 * First boot requires `TAKENOTES_PASSWORD` (min 12 chars) to initialize the
 * owner verifier; subsequent boots open existing state. Restart preserves
 * auth state, sessions (subject to expiry/generation), workspaceIds, and
 * workspace contents — nothing lives outside `$TAKENOTES_DATA`.
 *
 * Cookie posture: production defaults to `__Host-` + `Secure`. Plain local
 * HTTP (e.g. `docker compose` demo without TLS) needs
 * `TAKENOTES_INSECURE_HTTP=1`, which switches to the non-`__Host-` name
 * without `Secure`. Never enable that behind anything but local HTTP.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { serve } from "@hono/node-server";
import { FileOwnerAuth, MIN_PASSWORD_CHARS } from "./auth-store.js";
import { createTakenotesServer } from "./app.js";
import { PersistentServerWorkspaceRegistry } from "./workspace-registry.js";

const SEED_README = `# Notes\n\nSelf-hosted takenotes workspace. Open, edit, and save this file —\nsaves carry the same revision semantics as the desktop app.\n`;

function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function appVersion(): string {
  try {
    const defined = typeof __TAKENOTES_VERSION__ === "string" ? __TAKENOTES_VERSION__ : null;
    if (defined) return defined;
  } catch {
    /* fall through to runtime lookup */
  }
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../../package.json") as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0-dev";
  } catch {
    return "0.0.0-dev";
  }
}

declare const __TAKENOTES_VERSION__: string | undefined;

export async function boot(): Promise<void> {
  const dataDir = env("TAKENOTES_DATA", "/data") ?? "/data";
  const port = Number(env("TAKENOTES_PORT", "3000") ?? "3000");
  // Loopback by default: a bare `node dist-server/server.cjs` must never
  // bind a public interface on its own. The container image opts into
  // `0.0.0.0` explicitly via `TAKENOTES_HOST` (see docker-compose.yml)
  // because container-loopback is unreachable from the host.
  const hostname = env("TAKENOTES_HOST", "127.0.0.1") ?? "127.0.0.1";
  const insecureHttp = env("TAKENOTES_INSECURE_HTTP", "0") === "1";
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid TAKENOTES_PORT: ${env("TAKENOTES_PORT")}`);
    process.exit(1);
  }

  const appDir = path.join(dataDir, "app");
  const workspacesDir = path.join(dataDir, "workspaces");
  await mkdir(appDir, { recursive: true });
  await mkdir(workspacesDir, { recursive: true });

  let auth: FileOwnerAuth;
  try {
    auth = await FileOwnerAuth.open({ appDir, insecureHttp });
  } catch (err) {
    const password = env("TAKENOTES_PASSWORD");
    if (!password) {
      console.error(
        `No auth state at ${path.join(appDir, "auth.json")}. First boot requires TAKENOTES_PASSWORD (min ${MIN_PASSWORD_CHARS} chars).`,
      );
      console.error(`Cause: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    try {
      await FileOwnerAuth.bootstrap(appDir, password);
    } catch (bootstrapErr) {
      console.error(`Auth bootstrap failed: ${bootstrapErr instanceof Error ? bootstrapErr.message : String(bootstrapErr)}`);
      process.exit(1);
    }
    auth = await FileOwnerAuth.open({ appDir, insecureHttp });
    console.error("[takenotes-server] owner auth initialized.");
  }

  const registry = new PersistentServerWorkspaceRegistry(path.join(appDir, "workspaces.json"));
  if (registry.list().length === 0) {
    const ws = await registry.registerManagedWorkspace("Notes", workspacesDir, "notes");
    const readme = path.join(ws.root, "README.md");
    try {
      await writeFile(readme, SEED_README, { flag: "wx" });
    } catch {
      // Seed README already present — leave user content alone.
    }
    console.error(`[takenotes-server] seeded default workspace "Notes" (${ws.workspaceId}).`);
  }

  const app = createTakenotesServer({
    registry,
    auth,
    authStore: auth,
    version: appVersion(),
  });

  const server = serve({ fetch: app.fetch, port, hostname });
  console.error(
    `[takenotes-server] listening on ${hostname}:${port} (data=${dataDir}, insecureHttp=${insecureHttp ? "ON — local HTTP only" : "off"})`,
  );

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`[takenotes-server] ${signal} received — draining...`);
    const force = setTimeout(() => {
      console.error("[takenotes-server] forced exit after grace period.");
      process.exit(0);
    }, 10_000);
    (force as unknown as { unref?: () => void }).unref?.();
    server.close((err) => {
      if (err) {
        console.error(`[takenotes-server] close error: ${String(err)}`);
        process.exit(1);
      }
      console.error("[takenotes-server] shut down cleanly.");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

const isDirectRun = process.argv[1]?.endsWith("server.cjs") || process.argv[1]?.endsWith("main.ts");
if (isDirectRun) {
  boot().catch((err) => {
    console.error(`[takenotes-server] fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}

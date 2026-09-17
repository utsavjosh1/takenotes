/** electron-builder `afterPack` hook: flip Electron fuses on the packaged binary.
 *
 * Fuse choices (Electron 44, `@electron/fuses` 2.1.3; semantics verified
 * against the Electron fuses tutorial and the installed `@electron/fuses`
 * README before setting each fuse — see `docs/audit/electron-fuses.md`):
 *
 * - RunAsNode=false — the app must never run as a Node runtime
 *   (`ELECTRON_RUN_AS_NODE`). Nothing relies on it.
 * - EnableNodeOptionsEnvironmentVariable=false — NODE_OPTIONS injection into
 *   the packaged runtime is disabled. No feature reads NODE_OPTIONS.
 * - EnableNodeCliInspectArguments=false — `--inspect` family disabled in the
 *   packaged app. Dev DevTools come from `--dev` + openDevTools, not CLI flags.
 * - EnableEmbeddedAsarIntegrityValidation=true — validates app.asar on launch
 *   (enforced on Windows/macOS). Nothing modifies asar at runtime.
 * - OnlyLoadAppFromAsar=true — app loads only from app.asar. The build emits
 *   a bundled asar; dev (`--dev`/Vite URL) is unaffected because fuses only
 *   apply to packaged binaries.
 * - LoadBrowserProcessSpecificV8Snapshot=false — stock Electron dist ships only
 *   `snapshot_blob.bin` + `v8_context_snapshot.bin`. Setting this true makes the
 *   browser process load from `browser_v8_context_snapshot.bin` /
 *   `browser_snapshot_blob.bin` instead, which we do not generate or ship
 *   (no mksnapshot step). `true` produces
 *   `FATAL:gin/v8_initializer.cc Error loading V8 startup snapshot file`
 *   on launch even with all stock siblings present (seen 2026-09-18 on
 *   Windows, `D:\apps\takenotes`). Measured stock default on Electron 44
 *   is Disabled; keep false until a custom browser snapshot pipeline exists.
 * - GrantFileProtocolExtraPrivileges=false — the renderer loads via file://
 *   (loadFile in production) with no need for extra file-protocol privileges.
 * - EnableCookieEncryption=true — no cookies exist (no network); strictest option, zero cost.
 * - WasmTrapHandlers=true — default trap-based WASM handling. Electron 44
 *   added this 9th fuse; `@electron/fuses` 1.8.0 only knew 8, so
 *   `strictlyRequireAllFuses` failed packaging loudly (release v0.0.1).
 *
 * `strictlyRequireAllFuses: true` fails future Electron upgrades loudly if a
 * new fuse appears that has not been evaluated.
 */
import path from "node:path";
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";

export const FUSE_CONFIG = {
  version: FuseVersion.V1,
  strictlyRequireAllFuses: true,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  [FuseV1Options.WasmTrapHandlers]: true,
};

/** Resolve the packaged Electron executable inside `appOutDir` per platform. */
export function packagedBinaryPath(appOutDir, electronPlatformName, productFilename) {
  if (electronPlatformName === "darwin") {
    return path.join(appOutDir, `${productFilename}.app`, "Contents", "MacOS", productFilename);
  }
  if (electronPlatformName === "win32") {
    return path.join(appOutDir, `${productFilename}.exe`);
  }
  return path.join(appOutDir, productFilename);
}

/** @param {import("app-builder-lib").AfterPackContext} context */
export default async function afterPack(context) {
  const binaryPath = packagedBinaryPath(
    context.appOutDir,
    context.electronPlatformName,
    context.packager.appInfo.productFilename,
  );
  await flipFuses(binaryPath, {
    ...FUSE_CONFIG,
    resetAdHocDarwinSignature: context.electronPlatformName === "darwin" && context.arch === "arm64",
  });
  console.log("[fuses] flipped:", binaryPath);
}

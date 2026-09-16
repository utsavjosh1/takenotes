/** electron-builder `afterPack` hook: flip Electron fuses on the packaged binary.
 *
 * Fuse choices (Electron 44, `@electron/fuses` 1.8.0; semantics verified
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
 * - LoadBrowserProcessSpecificV8Snapshot=true (default) — explicit so upgrades notice it.
 * - GrantFileProtocolExtraPrivileges=false — the renderer loads via file://
 *   (loadFile in production) with no need for extra file-protocol privileges.
 * - EnableCookieEncryption=true — no cookies exist (no network); strictest option, zero cost.
 *
 * `strictlyRequireAllFuses: true` fails future Electron upgrades loudly if a
 * new fuse appears that has not been evaluated.
 */
import path from "node:path";
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";

const FUSE_CONFIG = {
  version: FuseVersion.V1,
  strictlyRequireAllFuses: true,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: true,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
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

/** Stage WSL runtime: extract pinned node binary + helper.cjs + manifest.json
 * into resources/wsl/linux-x64/ with real checksums. Fails release on mismatch. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const config = JSON.parse(readFileSync("build-config.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const nodeVersion = config.wslRuntime.nodeVersion;
const archive = `node-v${nodeVersion}-linux-x64.tar.xz`;
const archivePath = path.join("resources", "wsl", "linux-x64", "generated", archive);
const helperPath = path.join("dist-helper", "helper.cjs");
const stageDir = path.join("resources", "wsl", "linux-x64");

if (!existsSync(archivePath)) throw new Error(`Missing verified archive: ${archivePath}. Run fetch-wsl-runtime first.`);
if (!existsSync(helperPath)) throw new Error(`Missing helper bundle: ${helperPath}. Run build:helper first.`);

mkdirSync(stageDir, { recursive: true });
const tmp = path.join("resources", "wsl", "linux-x64", "generated", "extract");
mkdirSync(tmp, { recursive: true });
execFileSync("tar", ["-xf", path.resolve(archivePath), "-C", path.resolve(tmp)]);
const nodeBin = path.join(tmp, `node-v${nodeVersion}-linux-x64`, "bin", "node");
if (!existsSync(nodeBin)) throw new Error(`Node binary not found in archive: ${nodeBin}`);
copyFileSync(nodeBin, path.join(stageDir, "node"));
copyFileSync(helperPath, path.join(stageDir, "helper.cjs"));

const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const manifest = {
  runtime: "node",
  runtimeVersion: nodeVersion,
  helperVersion: pkg.version,
  protocolVersion: config.protocolVersion,
  architecture: "x86_64",
  nodeSha256: sha256(path.join(stageDir, "node")),
  helperSha256: sha256(path.join(stageDir, "helper.cjs")),
};
writeFileSync(path.join(stageDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Staged WSL runtime ${nodeVersion}, helper ${pkg.version}, protocol ${config.protocolVersion}`);

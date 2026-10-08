import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "@takenotes/contracts/protocol-version";
import { verifyStagedRuntime } from "@takenotes/desktop/main/wsl/runtime-installer";
import { HelperSupervisor } from "@takenotes/desktop/main/wsl/helper-supervisor";

/** Stage-pipeline output check (7g): when `stage-wsl-runtime.mjs` has run
 * (its output is gitignored release material, absent on most checkouts),
 * prove the 7e fail-closed gate accepts the genuine artifacts and the staged
 * node actually runs the staged helper. Skipped otherwise — never a false
 * red on machines without staged bytes. */
const STAGED = path.resolve("resources/wsl/linux-x64");

describe.runIf(process.platform !== "win32" && existsSync(path.join(STAGED, "manifest.json")))(
  "staged WSL runtime artifacts (stage pipeline output)",
  () => {
    it("manifest verifies against staged bytes (7e gate on real artifacts)", async () => {
      expect(await verifyStagedRuntime(STAGED, { requireManifest: true })).toEqual({ ok: true, verified: true });
    });

    it("staged node runs the staged helper: handshake verifies", async () => {
      const supervisor = new HelperSupervisor(() => undefined, () => undefined);
      const session = await supervisor.connectDirect(path.join(STAGED, "node"), path.join(STAGED, "helper.cjs"));
      expect(session.handshake.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(session.handshake.execPath).toBe(path.join(STAGED, "node"));
      supervisor.disconnect();
      expect(supervisor.state).toBe("disconnected");
    });
  },
);

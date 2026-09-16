import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../../src/shared/protocol-version";
import { HelperSupervisor } from "../../src/main/wsl/helper-supervisor";
import { HelperClient } from "../../src/main/wsl/helper-client";

async function ensureHelperBuilt(): Promise<string> {
  const { execFileSync } = await import("node:child_process");
  execFileSync("node", ["scripts/build-helper.mjs"], { stdio: "pipe" });
  return path.resolve("dist-helper/helper.cjs");
}

describe("handshake trust (nonce + runtime path)", () => {
  it("accepts the real helper: nonce echoed, execPath verified", async () => {
    const helper = await ensureHelperBuilt();
    const supervisor = new HelperSupervisor(() => undefined, () => undefined);
    const session = await supervisor.connectDirect(process.execPath, helper);
    expect(supervisor.state).toBe("connected");
    expect(session.handshake.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(session.handshake.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(session.handshake.execPath).toBe(process.execPath);
    expect(session.handshake.platform).toBe("linux");
    supervisor.disconnect();
    expect(supervisor.state).toBe("disconnected");
  });

  it("refuses a helper that answers with the wrong nonce", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(path.join(tmpdir(), "dn-fakehelper-"));
    const fakePath = path.join(dir, "fake.cjs");
    writeFileSync(
      fakePath,
      `let b=Buffer.alloc(0);process.stdin.on('data',c=>{b=Buffer.concat([b,c]);const l=b.readUInt32BE(0);if(b.length>=4+l){const m=JSON.parse(b.subarray(4,4+l).toString());` +
        `const body=Buffer.from(JSON.stringify({requestId:m.requestId,ok:true,result:{protocolVersion:${PROTOCOL_VERSION},helperVersion:'x',runtimeVersion:'v',platform:'linux',architecture:'x64',capabilities:[],processId:1,nonce:'WRONG',execPath:'${process.execPath}',uid:1,home:'/root'}}));` +
        `const h=Buffer.alloc(4);h.writeUInt32BE(body.length,0);process.stdout.write(Buffer.concat([h,body]));}});`,
    );
    const supervisor = new HelperSupervisor(() => undefined, () => undefined);
    await expect(supervisor.connectDirect(process.execPath, fakePath)).rejects.toThrow(/nonce/i);
    expect(supervisor.state).toBe("incompatible");
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a helper that echoes the nonce but reports a foreign runtime path", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(path.join(tmpdir(), "dn-fakehelper-"));
    const fakePath = path.join(dir, "fake2.cjs");
    writeFileSync(
      fakePath,
      `let b=Buffer.alloc(0);process.stdin.on('data',c=>{b=Buffer.concat([b,c]);const l=b.readUInt32BE(0);if(b.length>=4+l){const m=JSON.parse(b.subarray(4,4+l).toString());` +
        `const p=m.payload||{};const body=Buffer.from(JSON.stringify({requestId:m.requestId,ok:true,result:{protocolVersion:${PROTOCOL_VERSION},helperVersion:'x',runtimeVersion:'v',platform:'linux',architecture:'x64',capabilities:[],processId:1,nonce:p.nonce,execPath:'/usr/bin/node',uid:1,home:'/root'}}));` +
        `const h=Buffer.alloc(4);h.writeUInt32BE(body.length,0);process.stdout.write(Buffer.concat([h,body]));}});`,
    );
    const supervisor = new HelperSupervisor(() => undefined, () => undefined);
    await expect(supervisor.connectDirect(process.execPath, fakePath)).rejects.toThrow(/execPath|app-owned runtime/i);
    expect(supervisor.state).toBe("incompatible");
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails cleanly (no unhandled exception) when the runtime binary is missing", async () => {
    const helper = await ensureHelperBuilt();
    const supervisor = new HelperSupervisor(() => undefined, () => undefined);
    await expect(supervisor.connectDirect("/nonexistent/fake-node", helper)).rejects.toMatchObject({
      code: "DISCONNECTED",
    });
    expect(supervisor.state).toBe("disconnected");
  });
});

describe("protocol violation handling", () => {
  it("emits protocolError on stdout garbage (supervisor kills on this event)", async () => {
    const { EventEmitter } = await import("node:events");
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const child = new EventEmitter() as unknown as import("node:child_process").ChildProcess;
    (child as unknown as Record<string, unknown>).stdout = stdout;
    (child as unknown as Record<string, unknown>).stderr = stderr;
    (child as unknown as Record<string, unknown>).stdin = { write: (_b: unknown, cb?: () => void) => cb?.() };
    const client = new HelperClient(child, 1000);
    const seen = new Promise<string>((resolve) => client.on("protocolError", resolve));
    stdout.emit("data", Buffer.from("THIS IS NOT A FRAME"));
    await expect(seen).resolves.toMatch(/zero-length|too large|invalid JSON/i);
  });
});

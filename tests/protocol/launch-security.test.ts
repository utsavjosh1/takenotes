import { describe, expect, it } from "vitest";
import { helperEnv, resolveWslExe } from "../../src/main/wsl/launch-security";

describe("helper launch security", () => {
  it("resolves wsl.exe without PATH trust on Windows; bare name elsewhere", () => {
    expect(resolveWslExe()).toBe("wsl.exe");
  });

  it("strips Node/proxy steering variables from the helper environment", () => {
    process.env["NODE_OPTIONS"] = "--require /tmp/evil.js";
    process.env["HTTP_PROXY"] = "http://proxy:8080";
    const env = helperEnv();
    expect(env["NODE_OPTIONS"]).toBeUndefined();
    expect(env["NODE_PATH"]).toBeUndefined();
    expect(env["HTTP_PROXY"]).toBeUndefined();
    expect(env["HTTPS_PROXY"]).toBeUndefined();
    expect(env["ALL_PROXY"]).toBeUndefined();
    delete process.env["NODE_OPTIONS"];
    delete process.env["HTTP_PROXY"];
  });

  it("passes explicit extras through", () => {
    expect(helperEnv({ HELPER_VERSION: "9.9.9" })["HELPER_VERSION"]).toBe("9.9.9");
  });
});

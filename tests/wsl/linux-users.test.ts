import { describe, expect, it, vi } from "vitest";
import { buildWslHelperArgv, isValidDistroId, isValidLinuxUser } from "../../src/main/wsl/launch-security";
import { listWslUsers } from "../../src/main/wsl/user-discovery";

describe("buildWslHelperArgv", () => {
  it("passes distro and user as separate argv elements (no shell)", () => {
    expect(buildWslHelperArgv("Ubuntu", "work", "node", "helper.cjs")).toEqual([
      "-d",
      "Ubuntu",
      "-u",
      "work",
      "--exec",
      "node",
      "helper.cjs",
      "--stdio",
    ]);
  });

  it("omits -u for discovery spawns (distro default user)", () => {
    expect(buildWslHelperArgv("Ubuntu", null, "node", "helper.cjs")).toEqual([
      "-d",
      "Ubuntu",
      "--exec",
      "node",
      "helper.cjs",
      "--stdio",
    ]);
  });

  it("refuses hostile distro/user values before they reach spawn", () => {
    expect(() => buildWslHelperArgv("Ubuntu; rm -rf /", "work", "n", "h")).toThrow();
    expect(() => buildWslHelperArgv("Ubuntu", "work\n prog", "n", "h")).toThrow();
    expect(() => buildWslHelperArgv("", "work", "n", "h")).toThrow();
  });
});

describe("distro/user id validation", () => {
  it("accepts real distro names, rejects traversal and NUL", () => {
    expect(isValidDistroId("Ubuntu")).toBe(true);
    expect(isValidDistroId("Ubuntu-22.04")).toBe(true);
    expect(isValidDistroId("../x")).toBe(false);
    expect(isValidDistroId("a\0b")).toBe(false);
    expect(isValidDistroId("")).toBe(false);
  });

  it("accepts real usernames, rejects slashes and NUL", () => {
    expect(isValidLinuxUser("work")).toBe(true);
    expect(isValidLinuxUser("utsav")).toBe(true);
    expect(isValidLinuxUser("../../root")).toBe(false);
    expect(isValidLinuxUser("a\0b")).toBe(false);
    expect(isValidLinuxUser("")).toBe(false);
  });
});

describe("listWslUsers transport (injected session, no wsl.exe)", () => {
  const users = [
    { name: "utsav", uid: 1000, gid: 1000, home: "/home/utsav", shell: "/bin/bash", isCurrent: true },
    { name: "work", uid: 1001, gid: 1001, home: "/home/work", shell: "/bin/bash", isCurrent: false },
  ];

  it("returns structured users for a known distro", async () => {
    const request = vi.fn(async () => ({ users }));
    const dispose = vi.fn();
    const out = await listWslUsers("Ubuntu", {
      spawnSession: async (distro) => {
        expect(distro).toBe("Ubuntu");
        return { request, dispose };
      },
    });
    // Wire names project onto the renderer contract (name→username).
    expect(out).toEqual([
      { username: "utsav", uid: 1000, gid: 1000, home: "/home/utsav", shell: "/bin/bash", isDefault: true },
      { username: "work", uid: 1001, gid: 1001, home: "/home/work", shell: "/bin/bash", isDefault: false },
    ]);
    expect(request).toHaveBeenCalledWith("users.list", {});
    expect(dispose).toHaveBeenCalled();
  });

  it("rejects an unknown distro without spawning", async () => {
    const spawnSession = vi.fn(async () => {
      throw new Error("must not spawn");
    });
    await expect(listWslUsers("../evil", { spawnSession })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(spawnSession).not.toHaveBeenCalled();
  });

  it("maps spawn failure to DISCONNECTED (WSL unavailable)", async () => {
    await expect(
      listWslUsers("Ubuntu", {
        spawnSession: async () => {
          throw new Error("spawn wsl.exe ENOENT");
        },
      }),
    ).rejects.toMatchObject({ code: "DISCONNECTED" });
  });

  it("rejects malformed helper responses (distinct from empty)", async () => {
    await expect(
      listWslUsers("Ubuntu", {
        spawnSession: async () => ({ request: async () => ({ users: "oops" }), dispose: () => undefined }),
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    // A valid empty list is a real answer, not an error.
    await expect(
      listWslUsers("Ubuntu", {
        spawnSession: async () => ({ request: async () => ({ users: [] }), dispose: () => undefined }),
      }),
    ).resolves.toEqual([]);
  });

  it("preserves structured helper errors", async () => {
    await expect(
      listWslUsers("Ubuntu", {
        spawnSession: async () => ({
          request: async () => {
            throw { code: "INTERNAL_ERROR", message: "Could not read user accounts." };
          },
          dispose: () => undefined,
        }),
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", message: "Could not read user accounts." });
  });
});

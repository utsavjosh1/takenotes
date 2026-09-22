import { describe, expect, it } from "vitest";
import { filterCandidateUsers, parsePasswd } from "../../wsl-helper/src/users";

const FIXTURE = [
  "root:x:0:0:root:/root:/bin/bash",
  "daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin",
  "nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin",
  "utsav:x:1000:1000:Utsav:/home/utsav:/bin/bash",
  "work:x:1001:1001:Work:/home/work:/bin/zsh",
  "svc-deploy:x:999:999:deploy:/srv/deploy:/bin/bash",
  "customhome:x:1002:1002:Custom:/data/custom:/bin/bash",
  "appsvc:x:1003:1003:Service:/srv/app:/usr/sbin/nologin",
  "disabled:x:1004:1004:Disabled:/home/disabled:/bin/false",
  "",
  "this line has no colons at all",
  "baduid:x:notanumber:1003:Bad:/home/bad:/bin/bash",
  ":x:1004:1004:EmptyName:/home/empty:/bin/bash",
].join("\n");

describe("parsePasswd", () => {
  it("parses username/uid/gid/home/shell and skips malformed rows", () => {
    const users = parsePasswd(FIXTURE);
    expect(users).toContainEqual({ name: "utsav", uid: 1000, gid: 1000, home: "/home/utsav", shell: "/bin/bash" });
    expect(users).toContainEqual({ name: "work", uid: 1001, gid: 1001, home: "/home/work", shell: "/bin/zsh" });
    expect(users).toContainEqual({ name: "customhome", uid: 1002, gid: 1002, home: "/data/custom", shell: "/bin/bash" });
    expect(users.find((u) => u.name === "baduid")).toBeUndefined();
    expect(users.find((u) => u.name === "")).toBeUndefined();
    expect(users.find((u) => u.name === "this line has no colons at all")).toBeUndefined();
  });

  it("never throws on garbage", () => {
    expect(parsePasswd("")).toEqual([]);
    expect(parsePasswd("\n\n:::\n")).toEqual([]);
  });
});

describe("filterCandidateUsers", () => {
  it("keeps uid >= 1000 humans, drops system/service accounts", () => {
    const names = filterCandidateUsers(parsePasswd(FIXTURE), { currentUid: 1000 }).map((u) => u.name);
    expect(names).toEqual(expect.arrayContaining(["utsav", "work", "customhome"]));
    expect(names).not.toContain("root");
    expect(names).not.toContain("daemon");
    expect(names).not.toContain("nobody");
    expect(names).not.toContain("svc-deploy");
    expect(names).not.toContain("appsvc");
    expect(names).not.toContain("disabled");
  });

  it("always includes the current user even below the threshold or with a non-interactive shell", () => {
    const odd = ["admin:x:500:500:Admin:/home/admin:/bin/bash", "disabled:x:1001:1001::/home/disabled:/bin/false", "utsav:x:1000:1000::/home/utsav:/bin/bash"].join("\n");
    const names = filterCandidateUsers(parsePasswd(odd), { currentUid: 500 }).map((u) => u.name);
    expect(names).toContain("admin");
    expect(names).toContain("utsav");
    expect(filterCandidateUsers(parsePasswd(odd), { currentUid: 1001 }).map((u) => u.name)).toContain("disabled");
  });

  it("supports an overridable uid threshold for odd distro schemes", () => {
    const odd = ["admin:x:500:500:Admin:/home/admin:/bin/bash"].join("\n");
    expect(filterCandidateUsers(parsePasswd(odd), { currentUid: 0, minUid: 500 }).map((u) => u.name)).toContain("admin");
    expect(filterCandidateUsers(parsePasswd(odd), { currentUid: 0 }).map((u) => u.name)).not.toContain("admin");
  });

  it("marks the current user", () => {
    const users = filterCandidateUsers(parsePasswd(FIXTURE), { currentUid: 1001 });
    expect(users.find((u) => u.name === "work")).toMatchObject({ isCurrent: true });
    expect(users.find((u) => u.name === "utsav")).toMatchObject({ isCurrent: false });
  });
});

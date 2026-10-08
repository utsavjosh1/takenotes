import { describe, expect, it } from "vitest";
import {
  ConnectionStore,
  connectionKeyFor,
  connectionStatusForHelperState,
  workspaceConnectionFor,
} from "@takenotes/desktop/main/wsl/connections";

describe("connectionKeyFor", () => {
  it("builds a stable key for distro + user", () => {
    expect(connectionKeyFor("Ubuntu", "utsav")).toBe("Ubuntu\0utsav");
    expect(connectionKeyFor("Ubuntu", "utsav")).toBe(connectionKeyFor("Ubuntu", "utsav"));
  });

  it("accepts distro names with spaces", () => {
    expect(() => connectionKeyFor("My Distro", "utsav")).not.toThrow();
  });

  it("keeps same-distro different-user identities distinct", () => {
    expect(connectionKeyFor("Ubuntu", "utsav")).not.toBe(connectionKeyFor("Ubuntu", "work"));
  });

  it("keeps same-user different-distro identities distinct", () => {
    expect(connectionKeyFor("Ubuntu", "utsav")).not.toBe(connectionKeyFor("Debian", "utsav"));
  });

  it("rejects hostile identities before anything reaches spawn", () => {
    expect(() => connectionKeyFor("", "utsav")).toThrow();
    expect(() => connectionKeyFor("Ubuntu", "")).toThrow();
    expect(() => connectionKeyFor("a/b", "utsav")).toThrow();
    expect(() => connectionKeyFor("Ubuntu", "a b")).toThrow();
    expect(() => connectionKeyFor("Ubuntu\0x", "utsav")).toThrow();
    expect(() => connectionKeyFor(" Ubuntu", "utsav")).toThrow();
  });
});

describe("connectionStatusForHelperState", () => {
  it("projects both supervisor state shapes onto connection status", () => {
    expect(connectionStatusForHelperState("starting")).toBe("connecting");
    expect(connectionStatusForHelperState("handshake")).toBe("connecting");
    expect(connectionStatusForHelperState("connected")).toBe("connected");
    expect(connectionStatusForHelperState("disconnected")).toBe("disconnected");
    expect(connectionStatusForHelperState("incompatible")).toBe("incompatible");
    expect(connectionStatusForHelperState("failed")).toBe("failed");
  });
});

describe("workspaceConnectionFor", () => {
  it("maps onto the renderer WorkspaceInfo.connection union", () => {
    expect(workspaceConnectionFor("connected")).toBe("connected");
    expect(workspaceConnectionFor("connecting")).toBe("reconnecting");
    expect(workspaceConnectionFor("reconnecting")).toBe("reconnecting");
    expect(workspaceConnectionFor("disconnected")).toBe("disconnected");
    expect(workspaceConnectionFor("failed")).toBe("failed");
    expect(workspaceConnectionFor("incompatible")).toBe("failed");
  });
});

describe("ConnectionStore", () => {
  it("connect → connected lifecycle for one identity", () => {
    const store = new ConnectionStore();
    const key = store.markConnecting("Ubuntu", "utsav");
    expect(store.get("Ubuntu", "utsav")).toEqual({ id: key, distro: "Ubuntu", linuxUser: "utsav", status: "connecting" });
    expect(store.markConnected("Ubuntu", "utsav")).toBe(true);
    expect(store.get("Ubuntu", "utsav")?.status).toBe("connected");
  });

  it("one connection exposes many workspaces; closing one keeps the record", () => {
    const store = new ConnectionStore();
    store.markConnecting("Ubuntu", "utsav");
    store.markConnected("Ubuntu", "utsav");
    const key = store.attachWorkspace("Ubuntu", "utsav", "ws-1");
    store.attachWorkspace("Ubuntu", "utsav", "ws-2");
    expect(store.getForWorkspace("ws-1")?.id).toBe(key);
    expect(store.getForWorkspace("ws-2")?.id).toBe(key);
    expect(store.detachWorkspace("ws-1")).toBe(key);
    expect(store.getForWorkspace("ws-1")).toBeUndefined();
    expect(store.getForWorkspace("ws-2")?.status).toBe("connected");
  });

  it("closing the last workspace never deletes the record", () => {
    const store = new ConnectionStore();
    store.markConnecting("Ubuntu", "utsav");
    store.markConnected("Ubuntu", "utsav");
    store.attachWorkspace("Ubuntu", "utsav", "ws-1");
    store.detachWorkspace("ws-1");
    expect(store.get("Ubuntu", "utsav")).toMatchObject({ distro: "Ubuntu", linuxUser: "utsav", status: "connected" });
    expect(store.list()).toHaveLength(1);
  });

  it("keeps per-user records isolated on one distro", () => {
    const store = new ConnectionStore();
    store.markConnecting("Ubuntu", "utsav");
    store.markConnecting("Ubuntu", "work");
    expect(store.list()).toHaveLength(2);
    store.markConnected("Ubuntu", "utsav");
    expect(store.get("Ubuntu", "work")?.status).toBe("connecting");
  });

  it("rejects illegal status edges without mutating", () => {
    const store = new ConnectionStore();
    store.markConnecting("Ubuntu", "utsav");
    // connecting → connected is legal; connected → failed skips reconnect.
    expect(store.markConnected("Ubuntu", "utsav")).toBe(true);
    expect(store.setStatus("Ubuntu", "utsav", "failed")).toBe(false);
    expect(store.get("Ubuntu", "utsav")?.status).toBe("connected");
    // disconnected → connected without connecting is illegal.
    expect(store.setStatus("Ubuntu", "utsav", "disconnected")).toBe(true);
    expect(store.setStatus("Ubuntu", "utsav", "connected")).toBe(false);
    // failed → connecting (retry) is legal.
    expect(store.setStatus("Ubuntu", "utsav", "connecting")).toBe(true);
    expect(store.setStatus("Ubuntu", "utsav", "failed")).toBe(true);
  });

  it("ignores unknown keys and invalid identities quietly", () => {
    const store = new ConnectionStore();
    expect(store.setStatusByKey("nope", "connected")).toBe(false);
    expect(store.setStatus("Ubuntu", "no such user!!", "connected")).toBe(false);
    expect(store.get("Ubuntu", "no such user!!")).toBeUndefined();
    expect(store.detachWorkspace("ghost")).toBeNull();
  });
});

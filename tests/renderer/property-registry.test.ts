import { describe, expect, it } from "vitest";
import { loadPropertyRegistry, savePropertyRegistry, type RegistryStorage } from "@takenotes/desktop/renderer/index/property-registry";

function memStore(seed?: Record<string, unknown>): RegistryStorage & { dump(): unknown } {
  let data = seed === undefined ? undefined : JSON.stringify(seed);
  return {
    getItem: () => data ?? null,
    setItem: (_k, v) => {
      data = v;
    },
    dump: () => (data === undefined ? undefined : JSON.parse(data)),
  };
}

describe("property registry store (app-data, keyed by workspace)", () => {
  it("round-trips one workspace and isolates another", () => {
    const store = memStore();
    savePropertyRegistry(store, "ws-a", { due: "date", count: "number" });
    expect(loadPropertyRegistry(store, "ws-a")).toEqual({ due: "date", count: "number" });
    expect(loadPropertyRegistry(store, "ws-b")).toEqual({});
    savePropertyRegistry(store, "ws-b", { tags: "text" });
    expect(loadPropertyRegistry(store, "ws-a")).toEqual({ due: "date", count: "number" });
    expect(loadPropertyRegistry(store, "ws-b")).toEqual({ tags: "text" });
  });

  it("corrupt storage degrades to defaults; invalid entries drop on save", () => {
    const broken = memStore({ "ws-a": { due: "someday", count: 3 } });
    expect(loadPropertyRegistry(broken, "ws-a")).toEqual({});
    const store = memStore();
    savePropertyRegistry(store, "ws-a", { due: "someday", tags: "tags" } as unknown as { due: "date"; tags: "tags" });
    expect(loadPropertyRegistry(store, "ws-a")).toEqual({ tags: "tags" });
  });

  it("missing storage never throws", () => {
    expect(loadPropertyRegistry(undefined, "ws")).toEqual({});
    savePropertyRegistry(undefined, "ws", { due: "date" });
  });
});

import { describe, expect, it } from "vitest";
import { FrameDecoder, encodeFrame } from "../../src/shared/protocol";
import { MAX_FRAME_BYTES } from "../../src/shared/protocol-version";

describe("protocol framing", () => {
  it("decodes one complete frame", () => {
    const decoder = new FrameDecoder(MAX_FRAME_BYTES);
    const frame = encodeFrame({ requestId: "1", ok: true });
    const { frames, error } = decoder.push(frame);
    expect(error).toBeUndefined();
    expect(frames).toHaveLength(1);
  });

  it("handles partial header and partial body", () => {
    const decoder = new FrameDecoder(MAX_FRAME_BYTES);
    const frame = encodeFrame({ hello: "world" });
    expect(decoder.push(frame.subarray(0, 2)).frames).toHaveLength(0);
    expect(decoder.push(frame.subarray(2, 5)).frames).toHaveLength(0);
    const { frames } = decoder.push(frame.subarray(5));
    expect(frames).toHaveLength(1);
  });

  it("handles multiple frames at once", () => {
    const decoder = new FrameDecoder(MAX_FRAME_BYTES);
    const a = encodeFrame({ n: 1 });
    const b = encodeFrame({ n: 2 });
    const { frames } = decoder.push(Buffer.concat([a, b]));
    expect(frames).toHaveLength(2);
  });

  it("rejects zero-length frames", () => {
    const decoder = new FrameDecoder(MAX_FRAME_BYTES);
    const header = Buffer.alloc(4);
    header.writeUInt32BE(0, 0);
    const { error } = decoder.push(header);
    expect(error).toMatch(/zero-length/);
  });

  it("rejects oversized frames", () => {
    const decoder = new FrameDecoder(16);
    const frame = encodeFrame({ data: "x".repeat(1024) });
    const { error } = decoder.push(frame);
    expect(error).toMatch(/too large/);
  });

  it("reports invalid JSON", () => {
    const decoder = new FrameDecoder(MAX_FRAME_BYTES);
    const body = Buffer.from("not json{", "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32BE(body.length, 0);
    const { error } = decoder.push(Buffer.concat([header, body]));
    expect(error).toMatch(/invalid JSON/);
  });
});

/**
 * Export native app icons from the SVG brand source.
 *
 * Source of truth: `public/takenotes-app-icon-light.svg` (paper tile — reads
 * on light and dark taskbars/docks alike). The dark tile stays web-only.
 * Bare `takenotes-symbol-*.svg` marks stay in-app, never binaries.
 *
 * Outputs (see electron-builder.yml `directories.buildResources`):
 *   build/icon.png  (512px — Linux + BrowserWindow runtime icon)
 *   build/icon.ico  (16–256px PNG-compressed entries — exe, installer)
 *   build/icon.icns (16–1024px incl. retina variants — macOS)
 *   apps/mobile/assets/icon.png (1024px Expo master — same brand source)
 *
 * Needs `sharp` (SVG rasterizer): `npm i -D sharp` (kept out of the default
 * install on purpose — icon export runs rarely, packaging never needs it).
 * ICO/ICNS writers are hand-rolled below so no native-icon dep is needed.
 *
 * Usage: `npm run icons:export`
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SVG = join(ROOT, "public", "takenotes-app-icon-light.svg");

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error("export-app-icons: `sharp` is not installed. Run `npm i -D sharp`, then retry.");
  process.exit(1);
}

async function png(size) {
  return sharp(SVG, { density: 512 }).resize(size, size).png().toBuffer();
}

/** ICO with PNG-compressed entries (accepted Vista+ and by all packagers). */
function ico(buffers) {
  const n = buffers.length;
  const header = Buffer.alloc(6 + n * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(n, 4);
  let offset = 6 + n * 16;
  const parts = [header];
  buffers.forEach(({ size, png }, i) => {
    const o = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, o);
    header.writeUInt8(size >= 256 ? 0 : size, o + 1);
    header.writeUInt8(0, o + 2);
    header.writeUInt8(0, o + 3);
    header.writeUInt16LE(1, o + 4);
    header.writeUInt16LE(32, o + 6);
    header.writeUInt32LE(png.length, o + 8);
    header.writeUInt32LE(offset, o + 12);
    offset += png.length;
    parts.push(png);
  });
  return Buffer.concat(parts);
}

/** ICNS, modern set incl. retina variants (PNG payloads). */
const ICNS_TYPES = [
  ["icp4", 16], ["icp5", 32], ["icp6", 64],
  ["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024],
  ["ic11", 32], ["ic12", 64], ["ic13", 256], ["ic14", 128],
];

function icns(entries) {
  const chunks = entries.map(({ type, png }) => {
    const h = Buffer.alloc(8);
    h.write(type, 0, 4, "ascii");
    h.writeUInt32BE(8 + png.length, 4);
    return Buffer.concat([h, png]);
  });
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write("icns", 0, 4, "ascii");
  head.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([head, body]);
}

const write = (rel, buf) => {
  writeFileSync(join(ROOT, rel), buf);
  console.log(`${rel} (${buf.length} bytes)`);
};

write("build/icon.png", await png(512));

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
write("build/icon.ico", ico(await Promise.all(icoSizes.map(async (size) => ({ size, png: await png(size) })))));

write(
  "build/icon.icns",
  icns(await Promise.all(ICNS_TYPES.map(async ([type, size]) => ({ type, png: await png(size) })))),
);

write("apps/mobile/assets/icon.png", await png(1024));

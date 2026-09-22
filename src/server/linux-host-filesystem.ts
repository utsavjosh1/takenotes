/**
 * Linux HostFilesystem for the HTTP server host (Gate B).
 *
 * Plain Node filesystem IO behind the core HostFilesystem port. All note
 * policy stays in `src/core`; this adapter only touches bytes and stats on
 * the server's local Linux filesystem.
 */
import { promises as fs } from "node:fs";
import type { HostFilesystem, HostFileStat } from "../core/ports/host-filesystem.js";

function toStat(st: import("node:fs").Stats): HostFileStat {
  return {
    size: st.size,
    mtimeMs: st.mtimeMs,
    isDirectory: st.isDirectory(),
    isFile: st.isFile(),
    isSymlink: st.isSymbolicLink(),
  };
}

export class LinuxHostFilesystem implements HostFilesystem {
  readBytes(absolutePath: string): Promise<Buffer> {
    return fs.readFile(absolutePath);
  }

  async writeBytesAtomic(absolutePath: string, bytes: Buffer): Promise<void> {
    const tmp = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      await fs.writeFile(tmp, bytes, { flag: "wx" });
      const fh = await fs.open(tmp, "r+");
      try {
        await fh.sync();
      } finally {
        await fh.close();
      }
      await fs.rename(tmp, absolutePath);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }

  async stat(absolutePath: string): Promise<HostFileStat> {
    return toStat(await fs.stat(absolutePath));
  }

  async lstat(absolutePath: string): Promise<HostFileStat> {
    return toStat(await fs.lstat(absolutePath));
  }

  realpath(absolutePath: string): Promise<string | null> {
    return fs.realpath(absolutePath).catch(() => null);
  }
}

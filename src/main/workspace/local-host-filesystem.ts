/**
 * Local HostFilesystem implementation (Gate A).
 *
 * `node:fs` adapter for `CoreNoteService` on Windows/macOS/Linux local
 * workspaces. No policy here — validation, confinement decisions, and
 * revision semantics live in `src/core`. This file is pure host IO.
 */
import { promises as fs } from "node:fs";
import type { HostFilesystem, HostFileStat } from "../../core/ports/host-filesystem.js";

function toStat(st: import("node:fs").Stats): HostFileStat {
  return {
    size: st.size,
    mtimeMs: st.mtimeMs,
    isDirectory: st.isDirectory(),
    isFile: st.isFile(),
    isSymlink: st.isSymbolicLink(),
  };
}

export class LocalHostFilesystem implements HostFilesystem {
  async readBytes(absolutePath: string): Promise<Buffer> {
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

  async realpath(absolutePath: string): Promise<string | null> {
    return fs.realpath(absolutePath).catch(() => null);
  }
}

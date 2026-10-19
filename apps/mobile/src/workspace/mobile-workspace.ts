/**
 * M0 — MobileWorkspace (deep module, small interface).
 *
 * The single seam every mobile screen crosses: open/read/update over a
 * `mobile-local` sandbox root. All policy (validation, confinement,
 * BOM/newlines, `expectedRevision` CONFLICT) lives in `CoreNoteService` —
 * this module only resolves the workspace root and forwards.
 *
 * Interface: 3 methods (`read`/`update`/`create`) + `id`. Invariants:
 *  - `root` is an absolute sandbox URI (e.g. `file://…/takenotes/`).
 *  - kind is always `mobile-local` (POSIX rules; no Windows reserved names).
 *  - Every update carries `expectedRevision`; mismatch → `CONFLICT`, never
 *    a silent overwrite — same contract as desktop Gate A.
 */

import type { FileReadResult, FileRevision } from "@takenotes/contracts/ipc";
import type { AppError } from "@takenotes/contracts/errors";
import { CoreNoteService, type CoreWorkspace } from "@takenotes/core/services/note-service";
import type { HostFilesystem } from "@takenotes/core/ports/host-filesystem";
import type { DirectoryListing } from "../adapters/listing.js";

export type MobileWorkspaceHandle = {
  readonly workspaceId: string;
  readonly root: string;
};

export class MobileWorkspace {
  private readonly service: CoreNoteService;
  private readonly ws: CoreWorkspace;

  constructor(
    private readonly handle: MobileWorkspaceHandle,
    private readonly host: HostFilesystem & DirectoryListing,
  ) {
    this.service = new CoreNoteService(host);
    this.ws = { root: handle.root, kind: "mobile-local" };
  }

  get id(): string {
    return this.handle.workspaceId;
  }

  read(relativePath: string): Promise<{ result: FileReadResult } | { error: AppError }> {
    return this.service.read(this.ws, relativePath);
  }

  update(
    relativePath: string,
    content: string,
    expectedRevision: string,
    newlineStyle: "lf" | "crlf",
    hadBom: boolean,
  ): Promise<{ revision: FileRevision } | { error: AppError }> {
    return this.service.update(this.ws, relativePath, content, expectedRevision, newlineStyle, hadBom);
  }

  /** Create a new note, ensuring parent dirs first. Fails `ALREADY_EXISTS`
   *  when present — never overwrites. Needed for Daily notes
   *  (`Daily/YYYY/MM/…` parents never exist) and first-run `Inbox.md`. */
  async create(relativePath: string, content = ""): Promise<{ revision: FileRevision } | { error: AppError }> {
    const parent = relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : "";
    if (parent) {
      const parts = parent.split("/");
      let cursor = this.handle.root.replace(/\/+$/, "");
      for (const part of parts) {
        cursor += `/${part}`;
        await this.host.ensureDirectory(cursor);
      }
    }
    return this.service.create(this.ws, relativePath, content);
  }
}
